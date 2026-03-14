import type { IIPCRenderer } from '@gho-work/platform/common';
import { IPC_CHANNELS } from '@gho-work/platform/common';
import { Widget } from '../widget.js';
import { h } from '../dom.js';

// DTOs — defined locally to avoid pulling in Node.js code from @gho-work/platform
interface CatalogEntryDTO {
  name: string;
  description: string;
  version?: string;
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

interface LogEntry {
  timestamp: string;
  name: string;
  message: string;
  level: 'info' | 'error';
}

export class PluginsPage extends Widget {
  private readonly _ipc: IIPCRenderer;
  private _catalog: CatalogEntryDTO[] = [];
  private _installed: InstalledPluginDTO[] = [];
  private _activeTab: 'discover' | 'installed' | 'log' = 'discover';
  private _searchQuery = '';
  private _activeCategory = 'All';
  private _installing = new Map<string, string>(); // name → progress message
  private _installErrors = new Map<string, string>(); // name → error message
  private _logs: LogEntry[] = [];

  // DOM refs — stable across renders
  private readonly _discoverTab: HTMLElement;
  private readonly _installedTab: HTMLElement;
  private readonly _logTab: HTMLElement;
  private readonly _controlsEl: HTMLElement;
  private readonly _scrollEl: HTMLElement;

  // Stable search input (not recreated on each render)
  private _searchInput: HTMLInputElement | undefined;
  private _chipsEl: HTMLElement | undefined;

  constructor(ipc: IIPCRenderer) {
    const layout = h('div.settings-page-plugins', [
      h('h2.settings-page-title@title'),
      h('p.settings-page-subtitle@subtitle'),
      h('div.plugin-tab-bar@tabBar'),
      h('div.plugin-controls@controls'),
      h('div.plugin-scroll@scroll'),
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

    this._logTab = document.createElement('button');
    this._logTab.className = 'plugin-tab';
    this._logTab.textContent = 'Log';
    this.listen(this._logTab, 'click', () => this._switchTab('log'));

    layout.tabBar.appendChild(this._discoverTab);
    layout.tabBar.appendChild(this._installedTab);
    layout.tabBar.appendChild(this._logTab);

    this._controlsEl = layout.controls;
    this._scrollEl = layout.scroll;

    // IPC: plugin list changed
    const onChanged = (...args: unknown[]) => {
      this._installed = args[0] as InstalledPluginDTO[];
      this._updateInstalledCount();
      if (this._activeTab === 'installed') {
        this._renderInstalled();
      }
      if (this._activeTab === 'discover') {
        this._renderDiscoverGrid();
      }
    };
    this._ipc.on(IPC_CHANNELS.PLUGIN_CHANGED, onChanged);
    this._register({ dispose: () => this._ipc.removeListener(IPC_CHANNELS.PLUGIN_CHANGED, onChanged) });

    // IPC: install progress
    const onProgress = (...args: unknown[]) => {
      const progress = args[0] as InstallProgressDTO;
      const now = new Date().toLocaleTimeString();

      if (progress.status === 'done') {
        this._installing.delete(progress.name);
        this._installErrors.delete(progress.name);
        this._addLog(progress.name, progress.message, 'info');
      } else if (progress.status === 'error') {
        this._installing.delete(progress.name);
        this._installErrors.set(progress.name, progress.message);
        this._addLog(progress.name, progress.message, 'error');
      } else {
        this._installing.set(progress.name, progress.message);
        this._installErrors.delete(progress.name);
        this._addLog(progress.name, progress.message, 'info');
      }

      if (this._activeTab === 'discover') {
        this._renderDiscoverGrid();
      }
      if (this._activeTab === 'log') {
        this._renderLog();
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
      this._showDiscover();
    } catch (err) {
      console.error('[PluginsPage] Failed to load:', err);
      this._scrollEl.textContent = 'Failed to load plugins. Check your connection.';
    }
  }

  // ---------------------------------------------------------------------------
  // Tab switching
  // ---------------------------------------------------------------------------

  private _switchTab(tab: 'discover' | 'installed' | 'log'): void {
    this._activeTab = tab;

    this._discoverTab.classList.toggle('active', tab === 'discover');
    this._installedTab.classList.toggle('active', tab === 'installed');
    this._logTab.classList.toggle('active', tab === 'log');

    if (tab === 'discover') {
      this._showDiscover();
    } else {
      this._clearControls();
      this._searchInput = undefined;
      this._chipsEl = undefined;
      if (tab === 'installed') {
        this._renderInstalled();
      } else {
        this._renderLog();
      }
    }
  }

  private _updateInstalledCount(): void {
    this._installedTab.textContent = `Installed (${this._installed.length})`;
  }

  // ---------------------------------------------------------------------------
  // Discover — controls (stable) + grid (dynamic)
  // ---------------------------------------------------------------------------

  private _showDiscover(): void {
    this._clearControls();
    this._buildDiscoverControls();
    this._renderDiscoverGrid();
  }

  /** Build the search input and category chips once. */
  private _buildDiscoverControls(): void {
    // Search input
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'plugin-search-input';
    searchInput.placeholder = 'Search plugins...';
    searchInput.value = this._searchQuery;
    searchInput.setAttribute('aria-label', 'Search plugins');
    this.listen(searchInput, 'input', () => {
      this._searchQuery = searchInput.value;
      this._renderDiscoverGrid();
    });
    this._controlsEl.appendChild(searchInput);
    this._searchInput = searchInput;

    // Category chips
    const chipsEl = document.createElement('div');
    chipsEl.className = 'plugin-category-chips';
    this._buildCategoryChips(chipsEl);
    this._controlsEl.appendChild(chipsEl);
    this._chipsEl = chipsEl;
  }

  /** Build category chips from catalog data. */
  private _buildCategoryChips(container: HTMLElement): void {
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    const categories = this._deriveCategories();
    for (const category of categories) {
      const chip = document.createElement('button');
      chip.className = 'plugin-category-chip' + (this._activeCategory === category ? ' active' : '');
      chip.textContent = category;
      this.listen(chip, 'click', () => {
        this._activeCategory = category;
        // Rebuild chips to update active state
        if (this._chipsEl) {
          this._buildCategoryChips(this._chipsEl);
        }
        this._renderDiscoverGrid();
      });
      container.appendChild(chip);
    }
  }

  /** Derive categories from catalog entries. */
  private _deriveCategories(): string[] {
    const seen = new Set<string>();
    for (const entry of this._catalog) {
      if (entry.category) {
        seen.add(entry.category);
      }
    }
    const sorted = Array.from(seen).sort();
    return ['All', ...sorted];
  }

  /** Render only the scrollable grid area (cards + footer). */
  private _renderDiscoverGrid(): void {
    this._clearScroll();

    // Filter catalog
    const query = this._searchQuery.toLowerCase();
    const filtered = this._catalog.filter(entry => {
      const matchesSearch =
        !query ||
        entry.name.toLowerCase().includes(query) ||
        entry.description.toLowerCase().includes(query) ||
        (entry.keywords ?? []).some(k => k.toLowerCase().includes(query));
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
      empty.textContent = query
        ? 'No plugins match your search.'
        : this._activeCategory !== 'All'
          ? `No plugins in "${this._activeCategory}" category.`
          : 'No plugins available.';
      this._scrollEl.appendChild(empty);
    } else {
      this._scrollEl.appendChild(grid);
    }

    // Footer: refresh
    const footer = document.createElement('div');
    footer.className = 'plugin-discover-footer';

    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'plugin-refresh-btn';
    refreshBtn.textContent = '\u21bb Refresh';
    refreshBtn.setAttribute('aria-label', 'Refresh plugin catalog');
    this.listen(refreshBtn, 'click', () => void this._refreshCatalog());
    footer.appendChild(refreshBtn);

    this._scrollEl.appendChild(footer);
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
    const versionText = entry.version ? `v${entry.version}` : '';
    meta.textContent = versionText
      ? `by ${authorName} \u00b7 ${versionText}`
      : `by ${authorName}`;
    info.appendChild(meta);

    header.appendChild(info);

    // Install button / state
    const isInstalled = this._installed.some(p => p.name === entry.name);
    const progressMessage = this._installing.get(entry.name);
    const errorMessage = this._installErrors.get(entry.name);

    if (isInstalled) {
      const installedLabel = document.createElement('span');
      installedLabel.className = 'plugin-card-installed-label';
      installedLabel.textContent = '\u2713 Installed';
      header.appendChild(installedLabel);
    } else if (progressMessage !== undefined) {
      const statusEl = document.createElement('div');
      statusEl.className = 'plugin-card-install-status';

      const installBtn = document.createElement('button');
      installBtn.className = 'plugin-card-install-btn';
      installBtn.textContent = 'Installing\u2026';
      installBtn.disabled = true;
      statusEl.appendChild(installBtn);

      const progressText = document.createElement('div');
      progressText.className = 'plugin-card-progress';
      progressText.textContent = progressMessage;
      statusEl.appendChild(progressText);

      header.appendChild(statusEl);
    } else if (errorMessage !== undefined) {
      const statusEl = document.createElement('div');
      statusEl.className = 'plugin-card-install-status';

      const retryBtn = document.createElement('button');
      retryBtn.className = 'plugin-card-install-btn plugin-card-retry-btn';
      retryBtn.textContent = 'Retry';
      this.listen(retryBtn, 'click', () => void this._install(entry.name));
      statusEl.appendChild(retryBtn);

      const errorText = document.createElement('div');
      errorText.className = 'plugin-card-error';
      errorText.textContent = errorMessage;
      statusEl.appendChild(errorText);

      header.appendChild(statusEl);
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

  // ---------------------------------------------------------------------------
  // Installed tab
  // ---------------------------------------------------------------------------

  private _renderInstalled(): void {
    this._clearScroll();

    if (this._installed.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'plugin-empty-state';
      empty.textContent = 'No plugins installed. Browse the Discover tab to get started.';
      this._scrollEl.appendChild(empty);
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

      if (plugin.version) {
        const versionEl = document.createElement('span');
        versionEl.className = 'plugin-installed-version';
        versionEl.textContent = `v${plugin.version}`;
        header.appendChild(versionEl);
      }

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
      this._scrollEl.appendChild(item);
    }
  }

  // ---------------------------------------------------------------------------
  // Log tab
  // ---------------------------------------------------------------------------

  private _renderLog(): void {
    this._clearScroll();

    if (this._logs.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'plugin-empty-state';
      empty.textContent = 'No activity yet. Install or manage a plugin to see log entries.';
      this._scrollEl.appendChild(empty);
      return;
    }

    const list = document.createElement('div');
    list.className = 'plugin-log-list';

    // Show newest first
    for (let i = this._logs.length - 1; i >= 0; i--) {
      const entry = this._logs[i];
      const row = document.createElement('div');
      row.className = `plugin-log-entry ${entry.level}`;

      const time = document.createElement('span');
      time.className = 'plugin-log-time';
      time.textContent = entry.timestamp;
      row.appendChild(time);

      const name = document.createElement('span');
      name.className = 'plugin-log-name';
      name.textContent = entry.name;
      row.appendChild(name);

      const msg = document.createElement('span');
      msg.className = 'plugin-log-message';
      msg.textContent = entry.message;
      row.appendChild(msg);

      list.appendChild(row);
    }

    this._scrollEl.appendChild(list);

    // Clear button
    const footer = document.createElement('div');
    footer.className = 'plugin-log-footer';
    const clearBtn = document.createElement('button');
    clearBtn.className = 'plugin-refresh-btn';
    clearBtn.textContent = 'Clear log';
    this.listen(clearBtn, 'click', () => {
      this._logs = [];
      this._renderLog();
    });
    footer.appendChild(clearBtn);
    this._scrollEl.appendChild(footer);
  }

  private _addLog(name: string, message: string, level: 'info' | 'error'): void {
    const timestamp = new Date().toLocaleTimeString();
    this._logs.push({ timestamp, name, message, level });
    // Update log tab badge if not active
    if (this._activeTab !== 'log') {
      this._logTab.textContent = `Log (\u2022)`;
    }
  }

  // ---------------------------------------------------------------------------
  // DOM helpers
  // ---------------------------------------------------------------------------

  private _clearControls(): void {
    while (this._controlsEl.firstChild) {
      this._controlsEl.removeChild(this._controlsEl.firstChild);
    }
  }

  private _clearScroll(): void {
    while (this._scrollEl.firstChild) {
      this._scrollEl.removeChild(this._scrollEl.firstChild);
    }
  }

  // ---------------------------------------------------------------------------
  // IPC actions
  // ---------------------------------------------------------------------------

  private async _install(name: string): Promise<void> {
    try {
      this._installing.set(name, 'Starting...');
      this._installErrors.delete(name);
      this._addLog(name, 'Install started', 'info');
      this._renderDiscoverGrid();
      await this._ipc.invoke(IPC_CHANNELS.PLUGIN_INSTALL, { name });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[PluginsPage] Install failed:', err);
      this._installing.delete(name);
      this._installErrors.set(name, message);
      this._addLog(name, `Install failed: ${message}`, 'error');
      this._renderDiscoverGrid();
    }
  }

  private async _uninstall(name: string): Promise<void> {
    try {
      this._addLog(name, 'Uninstall started', 'info');
      await this._ipc.invoke(IPC_CHANNELS.PLUGIN_UNINSTALL, { name });
      this._addLog(name, 'Uninstalled', 'info');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[PluginsPage] Uninstall failed:', err);
      this._addLog(name, `Uninstall failed: ${message}`, 'error');
    }
  }

  private async _togglePlugin(name: string, enable: boolean): Promise<void> {
    try {
      const channel = enable ? IPC_CHANNELS.PLUGIN_ENABLE : IPC_CHANNELS.PLUGIN_DISABLE;
      await this._ipc.invoke(channel, { name });
      this._addLog(name, enable ? 'Enabled' : 'Disabled', 'info');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[PluginsPage] Toggle failed:', err);
      this._addLog(name, `Toggle failed: ${message}`, 'error');
    }
  }

  private async _refreshCatalog(): Promise<void> {
    try {
      const catalog = await this._ipc.invoke<CatalogEntryDTO[]>(IPC_CHANNELS.PLUGIN_CATALOG, { forceRefresh: true });
      this._catalog = catalog;
      this._addLog('catalog', `Refreshed: ${catalog.length} plugins`, 'info');
      // Rebuild controls (categories may have changed) + grid
      this._showDiscover();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[PluginsPage] Refresh failed:', err);
      this._addLog('catalog', `Refresh failed: ${message}`, 'error');
    }
  }
}
