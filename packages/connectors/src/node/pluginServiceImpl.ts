import * as path from 'node:path';
import { Disposable, Emitter } from '@gho-work/base';
import type { CatalogEntry, InstalledPlugin, MCPServerConfig } from '@gho-work/base';
import type {
  IPluginService,
  InstallProgress,
  PluginSkillRegistration,
  PluginSettingsStore,
} from '../common/pluginService.js';
import type { PluginCatalogFetcher } from './pluginCatalogFetcher.js';
import type { PluginInstaller } from './pluginInstaller.js';
import type { IConnectorConfigStore } from '../common/connectorConfigStore.js';

// ---------------------------------------------------------------------------
// Settings keys
// ---------------------------------------------------------------------------

const KEY_CATALOG = 'plugin.catalog';
const KEY_INSTALLED = 'plugin.installed';

// ---------------------------------------------------------------------------
// PluginServiceImpl
// ---------------------------------------------------------------------------

/**
 * Central orchestrator for plugin lifecycle.
 *
 * Responsibilities:
 * - Catalog fetching and caching
 * - Install (git clone + cache) with progress events
 * - Skill source registration via PluginSkillRegistration
 * - MCP server registration via IConnectorConfigStore
 * - State persistence via PluginSettingsStore
 * - Enable / disable / update / uninstall operations
 *
 * All mutating operations are serialized through `_installQueue` to prevent
 * concurrent state corruption.
 */
export class PluginServiceImpl extends Disposable implements IPluginService {
  // -------------------------------------------------------------------------
  // Emitters
  // -------------------------------------------------------------------------

  private readonly _onDidChangeCatalog = this._register(new Emitter<CatalogEntry[]>());
  readonly onDidChangeCatalog = this._onDidChangeCatalog.event;

  private readonly _onDidChangePlugins = this._register(new Emitter<InstalledPlugin[]>());
  readonly onDidChangePlugins = this._onDidChangePlugins.event;

  private readonly _onInstallProgress = this._register(new Emitter<InstallProgress>());
  readonly onInstallProgress = this._onInstallProgress.event;

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  private _catalog: CatalogEntry[] = [];
  private _installed = new Map<string, InstalledPlugin>();

  /**
   * Serialization chain for all mutating operations.
   * New operations are appended with `.then(...)` so they run sequentially.
   */
  private _installQueue: Promise<void> = Promise.resolve();

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  constructor(
    private readonly _fetcher: Pick<PluginCatalogFetcher, 'fetch'>,
    private readonly _installer: Pick<
      PluginInstaller,
      | 'getCachePath'
      | 'checkGitAvailable'
      | 'clonePlugin'
      | 'parseManifest'
      | 'parseMcpServers'
      | 'countSkills'
      | 'countAgents'
      | 'deleteCache'
    >,
    private readonly _skillRegistration: PluginSkillRegistration,
    private readonly _configStore: IConnectorConfigStore,
    private readonly _settings: PluginSettingsStore,
  ) {
    super();
    this._loadFromSettings();
  }

  // -------------------------------------------------------------------------
  // Catalog
  // -------------------------------------------------------------------------

  async fetchCatalog(forceRefresh = false): Promise<CatalogEntry[]> {
    if (!forceRefresh && this._catalog.length > 0) {
      return this._catalog;
    }

    const entries = await this._fetcher.fetch();
    this._catalog = entries;
    this._settings.set(KEY_CATALOG, JSON.stringify(entries));
    this._onDidChangeCatalog.fire(entries);
    return entries;
  }

  getCachedCatalog(): CatalogEntry[] {
    return this._catalog;
  }

  // -------------------------------------------------------------------------
  // Install / Uninstall / Enable / Disable / Update
  // -------------------------------------------------------------------------

  install(pluginName: string): Promise<void> {
    this._installQueue = this._installQueue.then(() => this._doInstall(pluginName));
    return this._installQueue;
  }

  uninstall(pluginName: string): Promise<void> {
    this._installQueue = this._installQueue.then(() => this._doUninstall(pluginName));
    return this._installQueue;
  }

  enable(pluginName: string): Promise<void> {
    this._installQueue = this._installQueue.then(() => this._doEnable(pluginName));
    return this._installQueue;
  }

  disable(pluginName: string): Promise<void> {
    this._installQueue = this._installQueue.then(() => this._doDisable(pluginName));
    return this._installQueue;
  }

  update(pluginName: string): Promise<void> {
    this._installQueue = this._installQueue.then(async () => {
      // Atomic update: uninstall then reinstall
      await this._doUninstall(pluginName);
      await this._doInstall(pluginName);
    });
    return this._installQueue;
  }

  // -------------------------------------------------------------------------
  // Getters
  // -------------------------------------------------------------------------

  getInstalled(): InstalledPlugin[] {
    return Array.from(this._installed.values());
  }

  getPlugin(name: string): InstalledPlugin | undefined {
    return this._installed.get(name);
  }

  // -------------------------------------------------------------------------
  // Private — install
  // -------------------------------------------------------------------------

  private async _doInstall(name: string): Promise<void> {
    this._emitProgress(name, 'downloading', 'Looking up plugin in catalog…');

    // Find in catalog
    const entry = this._catalog.find((e) => e.name === name);
    if (entry === undefined) {
      this._emitProgress(name, 'error', `Plugin "${name}" not found in catalog.`);
      throw new Error(`Plugin "${name}" not found in catalog. Run fetchCatalog() first.`);
    }

    const version = entry.version ?? 'latest';
    const cachePath = this._installer.getCachePath(name, version);

    // Check git is available
    try {
      await this._installer.checkGitAvailable();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._emitProgress(name, 'error', message);
      throw err;
    }

    // Clone
    this._emitProgress(name, 'downloading', `Downloading ${name}@${version}…`);
    try {
      await this._installer.clonePlugin(entry, cachePath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._emitProgress(name, 'error', `Download failed: ${message}`);
      throw err;
    }

    // For git-subdir locations, the plugin root is nested inside the clone
    const pluginRoot = this._resolvePluginRoot(cachePath, entry.location);

    // Parse manifest
    this._emitProgress(name, 'extracting', 'Reading plugin manifest…');
    let manifest: Awaited<ReturnType<PluginInstaller['parseManifest']>>;
    try {
      manifest = await this._installer.parseManifest(pluginRoot);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._emitProgress(name, 'error', `Manifest parse failed: ${message}`);
      await this._installer.deleteCache(name, version).catch((e: unknown) => {
        console.warn(`Failed to delete cache for ${name}@${version} after manifest error:`, e);
      });
      throw err;
    }

    // Count skills and agents
    const skillCount = await this._installer.countSkills(pluginRoot, manifest.skills);
    const agentCount = await this._installer.countAgents(pluginRoot, manifest.agents);

    // Parse MCP servers
    const mcpServerMap = await this._installer.parseMcpServers(pluginRoot, manifest.mcpServers);

    // Register
    this._emitProgress(name, 'registering', 'Registering skills and MCP servers…');

    const registeredSourceIds: string[] = [];
    const registeredServerNames: string[] = [];

    try {
      // Register skill source
      if (skillCount > 0 || manifest.skills !== undefined) {
        const skillPath = this._resolveSkillPath(pluginRoot, manifest.skills);
        const sourceId = `plugin:${name}`;
        this._skillRegistration.addSource({ id: sourceId, path: skillPath, priority: 10 });
        registeredSourceIds.push(sourceId);
        await this._skillRegistration.refresh();
      }

      // Register MCP servers
      const mcpServerNames: string[] = [];
      for (const [serverKey, serverConfig] of mcpServerMap.entries()) {
        const mcpConfig: MCPServerConfig = {
          type: 'stdio',
          command: serverConfig.command,
          ...(serverConfig.args !== undefined && { args: serverConfig.args }),
          ...(serverConfig.env !== undefined && { env: serverConfig.env }),
          ...(serverConfig.cwd !== undefined && { cwd: serverConfig.cwd }),
          source: `plugin:${name}`,
        };
        await this._configStore.addServer(serverKey, mcpConfig);
        registeredServerNames.push(serverKey);
        mcpServerNames.push(serverKey);
      }

      // Build installed record
      const plugin: InstalledPlugin = {
        name,
        version,
        enabled: true,
        cachePath,
        installedAt: new Date().toISOString(),
        catalogMeta: entry,
        skillCount,
        agentCount,
        mcpServerNames,
      };

      this._installed.set(name, plugin);
      this._saveToSettings();
      this._onDidChangePlugins.fire(this.getInstalled());
      this._emitProgress(name, 'done', `${name}@${version} installed successfully.`);
    } catch (err) {
      // Rollback
      for (const sourceId of registeredSourceIds) {
        this._skillRegistration.removeSource(sourceId);
      }
      for (const serverName of registeredServerNames) {
        await this._configStore.removeServer(serverName).catch((e: unknown) => {
          console.warn(`Rollback: failed to remove MCP server "${serverName}":`, e);
        });
      }
      await this._installer.deleteCache(name, version).catch((e: unknown) => {
        console.warn(`Rollback: failed to delete cache for ${name}@${version}:`, e);
      });

      const message = err instanceof Error ? err.message : String(err);
      this._emitProgress(name, 'error', `Install failed: ${message}`);
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Private — uninstall
  // -------------------------------------------------------------------------

  private async _doUninstall(name: string): Promise<void> {
    const plugin = this._installed.get(name);
    if (plugin === undefined) {
      throw new Error(`Plugin "${name}" is not installed.`);
    }

    // Deregister skill source
    this._skillRegistration.removeSource(`plugin:${name}`);
    await this._skillRegistration.refresh();

    // Remove MCP servers registered by this plugin
    for (const serverName of plugin.mcpServerNames) {
      await this._configStore.removeServer(serverName).catch((err: unknown) => {
        console.warn(`Failed to remove MCP server "${serverName}" during uninstall:`, err);
      });
    }

    // Remove from in-memory state
    this._installed.delete(name);
    this._saveToSettings();
    this._onDidChangePlugins.fire(this.getInstalled());

    // Delete cached files
    await this._installer.deleteCache(name, plugin.version).catch((err: unknown) => {
      console.warn(`Failed to delete cache for ${name}@${plugin.version}:`, err);
    });
  }

  // -------------------------------------------------------------------------
  // Private — enable / disable
  // -------------------------------------------------------------------------

  private async _doEnable(name: string): Promise<void> {
    const plugin = this._installed.get(name);
    if (plugin === undefined) {
      throw new Error(`Plugin "${name}" is not installed.`);
    }
    if (plugin.enabled) {
      return; // already enabled
    }

    const pluginRoot = this._resolvePluginRoot(plugin.cachePath, plugin.catalogMeta.location);

    // Re-register skill source
    if (plugin.skillCount > 0) {
      const manifest = await this._installer.parseManifest(pluginRoot);
      const skillPath = this._resolveSkillPath(pluginRoot, manifest.skills);
      this._skillRegistration.addSource({ id: `plugin:${name}`, path: skillPath, priority: 10 });
      await this._skillRegistration.refresh();
    }

    // Re-register MCP servers
    const enableManifest = await this._installer.parseManifest(pluginRoot);
    const enableServers = await this._installer.parseMcpServers(pluginRoot, enableManifest.mcpServers);
    for (const serverName of plugin.mcpServerNames) {
      const serverConfig = enableServers.get(serverName);
      if (serverConfig !== undefined) {
        const mcpConfig: MCPServerConfig = {
          type: 'stdio',
          command: serverConfig.command,
          ...(serverConfig.args !== undefined && { args: serverConfig.args }),
          ...(serverConfig.env !== undefined && { env: serverConfig.env }),
          ...(serverConfig.cwd !== undefined && { cwd: serverConfig.cwd }),
          source: `plugin:${name}`,
        };
        await this._configStore.addServer(serverName, mcpConfig);
      }
    }

    this._installed.set(name, { ...plugin, enabled: true });
    this._saveToSettings();
    this._onDidChangePlugins.fire(this.getInstalled());
  }

  private async _doDisable(name: string): Promise<void> {
    const plugin = this._installed.get(name);
    if (plugin === undefined) {
      throw new Error(`Plugin "${name}" is not installed.`);
    }
    if (!plugin.enabled) {
      return; // already disabled
    }

    // Deregister skill source
    this._skillRegistration.removeSource(`plugin:${name}`);
    await this._skillRegistration.refresh();

    // Deregister MCP servers
    for (const serverName of plugin.mcpServerNames) {
      await this._configStore.removeServer(serverName).catch((err: unknown) => {
        console.warn(`Failed to remove MCP server "${serverName}" during disable:`, err);
      });
    }

    this._installed.set(name, { ...plugin, enabled: false });
    this._saveToSettings();
    this._onDidChangePlugins.fire(this.getInstalled());
  }

  // -------------------------------------------------------------------------
  // Private — settings persistence
  // -------------------------------------------------------------------------

  private _loadFromSettings(): void {
    // Restore catalog cache
    const catalogJson = this._settings.get(KEY_CATALOG);
    if (catalogJson !== undefined) {
      try {
        const parsed = JSON.parse(catalogJson) as CatalogEntry[];
        this._catalog = parsed;
      } catch (err) {
        console.warn('PluginService: failed to parse cached catalog from settings:', err);
        this._catalog = [];
      }
    }

    // Restore installed plugins
    const installedJson = this._settings.get(KEY_INSTALLED);
    if (installedJson !== undefined) {
      try {
        const parsed = JSON.parse(installedJson) as InstalledPlugin[];
        for (const plugin of parsed) {
          this._installed.set(plugin.name, plugin);
        }
      } catch (err) {
        console.warn('PluginService: failed to parse installed plugins from settings:', err);
        this._installed = new Map();
      }
    }
  }

  private _saveToSettings(): void {
    this._settings.set(KEY_INSTALLED, JSON.stringify(this.getInstalled()));
  }

  // -------------------------------------------------------------------------
  // Private — helpers
  // -------------------------------------------------------------------------

  private _emitProgress(name: string, status: InstallProgress['status'], message: string): void {
    this._onInstallProgress.fire({ name, status, message });
  }

  /**
   * Resolves the skill source path from the manifest's skills field.
   * If undefined, defaults to `<cachePath>/skills`.
   * If a single string ending in '/', treats it as a directory relative to cachePath.
   * If an array, uses the first entry.
   */
  private _resolveSkillPath(cachePath: string, skills: string | string[] | undefined): string {
    if (skills === undefined) {
      return path.join(cachePath, 'skills');
    }
    const first = Array.isArray(skills) ? skills[0] : skills;
    return path.join(cachePath, first.replace(/\/$/, ''));
  }

  /**
   * For `git-subdir` locations, the actual plugin content is nested inside the
   * clone at `location.path`. For all other location types, the plugin root is
   * the clone root itself.
   */
  private _resolvePluginRoot(cachePath: string, location: string | CatalogEntry['location']): string {
    if (typeof location !== 'string' && location.type === 'git-subdir') {
      return path.join(cachePath, location.path.replace(/^\.\//, ''));
    }
    return cachePath;
  }
}
