import type { IDisposable } from '@gho-work/base';
import type { Event } from '@gho-work/base';
import { createServiceIdentifier } from '@gho-work/base';
import type { CatalogEntry, InstalledPlugin, InstallProgressStatus, LegacyPluginAgentDefinition } from '@gho-work/base';

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export interface InstallProgress {
  name: string;
  status: InstallProgressStatus;
  message: string;
}

// ---------------------------------------------------------------------------
// Skill registration interface (connectors-side)
// Agent package cannot be imported from connectors (wrong direction).
// The main process satisfies this by passing the SkillRegistry.
// ---------------------------------------------------------------------------

export interface PluginSkillRegistration {
  addSource(source: { id: string; path: string; priority: number }): void;
  removeSource(sourceId: string): void;
  refresh(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Agent registration interface (connectors-side)
// Agent package cannot be imported from connectors (wrong direction).
// The main process satisfies this by passing the IPluginAgentRegistry.
// ---------------------------------------------------------------------------

export interface PluginAgentRegistration {
  register(agent: LegacyPluginAgentDefinition): void;
  unregister(agentId: string): void;
  unregisterPlugin(pluginName: string): void;
}

// ---------------------------------------------------------------------------
// Hook registration interface (connectors-side)
// Agent package cannot be imported from connectors (wrong direction).
// The main process satisfies this by passing the IHookService.
// ---------------------------------------------------------------------------

export interface PluginHookRegistration {
  registerHooks(pluginName: string, pluginRoot: string, hooks: Record<string, unknown[]>): void;
  unregisterHooks(pluginName: string): void;
}

// ---------------------------------------------------------------------------
// Settings store interface
// ---------------------------------------------------------------------------

export interface PluginSettingsStore {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
}

// ---------------------------------------------------------------------------
// IPluginService
// ---------------------------------------------------------------------------

export interface IPluginService extends IDisposable {
  /**
   * Fetch the plugin catalog. Returns cached data unless `forceRefresh` is
   * true or the cache is empty.
   */
  fetchCatalog(forceRefresh?: boolean): Promise<CatalogEntry[]>;

  /** Returns the last-fetched catalog, or an empty array if never fetched. */
  getCachedCatalog(): CatalogEntry[];

  /** Download and register a plugin by name (must exist in the catalog). */
  install(pluginName: string): Promise<void>;

  /** Deregister and delete a plugin's cached files. */
  uninstall(pluginName: string): Promise<void>;

  /** Re-register a previously disabled plugin's skills and MCP servers. */
  enable(pluginName: string): Promise<void>;

  /** Deregister a plugin's skills and MCP servers without deleting its cache. */
  disable(pluginName: string): Promise<void>;

  /** Install the latest version of an already-installed plugin. */
  update(pluginName: string): Promise<void>;

  /**
   * Compare installed plugin versions against the catalog and return plugins
   * that have a newer version available.
   */
  checkForUpdates(): Promise<Array<{ name: string; installed: string; available: string }>>;

  /** Returns a snapshot of all installed plugins. */
  getInstalled(): InstalledPlugin[];

  /** Returns the installed plugin record, or undefined if not installed. */
  getPlugin(name: string): InstalledPlugin | undefined;

  /** Fires when the catalog changes (after a successful fetch). */
  readonly onDidChangeCatalog: Event<CatalogEntry[]>;

  /** Fires when the set of installed plugins changes. */
  readonly onDidChangePlugins: Event<InstalledPlugin[]>;

  /** Fires at each step of an ongoing install/uninstall operation. */
  readonly onInstallProgress: Event<InstallProgress>;
}

export const IPluginService = createServiceIdentifier<IPluginService>('IPluginService');
