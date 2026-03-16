import type { IIPCRenderer } from '@gho-work/platform/common';
import { IPC_CHANNELS } from '@gho-work/platform/common';
import { Widget } from '../widget.js';
import { h } from '../dom.js';

// DTOs — defined locally to avoid pulling in Node.js code from @gho-work/platform
interface PluginLocationDTO {
  type: 'github' | 'url' | 'git-subdir';
  url?: string;
  repo?: string;
  path?: string;
  ref?: string;
}

interface CatalogEntryDTO {
  name: string;
  description: string;
  version?: string;
  author?: { name: string; email?: string };
  location?: string | PluginLocationDTO;
  keywords?: string[];
  category?: string;
  hasSkills: boolean;
  hasMcpServers: boolean;
  hasCommands?: boolean;
  hasAgents?: boolean;
  hasHooks?: boolean;
  marketplace?: string;
}

interface MarketplaceEntryDTO {
  name: string;
  source: { type: string; repo?: string; url?: string; path?: string; ref?: string };
  owner?: { name: string; email?: string };
  lastUpdated?: string;
  isDefault?: boolean;
}

interface InstalledPluginDTO {
  name: string;
  version: string;
  enabled: boolean;
  skillCount: number;
  agentCount: number;
  commandCount: number;
  hookCount: number;
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

interface PluginUpdateInfo {
  name: string;
  installed: string;
  available: string;
}

export class PluginsPage extends Widget {
  private readonly _ipc: IIPCRenderer;
  private _catalog: CatalogEntryDTO[] = [];
  private _installed: InstalledPluginDTO[] = [];
  private _activeTab: 'discover' | 'installed' | 'log' | 'marketplaces' = 'discover';
  private _searchQuery = '';
  private _activeCategory = 'All';
  private _activeMarketplace = 'All';
  private _installing = new Map<string, string>(); // name → progress message
  private _installErrors = new Map<string, string>(); // name → error message
  private _updatesAvailable = new Map<string, PluginUpdateInfo>(); // name → update info
  private _logs: LogEntry[] = [];
  private _marketplaces: MarketplaceEntryDTO[] = [];

  // DOM refs — stable across renders
  private readonly _discoverTab: HTMLElement;
  private readonly _installedTab: HTMLElement;
  private readonly _logTab: HTMLElement;
  private readonly _marketplacesTab: HTMLElement;
  private readonly _controlsEl: HTMLElement;
  private readonly _scrollEl: HTMLElement;

  // Tooltip
  private readonly _tooltip: HTMLElement;
  private _tooltipTimer: ReturnType<typeof setTimeout> | undefined;
  private _pluginDetailsCache = new Map<string, {
    skills: Array<{ name: string; description: string }>;
    commands: Array<{ name: string; description: string }>;
    agents: Array<{ name: string; description: string }>;
    hooks: Array<{ name: string; description: string }>;
  }>();

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

    this._marketplacesTab = document.createElement('button');
    this._marketplacesTab.className = 'plugin-tab';
    this._marketplacesTab.textContent = 'Marketplaces';
    this.listen(this._marketplacesTab, 'click', () => this._switchTab('marketplaces'));

    layout.tabBar.appendChild(this._discoverTab);
    layout.tabBar.appendChild(this._installedTab);
    layout.tabBar.appendChild(this._logTab);
    layout.tabBar.appendChild(this._marketplacesTab);

    this._controlsEl = layout.controls;
    this._scrollEl = layout.scroll;

    // Shared tooltip element
    this._tooltip = document.createElement('div');
    this._tooltip.className = 'plugin-badge-tooltip';
    layout.root.appendChild(this._tooltip);
    this.listen(this._tooltip, 'mouseenter', () => this._clearTooltipTimer());
    this.listen(this._tooltip, 'mouseleave', () => this._hideTooltip());

    // IPC: plugin list changed
    const onChanged = (...args: unknown[]) => {
      this._installed = args[0] as InstalledPluginDTO[];
      this._pluginDetailsCache.clear();
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

    // IPC: plugin updates available (pushed from main on startup)
    const onUpdatesAvailable = (...args: unknown[]) => {
      const updates = args[0] as PluginUpdateInfo[];
      this._updatesAvailable.clear();
      for (const update of updates) {
        this._updatesAvailable.set(update.name, update);
      }
      if (this._activeTab === 'installed') {
        this._renderInstalled();
      }
    };
    this._ipc.on(IPC_CHANNELS.PLUGIN_UPDATES_AVAILABLE, onUpdatesAvailable);
    this._register({ dispose: () => this._ipc.removeListener(IPC_CHANNELS.PLUGIN_UPDATES_AVAILABLE, onUpdatesAvailable) });
  }

  async load(): Promise<void> {
    try {
      const [catalog, installed, marketplaces] = await Promise.all([
        this._ipc.invoke<CatalogEntryDTO[]>(IPC_CHANNELS.PLUGIN_CATALOG),
        this._ipc.invoke<InstalledPluginDTO[]>(IPC_CHANNELS.PLUGIN_LIST),
        this._ipc.invoke<MarketplaceEntryDTO[]>(IPC_CHANNELS.MARKETPLACE_LIST),
      ]);
      this._catalog = catalog;
      this._installed = installed;
      this._marketplaces = marketplaces;
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

  private _switchTab(tab: 'discover' | 'installed' | 'log' | 'marketplaces'): void {
    this._activeTab = tab;

    this._discoverTab.classList.toggle('active', tab === 'discover');
    this._installedTab.classList.toggle('active', tab === 'installed');
    this._logTab.classList.toggle('active', tab === 'log');
    this._marketplacesTab.classList.toggle('active', tab === 'marketplaces');

    if (tab === 'discover') {
      this._showDiscover();
    } else {
      this._clearControls();
      this._searchInput = undefined;
      this._chipsEl = undefined;
      if (tab === 'installed') {
        this._renderInstalled();
      } else if (tab === 'log') {
        this._logTab.textContent = 'Log';
        this._renderLog();
      } else {
        this._renderMarketplaces();
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

    // Marketplace filter chips (only shown if there are multiple marketplaces)
    if (this._marketplaces.length > 1) {
      const marketplaceBar = document.createElement('div');
      marketplaceBar.className = 'plugin-marketplace-bar';

      const label = document.createElement('span');
      label.className = 'plugin-marketplace-bar-label';
      label.textContent = 'Source:';
      marketplaceBar.appendChild(label);

      const allChip = document.createElement('button');
      allChip.className = 'plugin-marketplace-chip' + (this._activeMarketplace === 'All' ? ' active' : '');
      allChip.textContent = 'All';
      this.listen(allChip, 'click', () => {
        this._activeMarketplace = 'All';
        this._buildDiscoverControlsRefresh();
        this._renderDiscoverGrid();
      });
      marketplaceBar.appendChild(allChip);

      for (const mp of this._marketplaces) {
        const chip = document.createElement('button');
        chip.className = 'plugin-marketplace-chip' + (this._activeMarketplace === mp.name ? ' active' : '');
        chip.textContent = mp.owner?.name ?? mp.name;
        this.listen(chip, 'click', () => {
          this._activeMarketplace = mp.name;
          this._buildDiscoverControlsRefresh();
          this._renderDiscoverGrid();
        });
        marketplaceBar.appendChild(chip);
      }

      this._controlsEl.appendChild(marketplaceBar);
    }

    // Category chips
    const chipsEl = document.createElement('div');
    chipsEl.className = 'plugin-category-chips';
    this._buildCategoryChips(chipsEl);
    this._controlsEl.appendChild(chipsEl);
    this._chipsEl = chipsEl;
  }

  /** Rebuild controls in-place (e.g. to update marketplace chip active state). */
  private _buildDiscoverControlsRefresh(): void {
    this._clearControls();
    this._searchInput = undefined;
    this._chipsEl = undefined;
    this._buildDiscoverControls();
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
      const matchesMarketplace =
        this._activeMarketplace === 'All' || entry.marketplace === this._activeMarketplace;
      return matchesSearch && matchesCategory && matchesMarketplace;
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

    if (entry.hasCommands) {
      const commandsBadge = document.createElement('span');
      commandsBadge.className = 'plugin-badge commands';
      commandsBadge.textContent = 'Commands';
      badges.appendChild(commandsBadge);
    }

    if (entry.hasAgents) {
      const agentsBadge = document.createElement('span');
      agentsBadge.className = 'plugin-badge agents';
      agentsBadge.textContent = 'Agents';
      badges.appendChild(agentsBadge);
    }

    if (entry.hasHooks) {
      const hooksBadge = document.createElement('span');
      hooksBadge.className = 'plugin-badge hooks';
      hooksBadge.textContent = 'Hooks';
      badges.appendChild(hooksBadge);
    }

    // "View on GitHub" link
    const browseUrl = this._getPluginUrl(entry);
    if (browseUrl) {
      const link = document.createElement('a');
      link.className = 'plugin-card-link';
      link.textContent = 'View on GitHub \u2197';
      link.href = browseUrl;
      link.target = '_blank';
      link.rel = 'noopener';
      badges.appendChild(link);
    }

    card.appendChild(badges);

    return card;
  }

  private _getPluginUrl(entry: CatalogEntryDTO): string | undefined {
    const loc = entry.location;
    if (!loc || typeof loc === 'string') { return undefined; }
    if (loc.type === 'git-subdir' && loc.url && loc.path) {
      // Strip leading ./ from path
      const cleanPath = loc.path.replace(/^\.\//, '');
      return `${loc.url}/tree/main/${cleanPath}`;
    }
    if (loc.type === 'github' && loc.repo) {
      return `https://github.com/${loc.repo}`;
    }
    return undefined;
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
        mcpBadge.setAttribute('data-tooltip-type', 'mcp');
        mcpBadge.setAttribute('data-plugin', plugin.name);
        this._addBadgeTooltipHandlers(mcpBadge);
        header.appendChild(mcpBadge);
      }

      if (plugin.skillCount > 0) {
        const skillsBadge = document.createElement('span');
        skillsBadge.className = 'plugin-badge skills';
        skillsBadge.textContent = 'Skills';
        skillsBadge.setAttribute('data-tooltip-type', 'skills');
        skillsBadge.setAttribute('data-plugin', plugin.name);
        this._addBadgeTooltipHandlers(skillsBadge);
        header.appendChild(skillsBadge);
      }

      if (plugin.commandCount > 0) {
        const commandsBadge = document.createElement('span');
        commandsBadge.className = 'plugin-badge commands';
        commandsBadge.textContent = 'Commands';
        commandsBadge.setAttribute('data-tooltip-type', 'commands');
        commandsBadge.setAttribute('data-plugin', plugin.name);
        this._addBadgeTooltipHandlers(commandsBadge);
        header.appendChild(commandsBadge);
      }

      if (plugin.agentCount > 0) {
        const agentsBadge = document.createElement('span');
        agentsBadge.className = 'plugin-badge agents';
        agentsBadge.textContent = 'Agents';
        agentsBadge.setAttribute('data-tooltip-type', 'agents');
        agentsBadge.setAttribute('data-plugin', plugin.name);
        this._addBadgeTooltipHandlers(agentsBadge);
        header.appendChild(agentsBadge);
      }

      if (plugin.hookCount > 0) {
        const hooksBadge = document.createElement('span');
        hooksBadge.className = 'plugin-badge hooks';
        hooksBadge.textContent = 'Hooks';
        hooksBadge.setAttribute('data-tooltip-type', 'hooks');
        hooksBadge.setAttribute('data-plugin', plugin.name);
        this._addBadgeTooltipHandlers(hooksBadge);
        header.appendChild(hooksBadge);
      }

      info.appendChild(header);

      const details = document.createElement('div');
      details.className = 'plugin-installed-details';
      const detailParts: string[] = [];
      if (plugin.skillCount > 0) {
        detailParts.push(`${plugin.skillCount} skill${plugin.skillCount !== 1 ? 's' : ''}`);
      }
      if (plugin.agentCount > 0) {
        detailParts.push(`${plugin.agentCount} agent${plugin.agentCount !== 1 ? 's' : ''}`);
      }
      if (plugin.commandCount > 0) {
        detailParts.push(`${plugin.commandCount} command${plugin.commandCount !== 1 ? 's' : ''}`);
      }
      if (plugin.hookCount > 0) {
        detailParts.push(`${plugin.hookCount} hook${plugin.hookCount !== 1 ? 's' : ''}`);
      }
      if (plugin.mcpServerNames.length > 0) {
        detailParts.push(`${plugin.mcpServerNames.length} MCP server${plugin.mcpServerNames.length !== 1 ? 's' : ''}`);
      }
      details.textContent = detailParts.length > 0 ? detailParts.join(' \u00b7 ') : 'No registered resources';
      info.appendChild(details);

      item.appendChild(info);

      // Update badge in header (if update available)
      const updateInfo = this._updatesAvailable.get(plugin.name);
      if (updateInfo) {
        const updateBadge = document.createElement('span');
        updateBadge.className = 'plugin-badge update';
        updateBadge.title = `Update available: v${updateInfo.available}`;
        updateBadge.textContent = `Update v${updateInfo.available}`;
        header.appendChild(updateBadge);
      }

      const actions = document.createElement('div');
      actions.className = 'plugin-installed-actions';

      // Update button (shown when update is available)
      if (updateInfo) {
        const updateBtn = document.createElement('button');
        updateBtn.className = 'plugin-card-install-btn plugin-update-btn';
        updateBtn.textContent = `Update to v${updateInfo.available}`;
        updateBtn.setAttribute('aria-label', `Update ${plugin.name} to version ${updateInfo.available}`);
        this.listen(updateBtn, 'click', () => {
          this._updatesAvailable.delete(plugin.name);
          void this._updatePlugin(plugin.name);
        });
        actions.appendChild(updateBtn);
      }

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

  // ---------------------------------------------------------------------------
  // Marketplaces tab
  // ---------------------------------------------------------------------------

  private _renderMarketplaces(): void {
    this._clearScroll();

    // Section header
    const sectionTitle = document.createElement('h3');
    sectionTitle.className = 'plugin-section-title';
    sectionTitle.textContent = 'Configured Marketplaces';
    this._scrollEl.appendChild(sectionTitle);

    // Marketplace list
    if (this._marketplaces.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'plugin-empty-state';
      empty.textContent = 'No marketplaces configured.';
      this._scrollEl.appendChild(empty);
    } else {
      const list = document.createElement('div');
      list.className = 'plugin-marketplace-list';

      for (const mp of this._marketplaces) {
        const item = document.createElement('div');
        item.className = 'plugin-marketplace-item';

        const info = document.createElement('div');
        info.className = 'plugin-marketplace-info';

        const nameEl = document.createElement('div');
        nameEl.className = 'plugin-marketplace-name';
        nameEl.textContent = mp.owner?.name ?? mp.name;
        info.appendChild(nameEl);

        const sourceEl = document.createElement('div');
        sourceEl.className = 'plugin-marketplace-source';
        if (mp.source.type === 'github' && mp.source.repo) {
          sourceEl.textContent = `github: ${mp.source.repo}`;
        } else if (mp.source.type === 'url' && mp.source.url) {
          sourceEl.textContent = mp.source.url;
        } else if (mp.source.type === 'local' && mp.source.path) {
          sourceEl.textContent = `local: ${mp.source.path}`;
        }
        info.appendChild(sourceEl);

        if (mp.lastUpdated) {
          const updatedEl = document.createElement('div');
          updatedEl.className = 'plugin-marketplace-updated';
          updatedEl.textContent = `Last updated: ${new Date(mp.lastUpdated).toLocaleString()}`;
          info.appendChild(updatedEl);
        }

        item.appendChild(info);

        const actions = document.createElement('div');
        actions.className = 'plugin-marketplace-actions';

        const refreshBtn = document.createElement('button');
        refreshBtn.className = 'plugin-refresh-btn';
        refreshBtn.textContent = '\u21bb Refresh';
        refreshBtn.setAttribute('aria-label', `Refresh ${mp.name}`);
        this.listen(refreshBtn, 'click', () => void this._refreshMarketplace(mp.name));
        actions.appendChild(refreshBtn);

        if (!mp.isDefault) {
          const removeBtn = document.createElement('button');
          removeBtn.className = 'plugin-uninstall-btn';
          removeBtn.textContent = 'Remove';
          removeBtn.setAttribute('aria-label', `Remove ${mp.name}`);
          this.listen(removeBtn, 'click', () => void this._removeMarketplace(mp.name));
          actions.appendChild(removeBtn);
        }

        item.appendChild(actions);
        list.appendChild(item);
      }

      this._scrollEl.appendChild(list);
    }

    // Add Marketplace form
    const addSection = document.createElement('div');
    addSection.className = 'plugin-marketplace-add-section';

    const addTitle = document.createElement('h3');
    addTitle.className = 'plugin-section-title';
    addTitle.textContent = 'Add Marketplace';
    addSection.appendChild(addTitle);

    const addDesc = document.createElement('p');
    addDesc.className = 'plugin-marketplace-add-desc';
    addDesc.textContent = 'Enter a GitHub repo (e.g. team/plugins) or a URL to a marketplace.json file.';
    addSection.appendChild(addDesc);

    const addRow = document.createElement('div');
    addRow.className = 'plugin-marketplace-add-row';

    const addInput = document.createElement('input');
    addInput.type = 'text';
    addInput.className = 'plugin-search-input';
    addInput.placeholder = 'team/plugins or https://example.com/marketplace.json';
    addInput.setAttribute('aria-label', 'Marketplace URL or GitHub repo');
    addRow.appendChild(addInput);

    const addBtn = document.createElement('button');
    addBtn.className = 'plugin-card-install-btn';
    addBtn.textContent = 'Add';
    addBtn.setAttribute('aria-label', 'Add marketplace');
    this.listen(addBtn, 'click', () => {
      const value = addInput.value.trim();
      if (!value) return;
      void this._addMarketplace(value, addInput, addBtn);
    });
    this.listen(addInput, 'keydown', (e: Event) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Enter') {
        const value = addInput.value.trim();
        if (!value) return;
        void this._addMarketplace(value, addInput, addBtn);
      }
    });
    addRow.appendChild(addBtn);
    addSection.appendChild(addRow);

    this._scrollEl.appendChild(addSection);
  }

  private async _addMarketplace(value: string, input: HTMLInputElement, btn: HTMLButtonElement): Promise<void> {
    const source = value.includes('://')
      ? { type: 'url' as const, url: value }
      : { type: 'github' as const, repo: value };

    btn.disabled = true;
    btn.textContent = 'Adding\u2026';

    try {
      await this._ipc.invoke(IPC_CHANNELS.MARKETPLACE_ADD, { source });
      input.value = '';
      this._addLog('marketplace', `Added: ${value}`, 'info');
      // Reload marketplaces
      const marketplaces = await this._ipc.invoke<MarketplaceEntryDTO[]>(IPC_CHANNELS.MARKETPLACE_LIST);
      this._marketplaces = marketplaces;
      this._renderMarketplaces();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[PluginsPage] Add marketplace failed:', err);
      this._addLog('marketplace', `Add failed: ${message}`, 'error');
      btn.disabled = false;
      btn.textContent = 'Add';
    }
  }

  private async _refreshMarketplace(name: string): Promise<void> {
    try {
      await this._ipc.invoke(IPC_CHANNELS.MARKETPLACE_UPDATE, { name });
      this._addLog(name, 'Marketplace refreshed', 'info');
      const marketplaces = await this._ipc.invoke<MarketplaceEntryDTO[]>(IPC_CHANNELS.MARKETPLACE_LIST);
      this._marketplaces = marketplaces;
      if (this._activeTab === 'marketplaces') {
        this._renderMarketplaces();
      }
      // Also refresh the Discover catalog so it picks up marketplace changes
      await this._refreshCatalog();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[PluginsPage] Refresh marketplace failed:', err);
      this._addLog(name, `Refresh failed: ${message}`, 'error');
    }
  }

  private async _removeMarketplace(name: string): Promise<void> {
    try {
      await this._ipc.invoke(IPC_CHANNELS.MARKETPLACE_REMOVE, { name });
      this._addLog(name, 'Marketplace removed', 'info');
      const marketplaces = await this._ipc.invoke<MarketplaceEntryDTO[]>(IPC_CHANNELS.MARKETPLACE_LIST);
      this._marketplaces = marketplaces;
      if (this._activeTab === 'marketplaces') {
        this._renderMarketplaces();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[PluginsPage] Remove marketplace failed:', err);
      this._addLog(name, `Remove failed: ${message}`, 'error');
    }
  }

  private _addLog(name: string, message: string, level: 'info' | 'error'): void {
    const timestamp = new Date().toLocaleTimeString();
    this._logs.push({ timestamp, name, message, level });
    // Update log tab badge if not active
    if (this._activeTab !== 'log') {
      this._logTab.textContent = `Log (${this._logs.length})`;
    }
  }

  // ---------------------------------------------------------------------------
  // Badge tooltip
  // ---------------------------------------------------------------------------

  private _addBadgeTooltipHandlers(badge: HTMLElement): void {
    this.listen(badge, 'mouseenter', () => {
      this._clearTooltipTimer();
      this._tooltipTimer = setTimeout(() => void this._showTooltip(badge), 200);
    });
    this.listen(badge, 'mouseleave', () => {
      this._clearTooltipTimer();
      this._tooltipTimer = setTimeout(() => this._hideTooltip(), 150);
    });
  }

  private async _showTooltip(badge: HTMLElement): Promise<void> {
    const type = badge.getAttribute('data-tooltip-type');
    if (!type) { return; }

    const pluginName = badge.getAttribute('data-plugin')!;
    const tooltip = this._tooltip;
    tooltip.textContent = '';

    // Fetch plugin details (skills, commands, agents) with caching
    const details = await this._getPluginDetails(pluginName);

    if (type === 'mcp') {
      const plugin = this._installed.find(p => p.name === pluginName);
      const names = plugin?.mcpServerNames ?? [];
      this._renderListTooltip(tooltip, `${names.length} MCP Server${names.length !== 1 ? 's' : ''}`, names.map(n => ({ name: n, description: '' })));
    } else if (type === 'skills') {
      this._renderListTooltip(tooltip, `${details.skills.length} Skill${details.skills.length !== 1 ? 's' : ''}`, details.skills);
    } else if (type === 'commands') {
      this._renderListTooltip(tooltip, `${details.commands.length} Command${details.commands.length !== 1 ? 's' : ''}`, details.commands);
    } else if (type === 'agents') {
      this._renderListTooltip(tooltip, `${details.agents.length} Agent${details.agents.length !== 1 ? 's' : ''}`, details.agents);
    } else if (type === 'hooks') {
      this._renderListTooltip(tooltip, `${details.hooks.length} Hook Event${details.hooks.length !== 1 ? 's' : ''}`, details.hooks);
    }

    // Position below the badge
    const rect = badge.getBoundingClientRect();
    const pageRect = this.element.getBoundingClientRect();
    tooltip.style.top = `${rect.bottom - pageRect.top + 4}px`;
    let left = rect.left - pageRect.left;
    // Keep tooltip within the page bounds
    const maxLeft = pageRect.width - 420;
    if (left > maxLeft) { left = maxLeft; }
    if (left < 0) { left = 0; }
    tooltip.style.left = `${left}px`;

    tooltip.classList.add('visible');
  }

  private async _getPluginDetails(pluginName: string) {
    let cached = this._pluginDetailsCache.get(pluginName);
    if (!cached) {
      try {
        cached = await this._ipc.invoke<{
          skills: Array<{ name: string; description: string }>;
          commands: Array<{ name: string; description: string }>;
          agents: Array<{ name: string; description: string }>;
          hooks: Array<{ name: string; description: string }>;
        }>(IPC_CHANNELS.PLUGIN_SKILL_DETAILS, { name: pluginName });
        this._pluginDetailsCache.set(pluginName, cached);
      } catch (err) {
        console.error('[PluginsPage] Failed to fetch plugin details:', err);
        cached = { skills: [], commands: [], agents: [], hooks: [] };
      }
    }
    return cached;
  }

  private _renderListTooltip(
    tooltip: HTMLElement,
    title: string,
    items: Array<{ name: string; description: string }>,
  ): void {
    const header = document.createElement('div');
    header.className = 'plugin-badge-tooltip-header';
    header.textContent = title;
    tooltip.appendChild(header);

    const hr = document.createElement('hr');
    hr.className = 'plugin-badge-tooltip-divider';
    tooltip.appendChild(hr);

    const shown = items.slice(0, 20);
    for (const entry of shown) {
      const item = document.createElement('div');
      item.className = 'plugin-badge-tooltip-item';
      const nameEl = document.createElement('strong');
      nameEl.textContent = entry.name;
      item.appendChild(nameEl);
      if (entry.description) {
        const desc = document.createElement('span');
        desc.className = 'desc';
        desc.textContent = ` \u2014 ${entry.description}`;
        item.appendChild(desc);
      }
      tooltip.appendChild(item);
    }
    if (items.length > 20) {
      const more = document.createElement('div');
      more.className = 'plugin-badge-tooltip-more';
      more.textContent = `+ ${items.length - 20} more`;
      tooltip.appendChild(more);
    }
  }

  private _hideTooltip(): void {
    this._tooltip.classList.remove('visible');
  }

  private _clearTooltipTimer(): void {
    if (this._tooltipTimer !== undefined) {
      clearTimeout(this._tooltipTimer);
      this._tooltipTimer = undefined;
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

  private async _updatePlugin(name: string): Promise<void> {
    try {
      this._addLog(name, 'Update started', 'info');
      await this._ipc.invoke(IPC_CHANNELS.PLUGIN_UPDATE, { name });
      this._addLog(name, 'Updated successfully', 'info');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[PluginsPage] Update failed:', err);
      this._addLog(name, `Update failed: ${message}`, 'error');
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
