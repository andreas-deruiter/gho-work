/**
 * Main process setup — wires up DI container, services, and IPC handlers.
 * This runs in Electron's main process.
 *
 * Agent execution lives in the Agent Host utility process (agentHostMain.ts).
 * The main process handles conversation persistence, auth, and model selection.
 *
 * IPC handler registration is delegated to ./ipcHandlers.ts.
 */
import { app, BrowserWindow } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ServiceCollection } from '@gho-work/base';
import {
  IPC_CHANNELS,
  SqliteStorageService,
  NodeFileService,
} from '@gho-work/platform';
import { createDIContainer } from './diContainer.js';
import { startSDKLifecycle } from './sdkLifecycle.js';
import { registerIpcHandlers } from './ipcHandlers.js';
import {
  CopilotSDKImpl,
  AgentServiceImpl,
  ICopilotSDK,
  IAgentService,
  SkillRegistryImpl,
  buildSkillSources,
  PluginAgentRegistryImpl,
  HookServiceImpl,
  InstructionResolver,
} from '@gho-work/agent';
import { expandPluginRoot, expandPluginRootInRecord } from '@gho-work/base';
import * as os from 'node:os';
import {
  IMCPClientManager,
  IConnectorConfigStore,
  ConnectorConfigStoreImpl,
  MCPClientManagerImpl,
  PluginServiceImpl,
  PluginCatalogFetcher,
  PluginInstaller,
  MarketplaceRegistryImpl,
  PluginAgentLoader,
} from '@gho-work/connectors';
import type { PluginSettingsStore, PluginAgentRegistration, PluginHookRegistration, MarketplaceSource } from '@gho-work/connectors';

/**
 * Sets up the main process: DI container, IPC handlers, conversation service.
 * Returns the service collection (for testing).
 *
 * @param mainWindow - The main BrowserWindow
 * @param storageService - SqliteStorageService for workspace DB access
 * @param workspaceId - The active workspace ID
 */
export interface MainProcessOptions {
  /** Force the Copilot SDK to use mock mode (for testing). */
  useMockSDK?: boolean;
  /** User data directory for SQLite databases (conversations, settings). */
  userDataPath?: string;
  /** Override skill loading path — only this path is scanned (for testing). */
  skillsPath?: string;
  /** Local plugin directories to load on startup (ephemeral, not persisted). */
  pluginDirs?: string[];
}

export function createMainProcess(
  mainWindow: BrowserWindow,
  storageService?: SqliteStorageService,
  workspaceId?: string,
  options?: MainProcessOptions,
): ServiceCollection {
  // --- DI Container: storage, conversation, auth, IPC adapter ---
  const {
    services,
    storageService: resolvedStorageService,
    workspaceId: resolvedWorkspaceId,
    conversationService,
    authService,
    ipcMainAdapter,
  } = createDIContainer(mainWindow, storageService, workspaceId, options);
  // DI container may have created storageService/workspaceId if they weren't provided
  storageService = resolvedStorageService;
  workspaceId = resolvedWorkspaceId;

  // --- Onboarding state ---
  const onboardingFilePath = path.join(app.getPath('userData'), 'onboarding-complete.json');

  // --- Agent service (runs in main process for now, will move to utility process later) ---
  const useMock = options?.useMockSDK === true;
  const sdk = new CopilotSDKImpl({ cwd: os.homedir(), useMock });

  // Start SDK async — store promise so IPC handlers can await readiness.
  const { sdkReady } = startSDKLifecycle(sdk, useMock, onboardingFilePath);

  // Skill registry: multi-source skill discovery with priority-based deduplication.
  // In development, electron-vite outputs to apps/desktop/out/main/index.js,
  // so app.getAppPath() returns apps/desktop/out/main — 4 levels below repo root.
  // Bundled skills live at <repo-root>/skills/.
  // In packaged builds, they're copied to resources/skills/.
  const bundledSkillsPath = app.isPackaged
    ? path.join(process.resourcesPath, 'skills')
    : path.join(app.getAppPath(), '..', '..', '..', '..', 'skills');
  const skillSources = buildSkillSources({
    bundledPath: bundledSkillsPath,
    userPath: path.join(os.homedir(), '.gho-work', 'skills'),
    overridePath: options?.skillsPath,
  });

  // Load persisted additional skill paths
  const additionalPathsRaw = storageService?.getSetting('skills.additionalPaths');
  if (additionalPathsRaw) {
    try {
      const additionalPaths: string[] = JSON.parse(additionalPathsRaw);
      for (let i = 0; i < additionalPaths.length; i++) {
        if (fs.existsSync(additionalPaths[i])) {
          const dirName = path.basename(additionalPaths[i]);
          skillSources.push({ id: dirName, priority: 20, basePath: additionalPaths[i] });
        }
      }
    } catch (err) {
      console.warn('[main] Failed to load additional skill paths:', err);
    }
  }

  const skillRegistry = new SkillRegistryImpl(skillSources);

  // Fire scan as non-blocking — skills load in background; agent works immediately.
  void skillRegistry.scan().catch((err) => {
    console.error('[main] Skill registry scan failed:', err instanceof Error ? err.message : String(err));
  });
  const getDisabledSkills = (): string[] => {
    const raw = storageService?.getSetting('skills.disabled');
    return raw ? JSON.parse(raw) : [];
  };

  // InstructionResolver: discovers and merges user/project instruction files
  const userInstructionsDir = path.join(os.homedir(), '.gho-work');
  const projectDirsRaw = storageService?.getSetting('instructions.projectDirs');
  let projectDirs: string[] = [];
  if (projectDirsRaw) {
    try {
      projectDirs = JSON.parse(projectDirsRaw);
    } catch (err) {
      console.warn('[main] Failed to parse instructions.projectDirs:', err);
    }
  }
  const instructionResolver = new InstructionResolver(userInstructionsDir, projectDirs);

  // PluginAgentLoader: reads agent .md files from installed plugins
  const pluginAgentLoader = new PluginAgentLoader();

  // getEnabledPlugins callback — pluginService is initialized later in setup,
  // but this callback is only called at runtime during executeTask().
  let _pluginServiceRef: { getInstalled(): import('@gho-work/base').InstalledPlugin[] } | null = null;
  const getEnabledPlugins = () => _pluginServiceRef?.getInstalled().filter(p => p.enabled) ?? [];

  const pluginAgentRegistry = new PluginAgentRegistryImpl();
  const hookService = new HookServiceImpl();

  const agentService = new AgentServiceImpl(
    sdk,
    conversationService,
    skillRegistry,
    instructionResolver,
    pluginAgentLoader,
    getDisabledSkills,
    getEnabledPlugins,
    pluginAgentRegistry,
    hookService,
  );
  services.set(ICopilotSDK, sdk);
  services.set(IAgentService, agentService);

  // Create default instructions template on first launch
  const defaultInstructionsPath = path.join(os.homedir(), '.gho-work', 'gho-instructions.md');
  try {
    if (!fs.existsSync(defaultInstructionsPath)) {
      fs.mkdirSync(path.dirname(defaultInstructionsPath), { recursive: true });
      fs.writeFileSync(defaultInstructionsPath, `# GHO Work Instructions

<!--
  This file contains instructions for the GHO Work AI agent.
  The agent reads this file at the start of every new conversation.

  You can edit this file with any text editor.
  To change its location, go to Settings > Instructions in GHO Work.
-->

## About Me
<!-- Describe your role, preferences, and how you'd like the agent to behave -->

## Conventions
<!-- Add any conventions, tools, or workflows the agent should follow -->
`, { encoding: 'utf-8' });
      console.warn('[main] Created default instructions file at', defaultInstructionsPath);
    }
  } catch (err) {
    console.warn('Failed to create default instructions template:', err);
  }

  // Forward agent state changes to renderer
  agentService.onDidChangeAgentState((state) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.AGENT_STATE_CHANGED, state);
    }
  });

  // Forward quota changes from assistant.usage events to renderer
  agentService.onDidChangeQuota((quota) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.QUOTA_CHANGED, quota);
    }
  });

  // Dispose skill registry on app quit
  app.on('will-quit', () => {
    skillRegistry.dispose();
  });

  // --- Connector Services ---
  const mcpJsonPath = path.join(
    options?.userDataPath ?? app.getPath('userData'),
    'mcp.json',
  );
  const configStore = new ConnectorConfigStoreImpl(mcpJsonPath);
  const mcpClientManager = new MCPClientManagerImpl(configStore);

  services.set(IConnectorConfigStore, configStore);
  services.set(IMCPClientManager, mcpClientManager);

  // Forward status events to renderer
  mcpClientManager.onDidChangeStatus((event) => {
    ipcMainAdapter.sendToRenderer(IPC_CHANNELS.CONNECTOR_STATUS_CHANGED, {
      name: event.serverName,
      status: event.status,
    });
  });

  // Forward config changes to renderer so sidebar refreshes
  configStore.onDidChangeServers(() => {
    ipcMainAdapter.sendToRenderer(IPC_CHANNELS.CONNECTOR_LIST_CHANGED);
  });

  // --- Plugin Service ---
  const userDataPath = options?.userDataPath ?? app.getPath('userData');
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
  _pluginServiceRef = pluginService;

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
  if (options?.pluginDirs && options.pluginDirs.length > 0) {
    void (async () => {
      for (const dir of options.pluginDirs!) {
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
  function createFetcher(source: MarketplaceSource): { fetch(): Promise<import('@gho-work/base').CatalogEntry[]> } {
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

  // --- File service ---
  const fileService = new NodeFileService();
  app.on('will-quit', () => {
    fileService.dispose();
  });

  // --- Register IPC handlers (delegated to ipcHandlers.ts) ---
  registerIpcHandlers({
    ipc: ipcMainAdapter,
    conversationService,
    sdk,
    agentService,
    sdkReady,
    skillRegistry,
    skillSources,
    storageService,
    mcpClientManager,
    configStore,
    pluginService,
    pluginInstaller,
    marketplaceRegistry,
    authService,
    fileService,
    pluginAgentRegistry,
    onboardingFilePath,
    workspaceId,
    useMock,
  });

  return services;
}
