/**
 * Plugin reconciliation — extracted from mainProcess.ts.
 *
 * Handles plugin service setup, local plugin loading, marketplace registry
 * creation, and MCP auto-reconcile on startup. Everything here runs once
 * during app initialisation and has no further coupling to mainProcess.
 */
import { app } from 'electron';
import * as path from 'node:path';
import { expandPluginRoot, expandPluginRootInRecord } from '@gho-work/base';
import { IPC_CHANNELS } from '@gho-work/platform';
import type { SqliteStorageService } from '@gho-work/platform';
import type { IIPCMain } from '@gho-work/platform';
import type {
  SkillRegistryImpl,
  PluginAgentRegistryImpl,
  HookServiceImpl,
} from '@gho-work/agent';
import {
  ConnectorConfigStoreImpl,
  MCPClientManagerImpl,
  PluginServiceImpl,
  PluginCatalogFetcher,
  PluginInstaller,
  MarketplaceRegistryImpl,
} from '@gho-work/connectors';
import type {
  PluginSettingsStore,
  PluginAgentRegistration,
  PluginHookRegistration,
  MarketplaceSource,
} from '@gho-work/connectors';
import type { CatalogEntry } from '@gho-work/base';

// ---------------------------------------------------------------------------
// Deps / Result interfaces
// ---------------------------------------------------------------------------

export interface PluginSetupDeps {
  storageService: SqliteStorageService | undefined;
  configStore: ConnectorConfigStoreImpl;
  mcpClientManager: MCPClientManagerImpl;
  skillRegistry: SkillRegistryImpl;
  pluginAgentRegistry: PluginAgentRegistryImpl;
  hookService: HookServiceImpl;
  ipcMainAdapter: IIPCMain;
  userDataPath: string;
  pluginDirs?: string[];
}

export interface PluginSetupResult {
  pluginService: PluginServiceImpl;
  marketplaceRegistry: MarketplaceRegistryImpl;
  pluginInstaller: PluginInstaller;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Creates and wires the plugin service, local plugins, marketplace registry,
 * and kicks off the MCP auto-reconcile. Returns the three objects that
 * mainProcess needs to hand to the IPC handler layer.
 */
export function setupPlugins(deps: PluginSetupDeps): PluginSetupResult {
  const {
    storageService,
    configStore,
    mcpClientManager,
    skillRegistry,
    pluginAgentRegistry,
    hookService,
    ipcMainAdapter,
    userDataPath,
    pluginDirs,
  } = deps;

  // --- Plugin Service ---
  const pluginCacheDir = path.join(userDataPath, 'plugins', 'cache');
  const pluginFetcher = new PluginCatalogFetcher();
  const pluginInstaller = new PluginInstaller(pluginCacheDir);

  const pluginSettings: PluginSettingsStore = {
    get: (key: string) => storageService?.getSetting(key) ?? undefined,
    set: (key: string, value: string) => { storageService?.setSetting(key, value); },
  };

  const skillRegistration = {
    addSource: (source: { id: string; path: string; priority: number }) => {
      skillRegistry.addSource({ id: source.id, basePath: source.path, priority: source.priority });
    },
    removeSource: (sourceId: string) => { skillRegistry.removeSource(sourceId); },
    refresh: () => skillRegistry.refresh(),
  };

  const agentRegistration: PluginAgentRegistration = {
    register: (agent) => pluginAgentRegistry.register(agent),
    unregister: (id) => pluginAgentRegistry.unregister(id),
    unregisterPlugin: (name) => pluginAgentRegistry.unregisterPlugin(name),
  };

  const hookRegistration: PluginHookRegistration = {
    registerHooks: (pluginName, pluginRoot, hooks) =>
      hookService.registerHooks(pluginName, pluginRoot, hooks as Parameters<typeof hookService.registerHooks>[2]),
    unregisterHooks: (pluginName) => hookService.unregisterHooks(pluginName),
  };

  const pluginService = new PluginServiceImpl(
    pluginFetcher,
    pluginInstaller,
    skillRegistration,
    agentRegistration,
    hookRegistration,
    configStore,
    pluginSettings,
  );

  // Re-register all capabilities (skills, commands, agents, hooks) for enabled
  // installed plugins on startup. This resolves git-subdir plugin roots correctly
  // and triggers a skill registry refresh so skills are available to the agent.
  void pluginService.reconcileStartup().catch((err) => {
    console.error('[Plugins] Startup reconciliation failed:', err instanceof Error ? err.message : String(err));
  });

  // Forward plugin events to renderer
  pluginService.onDidChangePlugins((plugins) => {
    ipcMainAdapter.sendToRenderer(IPC_CHANNELS.PLUGIN_CHANGED, plugins);
  });
  pluginService.onInstallProgress((progress) => {
    ipcMainAdapter.sendToRenderer(IPC_CHANNELS.PLUGIN_INSTALL_PROGRESS, progress);
  });

  // Check for plugin updates in background (non-blocking)
  pluginService.checkForUpdates().then(updates => {
    if (updates.length > 0) {
      console.warn(`[Plugins] Updates available:`, updates.map(u => `${u.name} ${u.installed} \u2192 ${u.available}`));
      ipcMainAdapter.sendToRenderer(IPC_CHANNELS.PLUGIN_UPDATES_AVAILABLE, updates);
    }
  }).catch(err => console.warn('[Plugins] Update check failed:', err));

  // Dispose plugin service on app quit
  app.on('will-quit', () => {
    pluginService.dispose();
  });

  // --- Local plugins from --plugin-dir CLI flags (ephemeral, not persisted) ---
  if (pluginDirs && pluginDirs.length > 0) {
    void (async () => {
      for (const dir of pluginDirs) {
        try {
          const manifest = await pluginInstaller.parseManifest(dir);
          const name = manifest.name;

          // Register skills
          if (manifest.skills) {
            const skillPath = path.join(dir, typeof manifest.skills === 'string' ? manifest.skills : 'skills');
            skillRegistry.addSource({ id: `plugin:${name}`, basePath: skillPath, priority: 10 });
          }

          // Register commands
          if (manifest.commands) {
            const cmdPath = path.join(dir, typeof manifest.commands === 'string' ? manifest.commands : 'commands');
            skillRegistry.addSource({ id: `plugin:${name}:commands`, basePath: cmdPath, priority: 10 });
          }

          // Register agents
          const agents = await pluginInstaller.parseAgentFiles(dir, name, manifest.agents);
          for (const agent of agents) {
            pluginAgentRegistry.register(agent);
          }

          // Register hooks
          const hooks = await pluginInstaller.parseHooks(dir, manifest.hooks);
          if (hooks) {
            hookService.registerHooks(name, dir, hooks);
          }

          // Register MCP servers
          const mcpServers = await pluginInstaller.parseMcpServers(dir, manifest.mcpServers);
          for (const [serverName, config] of mcpServers) {
            await configStore.addServer(`plugin:${name}:${serverName}`, {
              type: 'stdio',
              command: expandPluginRoot(config.command, dir),
              args: config.args?.map(a => expandPluginRoot(a, dir)),
              env: config.env ? expandPluginRootInRecord(config.env, dir) : undefined,
              cwd: config.cwd ? expandPluginRoot(config.cwd, dir) : undefined,
              source: `plugin:${name}`,
            });
          }

          console.warn(`[Plugins] Loaded local plugin: ${name} from ${dir}`);
        } catch (err) {
          console.warn(`[Plugins] Failed to load local plugin from ${dir}:`, err);
        }
      }
    })();
  }

  // --- Marketplace Registry ---
  function createFetcher(source: MarketplaceSource): { fetch(): Promise<CatalogEntry[]> } {
    if (source.type === 'url') {
      return new PluginCatalogFetcher(source.url);
    } else if (source.type === 'github') {
      const url = `https://raw.githubusercontent.com/${source.repo}/${source.ref ?? 'main'}/.claude-plugin/marketplace.json`;
      return new PluginCatalogFetcher(url);
    }
    // local: use default fetcher (no-op, local files not supported via HTTP)
    return new PluginCatalogFetcher();
  }

  const marketplaceSettings = {
    get: (key: string): unknown => {
      const raw = storageService?.getSetting(key);
      if (raw === undefined) { return undefined; }
      try { return JSON.parse(raw); } catch { return raw; }
    },
    set: (key: string, value: unknown) => {
      storageService?.setSetting(key, JSON.stringify(value));
    },
  };

  const marketplaceRegistry = new MarketplaceRegistryImpl(createFetcher, marketplaceSettings);

  // Auto-reconcile on startup — connect all configured servers (non-blocking)
  void (async () => {
    try {
      const servers = configStore.getServers();
      if (servers.size > 0) {
        await mcpClientManager.reconcile(servers);
        console.warn(`[main] Reconciled ${servers.size} MCP server(s) on startup`);
      }
    } catch (err) {
      console.error('[main] Error reconciling MCP servers on startup:', err instanceof Error ? err.message : String(err));
    }
  })();

  return { pluginService, marketplaceRegistry, pluginInstaller };
}
