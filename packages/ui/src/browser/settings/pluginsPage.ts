import type { IIPCRenderer } from '@gho-work/platform/common';
import { IPC_CHANNELS } from '@gho-work/platform/common';
import { Widget } from '../widget.js';
import { h } from '../dom.js';

// DTOs — defined locally to avoid pulling in Node.js code from @gho-work/platform
interface CatalogEntryDTO {
  name: string;
  description: string;
  version: string;
  author?: { name: string; email?: string };
  keywords?: string[];
  category?: string;
  hasSkills: boolean;
  hasMcpServers: boolean;
}

interface InstalledPluginDTO {
  name: string;
  version: string;
  enabled: boolean;
  skillCount: number;
  mcpServerNames: string[];
}

interface InstallProgressDTO {
  name: string;
  status: string;
  message: string;
}

const CATEGORIES = ['All', 'Integrations', 'Code Intelligence', 'Workflows'];

export class PluginsPage extends Widget {
  private readonly _ipc: IIPCRenderer;
  private _catalog: CatalogEntryDTO[] = [];
  private _installed: InstalledPluginDTO[] = [];
  private _activeTab: 'discover' | 'installed' = 'discover';
  private _searchQuery = '';
  private _activeCategory = 'All';
  private _installing = new Map<string, string>(); // name → progress message

  // DOM refs
  private readonly _discoverTab: HTMLElement;
  private readonly _installedTab: HTMLElement;
  private readonly _contentEl: HTMLElement;

  constructor(ipc: IIPCRenderer) {
    const layout = h('div.settings-page-plugins', [
      h('h2.settings-page-title@title'),
      h('p.settings-page-subtitle@subtitle'),
      h('div.plugin-tab-bar@tabBar'),
      h('div.plugin-content@content'),
    ]);
    super(layout.root);
    this._ipc = ipc;

    layout.title.textContent = 'Plugins';
    layout.subtitle.textContent = 'Browse and install plugins from the marketplace';

    // Tab buttons
    this._discoverTab = document.createElement('button');
    this._discoverTab.className = 'plugin-tab active';
    this._discoverTab.textContent = 'Discover';
    this.listen(this._discoverTab, 'click', () => this._switchTab('discover'));

    this._installedTab = document.createElement('button');
    this._installedTab.className = 'plugin-tab';
    this._installedTab.textContent = 'Installed (0)';
    this.listen(this._installedTab, 'click', () => this._switchTab('installed'));

    layout.tabBar.appendChild(this._discoverTab);
    layout.tabBar.appendChild(this._installedTab);

    this._contentEl = layout.content;

    // IPC: plugin list changed
    const onChanged = (...args: unknown[]) => {
      this._installed = args[0] as InstalledPluginDTO[];
      this._updateInstalledCount();
      if (this._activeTab === 'installed') {
        this._renderInstalled();
      }
      if (this._activeTab === 'discover') {
        this._renderDiscover();
      }
    };
    this._ipc.on(IPC_CHANNELS.PLUGIN_CHANGED, onChanged);
    this._register({ dispose: () => this._ipc.removeListener(IPC_CHANNELS.PLUGIN_CHANGED, onChanged) });

    // IPC: install progress
    const onProgress = (...args: unknown[]) => {
      const progress = args[0] as InstallProgressDTO;
      if (progress.status === 'done' || progress.status === 'error') {
        this._installing.delete(progress.name);
      } else {
        this._installing.set(progress.name, progress.message);
      }
      if (this._activeTab === 'discover') {
        this._renderDiscover();
      }
    };
    this._ipc.on(IPC_CHANNELS.PLUGIN_INSTALL_PROGRESS, onProgress);
    this._register({ dispose: () => this._ipc.removeListener(IPC_CHANNELS.PLUGIN_INSTALL_PROGRESS, onProgress) });
  }

  async load(): Promise<void> {
    try {
      const [catalog, installed] = await Promise.all([
        this._ipc.invoke<CatalogEntryDTO[]>(IPC_CHANNELS.PLUGIN_CATALOG),
        this._ipc.invoke<InstalledPluginDTO[]>(IPC_CHANNELS.PLUGIN_LIST),
      ]);
      this._catalog = catalog;
      this._installed = installed;
      this._updateInstalledCount();
      this._renderDiscover();
    } catch (err) {
      console.error('[PluginsPage] Failed to load:', err);
      this._contentEl.textContent = 'Failed to load plugins. Check your connection.';
    }
  }

  private _switchTab(tab: 'discover' | 'installed'): void {
    this._activeTab = tab;

    if (tab === 'discover') {
      this._discoverTab.classList.add('active');
      this._installedTab.classList.remove('active');
      this._renderDiscover();
    } else {
      this._installedTab.classList.add('active');
      this._discoverTab.classList.remove('active');
      this._renderInstalled();
    }
  }

  private _updateInstalledCount(): void {
    this._installedTab.textContent = `Installed (${this._installed.length})`;
  }

  private _renderDiscover(): void {
    this._clearContent();

    // Search input
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'plugin-search-input';
    searchInput.placeholder = 'Search plugins...';
    searchInput.value = this._searchQuery;
    searchInput.setAttribute('aria-label', 'Search plugins');
    this.listen(searchInput, 'input', () => {
      this._searchQuery = searchInput.value;
      this._renderDiscover();
    });
    this._contentEl.appendChild(searchInput);

    // Category chips
    const chipsEl = document.createElement('div');
    chipsEl.className = 'plugin-category-chips';
    for (const category of CATEGORIES) {
      const chip = document.createElement('button');
      chip.className = 'plugin-category-chip' + (this._activeCategory === category ? ' active' : '');
      chip.textContent = category;
      this.listen(chip, 'click', () => {
        this._activeCategory = category;
        this._renderDiscover();
      });
      chipsEl.appendChild(chip);
    }
    this._contentEl.appendChild(chipsEl);

    // Filter catalog
    const query = this._searchQuery.toLowerCase();
    const filtered = this._catalog.filter(entry => {
      const matchesSearch =
        !query ||
        entry.name.toLowerCase().includes(query) ||
        entry.description.toLowerCase().includes(query);
      const matchesCategory =
        this._activeCategory === 'All' || entry.category === this._activeCategory;
      return matchesSearch && matchesCategory;
    });

    // Plugin card grid
    const grid = document.createElement('div');
    grid.className = 'plugin-card-grid';

    for (const entry of filtered) {
      const card = this._buildCard(entry);
      grid.appendChild(card);
    }

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'plugin-empty-state';
      empty.textContent = 'No plugins match your search.';
      this._contentEl.appendChild(empty);
    } else {
      this._contentEl.appendChild(grid);
    }

    // Footer: last updated + refresh
    const footer = document.createElement('div');
    footer.className = 'plugin-discover-footer';

    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'plugin-refresh-btn';
    refreshBtn.textContent = '\u21bb Refresh';
    refreshBtn.setAttribute('aria-label', 'Refresh plugin catalog');
    this.listen(refreshBtn, 'click', () => void this._refreshCatalog());
    footer.appendChild(refreshBtn);

    this._contentEl.appendChild(footer);
  }

  private _buildCard(entry: CatalogEntryDTO): HTMLElement {
    const card = document.createElement('div');
    card.className = 'plugin-card';

    const header = document.createElement('div');
    header.className = 'plugin-card-header';

    const info = document.createElement('div');

    const name = document.createElement('div');
    name.className = 'plugin-card-name';
    name.textContent = entry.name;
    info.appendChild(name);

    const meta = document.createElement('div');
    meta.className = 'plugin-card-meta';
    const authorName = entry.author?.name ?? 'Unknown';
    meta.textContent = `by ${authorName} \u00b7 v${entry.version}`;
    info.appendChild(meta);

    header.appendChild(info);

    // Install button / state
    const isInstalled = this._installed.some(p => p.name === entry.name);
    const progressMessage = this._installing.get(entry.name);

    if (isInstalled) {
      const installedLabel = document.createElement('span');
      installedLabel.className = 'plugin-card-installed-label';
      installedLabel.textContent = '\u2713 Installed';
      header.appendChild(installedLabel);
    } else if (progressMessage !== undefined) {
      const installBtn = document.createElement('button');
      installBtn.className = 'plugin-card-install-btn';
      installBtn.textContent = `Installing\u2026`;
      installBtn.disabled = true;
      installBtn.setAttribute('aria-label', `Installing ${entry.name}: ${progressMessage}`);
      header.appendChild(installBtn);
    } else {
      const installBtn = document.createElement('button');
      installBtn.className = 'plugin-card-install-btn';
      installBtn.textContent = 'Install';
      installBtn.setAttribute('aria-label', `Install ${entry.name}`);
      this.listen(installBtn, 'click', () => void this._install(entry.name));
      header.appendChild(installBtn);
    }

    card.appendChild(header);

    const desc = document.createElement('div');
    desc.className = 'plugin-card-desc';
    desc.textContent = entry.description;
    card.appendChild(desc);

    const badges = document.createElement('div');
    badges.className = 'plugin-card-badges';

    if (entry.hasMcpServers) {
      const mcpBadge = document.createElement('span');
      mcpBadge.className = 'plugin-badge mcp';
      mcpBadge.textContent = 'MCP';
      badges.appendChild(mcpBadge);
    }

    if (entry.hasSkills) {
      const skillsBadge = document.createElement('span');
      skillsBadge.className = 'plugin-badge skills';
      skillsBadge.textContent = 'Skills';
      badges.appendChild(skillsBadge);
    }

    card.appendChild(badges);

    return card;
  }

  private _renderInstalled(): void {
    this._clearContent();

    if (this._installed.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'plugin-empty-state';
      empty.textContent = 'No plugins installed. Browse the Discover tab to get started.';
      this._contentEl.appendChild(empty);
      return;
    }

    for (const plugin of this._installed) {
      const item = document.createElement('div');
      item.className = 'plugin-installed-item';

      const info = document.createElement('div');
      info.className = 'plugin-installed-info';

      const header = document.createElement('div');
      header.className = 'plugin-installed-header';

      const nameEl = document.createElement('span');
      nameEl.className = 'plugin-installed-name';
      nameEl.textContent = plugin.name;
      header.appendChild(nameEl);

      const versionEl = document.createElement('span');
      versionEl.className = 'plugin-installed-version';
      versionEl.textContent = `v${plugin.version}`;
      header.appendChild(versionEl);

      if (plugin.mcpServerNames.length > 0) {
        const mcpBadge = document.createElement('span');
        mcpBadge.className = 'plugin-badge mcp';
        mcpBadge.textContent = 'MCP';
        header.appendChild(mcpBadge);
      }

      if (plugin.skillCount > 0) {
        const skillsBadge = document.createElement('span');
        skillsBadge.className = 'plugin-badge skills';
        skillsBadge.textContent = 'Skills';
        header.appendChild(skillsBadge);
      }

      info.appendChild(header);

      const details = document.createElement('div');
      details.className = 'plugin-installed-details';
      details.textContent = `${plugin.skillCount} skills \u00b7 ${plugin.mcpServerNames.length} MCP servers`;
      info.appendChild(details);

      item.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'plugin-installed-actions';

      // Enable/disable toggle
      const toggle = document.createElement('div');
      toggle.className = 'plugin-toggle';
      toggle.setAttribute('role', 'switch');
      toggle.setAttribute('aria-checked', String(plugin.enabled));
      toggle.setAttribute('aria-label', `${plugin.enabled ? 'Disable' : 'Enable'} ${plugin.name}`);
      toggle.setAttribute('tabindex', '0');

      const knob = document.createElement('div');
      knob.className = 'plugin-toggle-knob';
      toggle.appendChild(knob);

      const handleToggle = () => {
        const currentlyEnabled = toggle.getAttribute('aria-checked') === 'true';
        void this._togglePlugin(plugin.name, !currentlyEnabled);
      };
      this.listen(toggle, 'click', handleToggle);
      this.listen(toggle, 'keydown', (e: Event) => {
        const ke = e as KeyboardEvent;
        if (ke.key === 'Enter' || ke.key === ' ') {
          ke.preventDefault();
          handleToggle();
        }
      });

      actions.appendChild(toggle);

      // Uninstall button
      const uninstallBtn = document.createElement('button');
      uninstallBtn.className = 'plugin-uninstall-btn';
      uninstallBtn.textContent = 'Uninstall';
      uninstallBtn.setAttribute('aria-label', `Uninstall ${plugin.name}`);
      this.listen(uninstallBtn, 'click', () => void this._uninstall(plugin.name));
      actions.appendChild(uninstallBtn);

      item.appendChild(actions);
      this._contentEl.appendChild(item);
    }
  }

  private _clearContent(): void {
    while (this._contentEl.firstChild) {
      this._contentEl.removeChild(this._contentEl.firstChild);
    }
  }

  private async _install(name: string): Promise<void> {
    try {
      this._installing.set(name, 'Starting...');
      this._renderDiscover();
      await this._ipc.invoke(IPC_CHANNELS.PLUGIN_INSTALL, { name });
    } catch (err) {
      console.error('[PluginsPage] Install failed:', err);
      this._installing.delete(name);
      this._renderDiscover();
    }
  }

  private async _uninstall(name: string): Promise<void> {
    try {
      await this._ipc.invoke(IPC_CHANNELS.PLUGIN_UNINSTALL, { name });
    } catch (err) {
      console.error('[PluginsPage] Uninstall failed:', err);
    }
  }

  private async _togglePlugin(name: string, enable: boolean): Promise<void> {
    try {
      const channel = enable ? IPC_CHANNELS.PLUGIN_ENABLE : IPC_CHANNELS.PLUGIN_DISABLE;
      await this._ipc.invoke(channel, { name });
    } catch (err) {
      console.error('[PluginsPage] Toggle failed:', err);
    }
  }

  private async _refreshCatalog(): Promise<void> {
    try {
      const catalog = await this._ipc.invoke<CatalogEntryDTO[]>(IPC_CHANNELS.PLUGIN_CATALOG, { forceRefresh: true });
      this._catalog = catalog;
      this._renderDiscover();
    } catch (err) {
      console.error('[PluginsPage] Refresh failed:', err);
    }
  }
}
