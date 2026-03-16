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
import { setupPlugins } from './pluginReconciler.js';
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
import * as os from 'node:os';
import {
  IMCPClientManager,
  IConnectorConfigStore,
  ConnectorConfigStoreImpl,
  MCPClientManagerImpl,
  PluginAgentLoader,
} from '@gho-work/connectors';

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
  const userDataPath = options?.userDataPath ?? app.getPath('userData');
  const mcpJsonPath = path.join(userDataPath, 'mcp.json');
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

  // --- Plugin Services (setup delegated to pluginReconciler.ts) ---
  const { pluginService, marketplaceRegistry, pluginInstaller } = setupPlugins({
    storageService,
    configStore,
    mcpClientManager,
    skillRegistry,
    pluginAgentRegistry,
    hookService,
    ipcMainAdapter,
    userDataPath,
    pluginDirs: options?.pluginDirs,
  });
  _pluginServiceRef = pluginService;

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
