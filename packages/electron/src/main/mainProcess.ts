/**
 * Main process setup — wires up IPC handlers, DI container, and services.
 * This runs in Electron's main process.
 *
 * Agent execution lives in the Agent Host utility process (agentHostMain.ts).
 * The main process handles conversation persistence, auth, and model selection.
 */
import { app, BrowserWindow, shell } from 'electron';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ServiceCollection } from '@gho-work/base';
import type { AgentEvent } from '@gho-work/base';
import {
  IPC_CHANNELS,
  SqliteStorageService,
  NodeFileService,
  SkillToggleRequestSchema,
} from '@gho-work/platform';
import { createDIContainer } from './diContainer.js';
import { startSDKLifecycle, isOnboardingComplete } from './sdkLifecycle.js';
import type {
  SendMessageRequest,
  ConversationGetRequest,
  ConversationDeleteRequest,
  ConversationRenameRequest,
  ModelSelectRequest,
  GhCheckResponse,
  GhLoginResponse,
  GhLoginEvent,
  CopilotCheckResponse,
  OnboardingStatusResponse,
} from '@gho-work/platform';
import {
  CopilotSDKImpl,
  AgentServiceImpl,
  ICopilotSDK,
  IAgentService,
  SkillRegistryImpl,
  buildSkillSources,
  toSdkMcpConfig,
  PluginAgentRegistryImpl,
  HookServiceImpl,
  InstructionResolver,
} from '@gho-work/agent';
import { expandPluginRoot, expandPluginRootInRecord } from '@gho-work/base';
import * as os from 'node:os';
import type { AgentContext } from '@gho-work/base';
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
import type {
  ConnectorRemoveRequest,
  ConnectorConnectRequest,
  ConnectorDisconnectRequest,
} from '@gho-work/platform';
import type { MCPServerConfig } from '@gho-work/base';

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
  const execFileAsync = promisify(execFile);
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

  function listSkillsWithDisabledState(): import('@gho-work/platform/common').SkillEntryDTO[] {
    const disabledIds: string[] = JSON.parse(storageService?.getSetting('skills.disabled') ?? '[]');
    return skillRegistry.list().map(s => ({
      ...s,
      disabled: disabledIds.includes(s.id),
    }));
  }

  // Fire scan as non-blocking — skills load in background; agent works immediately.
  void skillRegistry.scan().catch((err) => {
    console.error('[main] Skill registry scan failed:', err instanceof Error ? err.message : String(err));
  });
  const getDisabledSkills = (): string[] => {
    const raw = storageService?.getSetting('skills.disabled');
    return raw ? JSON.parse(raw) : [];
  };

  const DEFAULT_INSTRUCTIONS_PATH = path.join(os.homedir(), '.gho-work', 'gho-instructions.md');

  const getInstructionsPath = (): string => {
    const custom = storageService?.getSetting('instructions.filePath');
    return custom || DEFAULT_INSTRUCTIONS_PATH;
  };

  const validateInstructionsFile = async (filePath: string): Promise<{ path: string; exists: boolean; lineCount: number; isDefault: boolean }> => {
    const isDefault = filePath === DEFAULT_INSTRUCTIONS_PATH;
    try {
      const content = await fs.promises.readFile(filePath, { encoding: 'utf-8' });
      const lineCount = content.split('\n').length;
      return { path: filePath, exists: true, lineCount, isDefault };
    } catch {
      return { path: filePath, exists: false, lineCount: 0, isDefault };
    }
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
  try {
    if (!fs.existsSync(DEFAULT_INSTRUCTIONS_PATH)) {
      fs.mkdirSync(path.dirname(DEFAULT_INSTRUCTIONS_PATH), { recursive: true });
      fs.writeFileSync(DEFAULT_INSTRUCTIONS_PATH, `# GHO Work Instructions

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
      console.warn('[main] Created default instructions file at', DEFAULT_INSTRUCTIONS_PATH);
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

  // --- Set up IPC handlers ---

  ipcMainAdapter.handle(IPC_CHANNELS.AGENT_SEND_MESSAGE, async (...args: unknown[]) => {
    const request = args[0] as SendMessageRequest;

    const context: AgentContext = {
      conversationId: request.conversationId,
      workspaceId: workspaceId ?? 'default',
      model: request.model,
    };

    // Ensure conversation exists in DB (auto-create if sent from welcome screen)
    if (conversationService) {
      try {
        const existing = conversationService.getConversation(request.conversationId);
        if (!existing) {
          conversationService.createConversationWithId(request.conversationId, request.model ?? 'gpt-4o');
        }
      } catch (err) { console.warn('[main] Non-critical error:', err instanceof Error ? err.message : String(err)); }
    }

    // Persist user message
    if (conversationService) {
      try {
        conversationService.addMessage(request.conversationId, {
          conversationId: request.conversationId,
          role: 'user',
          content: request.content,
          toolCalls: [],
          timestamp: Date.now(),
        });
      } catch (err) { console.warn('[main] Non-critical error:', err instanceof Error ? err.message : String(err)); }
    }

    // Stream events to renderer in background
    (async () => {
      let assistantContent = '';
      try {
        // Bridge connected MCP servers to SDK config
        let mcpServers: Parameters<typeof agentService.executeTask>[2];
        try {
          const servers = configStore.getServers();
          const connected: NonNullable<Parameters<typeof agentService.executeTask>[2]> = {};
          for (const [name, cfg] of servers) {
            if (mcpClientManager.getServerStatus(name) === 'connected') {
              connected[name] = toSdkMcpConfig(cfg);
            }
          }
          if (Object.keys(connected).length > 0) {
            mcpServers = connected;
          }
        } catch (err) {
          console.warn('[main] Non-critical error building MCP server config:', err instanceof Error ? err.message : String(err));
        }

        // Map IPC attachments to SDK format
        const sdkAttachments = request.attachments?.map(a => ({
          type: 'file' as const,
          path: a.path,
          displayName: a.name,
        }));

        for await (const event of agentService.executeTask(request.content, context, mcpServers, sdkAttachments)) {
          // Don't forward 'done' from the stream — we send our own after persist + auto-title
          if (event.type === 'done') { continue; }
          ipcMainAdapter.sendToRenderer(IPC_CHANNELS.AGENT_EVENT, event);
          // Accumulate assistant text for persistence
          if (event.type === 'text_delta') {
            assistantContent += event.content;
          }
        }
      } catch (err) {
        const errorEvent: AgentEvent = {
          type: 'error',
          error: err instanceof Error ? err.message : String(err),
        };
        ipcMainAdapter.sendToRenderer(IPC_CHANNELS.AGENT_EVENT, errorEvent);
      }

      // Persist assistant message
      if (conversationService && assistantContent) {
        try {
          conversationService.addMessage(request.conversationId, {
            conversationId: request.conversationId,
            role: 'assistant',
            content: assistantContent,
            toolCalls: [],
            timestamp: Date.now(),
          });
        } catch (err) { console.warn('[main] Non-critical error:', err instanceof Error ? err.message : String(err)); }
      }

      // Auto-title: on first message, use prompt as title (truncated to 60 chars)
      if (conversationService && request.content) {
        try {
          const conv = conversationService.getConversation(request.conversationId);
          if (conv && conv.title === 'New Conversation') {
            const title = request.content.length > 60
              ? request.content.substring(0, 57) + '...'
              : request.content;
            conversationService.renameConversation(request.conversationId, title);
          }
        } catch (err) { console.warn('[main] Non-critical error:', err instanceof Error ? err.message : String(err)); }
      }

      // Signal stream completion to renderer AFTER persist + auto-title
      ipcMainAdapter.sendToRenderer(IPC_CHANNELS.AGENT_EVENT, { type: 'done' });
    })();

    return { messageId: 'pending' };
  });

  ipcMainAdapter.handle(IPC_CHANNELS.AGENT_CANCEL, async () => {
    const taskId = agentService.getActiveTaskId();
    if (taskId) {
      agentService.cancelTask(taskId);
    }
  });

  // Conversation handlers
  ipcMainAdapter.handle(IPC_CHANNELS.CONVERSATION_LIST, async () => {
    if (!conversationService) {
      return { conversations: [] };
    }
    const conversations = conversationService.listConversations();
    return {
      conversations: conversations.map((c) => ({
        id: c.id,
        title: c.title,
        updatedAt: c.updatedAt,
      })),
    };
  });

  ipcMainAdapter.handle(IPC_CHANNELS.CONVERSATION_CREATE, async () => {
    if (!conversationService) {
      return { id: 'no-storage', title: 'New Conversation' };
    }
    const conversation = conversationService.createConversation('gpt-4o');
    return { id: conversation.id, title: conversation.title };
  });

  ipcMainAdapter.handle(IPC_CHANNELS.CONVERSATION_GET, async (...args: unknown[]) => {
    const request = args[0] as ConversationGetRequest;
    if (!conversationService) {
      return null;
    }
    const conversation = conversationService.getConversation(request.conversationId);
    if (!conversation) {
      return null;
    }
    const messages = conversationService.getMessages(request.conversationId);
    return { conversation, messages };
  });

  ipcMainAdapter.handle(IPC_CHANNELS.CONVERSATION_DELETE, async (...args: unknown[]) => {
    const request = args[0] as ConversationDeleteRequest;
    if (conversationService) {
      conversationService.deleteConversation(request.conversationId);
    }
    return { success: true };
  });

  ipcMainAdapter.handle(IPC_CHANNELS.CONVERSATION_RENAME, async (...args: unknown[]) => {
    const request = args[0] as ConversationRenameRequest;
    if (conversationService) {
      conversationService.renameConversation(request.conversationId, request.title);
    }
    return { success: true };
  });

  // Model handlers
  ipcMainAdapter.handle(IPC_CHANNELS.MODEL_LIST, async () => {
    try {
      // Wait for SDK to finish starting before listing models
      await sdkReady;
      const models = await sdk.listModels();
      return {
        models: models.map((m) => ({
          id: m.id,
          name: m.name,
          provider: m.id.startsWith('claude') ? 'anthropic' : 'openai',
        })),
      };
    } catch (err) {
      console.error('[MODEL_LIST] Failed to list models from SDK:', err);
      return {
        models: [],
        error: 'Failed to load models from SDK. Check your GitHub authentication.',
      };
    }
  });

  ipcMainAdapter.handle(IPC_CHANNELS.MODEL_SELECT, async (...args: unknown[]) => {
    const request = args[0] as ModelSelectRequest;
    // Store selection (for now just acknowledge — will persist via storage service later)
    return { modelId: request.modelId, success: true };
  });

  ipcMainAdapter.handle(IPC_CHANNELS.QUOTA_GET, async () => {
    try {
      await sdkReady;
      const result = await sdk.getQuota();
      return {
        snapshots: Object.entries(result.quotaSnapshots).map(([key, snap]) => ({
          quotaType: key,
          entitlementRequests: snap.entitlementRequests,
          usedRequests: snap.usedRequests,
          remainingPercentage: snap.remainingPercentage,
          overage: snap.overage,
          overageAllowed: snap.overageAllowedWithExhaustedQuota,
          resetDate: snap.resetDate,
        })),
      };
    } catch (err) {
      console.warn('[MainProcess] Failed to get quota:', err instanceof Error ? err.message : String(err));
      return { snapshots: [] };
    }
  });

  // --- Storage handlers ---
  ipcMainAdapter.handle(IPC_CHANNELS.STORAGE_GET, async (...args: unknown[]) => {
    const { key } = args[0] as { key: string };
    const value = storageService?.getSetting(key) ?? null;
    return { value };
  });

  ipcMainAdapter.handle(IPC_CHANNELS.STORAGE_SET, async (...args: unknown[]) => {
    const { key, value } = args[0] as { key: string; value: string };
    storageService?.setSetting(key, value);
    return {};
  });

  // Auth handlers
  ipcMainAdapter.handle(IPC_CHANNELS.AUTH_LOGIN, async () => {
    await authService.login();
  });

  ipcMainAdapter.handle(IPC_CHANNELS.AUTH_LOGOUT, async () => {
    await authService.logout();
  });

  ipcMainAdapter.handle(IPC_CHANNELS.AUTH_STATE, async () => {
    return authService.state;
  });

  // --- Onboarding handlers ---

  ipcMainAdapter.handle(IPC_CHANNELS.ONBOARDING_STATUS, async (): Promise<OnboardingStatusResponse> => {
    return { complete: isOnboardingComplete(onboardingFilePath) };
  });

  ipcMainAdapter.handle(IPC_CHANNELS.ONBOARDING_CHECK_GH, async (): Promise<GhCheckResponse> => {
    // Check if gh is installed
    let version: string | undefined;
    try {
      await execFileAsync('which', ['gh']);
    } catch {
      // gh not found on PATH — expected if not installed
      return { installed: false, authenticated: false, hasCopilotScope: false };
    }
    const installed = true;

    // Get version
    try {
      const { stdout } = await execFileAsync('gh', ['--version']);
      const match = stdout.match(/gh version ([\d.]+)/);
      if (match) {
        version = match[1];
      }
    } catch (err) {
      console.warn('[ONBOARDING_CHECK_GH] Failed to get gh version:', err instanceof Error ? err.message : String(err));
    }

    // Check auth status
    let authenticated = false;
    let login: string | undefined;
    let hasCopilotScope = false;
    try {
      const { stdout } = await execFileAsync('gh', ['auth', 'status']);
      authenticated = true;
      const loginMatch = stdout.match(/Logged in to github\.com account (\S+)/);
      if (loginMatch) {
        login = loginMatch[1];
      }
      // Check for copilot scope in output
      if (stdout.includes('copilot')) {
        hasCopilotScope = true;
      }
    } catch (err) {
      // gh auth status exits non-zero if not logged in
      const stderr = (err as { stderr?: string }).stderr ?? '';
      if (stderr.includes('not logged') || stderr.includes('no accounts')) {
        return { installed, version, authenticated: false, hasCopilotScope: false };
      }
    }

    // If scope not detected from auth status, check via token + API
    if (authenticated && !hasCopilotScope) {
      try {
        const { stdout: token } = await execFileAsync('gh', ['auth', 'token']);
        const https = await import('node:https');
        const scopeCheck = await new Promise<string>((resolve, reject) => {
          const req = https.get('https://api.github.com/user', {
            headers: {
              Authorization: `token ${token.trim()}`,
              'User-Agent': 'gho-work',
            },
          }, (res) => {
            const scopes = res.headers['x-oauth-scopes'] ?? '';
            resolve(scopes as string);
          });
          req.on('error', reject);
          req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
        });
        hasCopilotScope = scopeCheck.split(',').map((s) => s.trim()).includes('copilot');
      } catch (err) {
        console.warn('[ONBOARDING_CHECK_GH] Failed to check copilot scope:', err instanceof Error ? err.message : String(err));
      }
    }

    return { installed, version, authenticated, login, hasCopilotScope };
  });

  ipcMainAdapter.handle(IPC_CHANNELS.ONBOARDING_GH_LOGIN, async (): Promise<GhLoginResponse> => {
    // Helper to send progress events to renderer
    const sendLoginEvent = (event: GhLoginEvent) => {
      ipcMainAdapter.sendToRenderer(IPC_CHANNELS.ONBOARDING_GH_LOGIN_EVENT, event);
    };

    return new Promise((resolve) => {
      // gh auth login --web uses the device code flow:
      // 1. Prints "First copy your one-time code: XXXX-XXXX" to stderr
      // 2. Prints "Open this URL: https://github.com/login/device" to stderr
      // 3. Waits for user to complete auth in browser, then exits 0
      // We parse the code + URL, open the browser ourselves, and stream progress to UI.
      const child = spawn('gh', ['auth', 'login', '--hostname', 'github.com', '--web', '--scopes', 'copilot'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stderr = '';
      let deviceCodeSent = false;

      const parseAndSendDeviceCode = (output: string) => {
        if (deviceCodeSent) {
          return;
        }
        // Match patterns like "one-time code: XXXX-XXXX" and URL
        const codeMatch = output.match(/code:\s*([A-Z0-9]{4}-[A-Z0-9]{4})/);
        const urlMatch = output.match(/(https:\/\/github\.com\/login\/device\S*)/);
        if (codeMatch && urlMatch) {
          deviceCodeSent = true;
          sendLoginEvent({ type: 'device_code', code: codeMatch[1], url: urlMatch[1] });
          // Open the browser for the user
          void shell.openExternal(urlMatch[1]).then(() => {
            sendLoginEvent({ type: 'browser_opened' });
          });
        }
      };

      child.stdout?.on('data', (chunk: Buffer) => {
        parseAndSendDeviceCode(chunk.toString());
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
        parseAndSendDeviceCode(stderr);
      });

      const timeout = setTimeout(() => {
        child.kill();
        resolve({ success: false, error: 'Login timed out after 5 minutes' });
      }, 5 * 60 * 1000);

      child.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          sendLoginEvent({ type: 'authenticated' });
        }
        resolve({ success: code === 0, error: code !== 0 ? stderr.trim() || 'Login failed' : undefined });
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        resolve({ success: false, error: err.message });
      });
    });
  });

  ipcMainAdapter.handle(IPC_CHANNELS.ONBOARDING_CHECK_COPILOT, async (): Promise<CopilotCheckResponse> => {
    try {
      const { stdout: token } = await execFileAsync('gh', ['auth', 'token']);
      const tokenStr = token.trim();
      const https = await import('node:https');

      // Helper to make GitHub API requests
      const ghApiGet = <T>(url: string): Promise<{ status: number; headers: Record<string, string>; body: T }> =>
        new Promise((resolve, reject) => {
          const req = https.get(url, {
            headers: { Authorization: `token ${tokenStr}`, 'User-Agent': 'gho-work' },
          }, (res) => {
            let data = '';
            res.on('data', (chunk: string) => { data += chunk; });
            res.on('end', () => {
              try {
                const headers: Record<string, string> = {};
                for (const [k, v] of Object.entries(res.headers)) {
                  if (typeof v === 'string') { headers[k] = v; }
                }
                resolve({ status: res.statusCode ?? 0, headers, body: JSON.parse(data) });
              } catch (err) {
                console.warn('[ghApiRequest] Failed to parse JSON response:', err instanceof Error ? err.message : String(err));
                resolve({ status: res.statusCode ?? 0, headers: {}, body: {} as T });
              }
            });
          });
          req.on('error', reject);
          req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
        });

      // Fetch user info + check scopes from response headers
      const userResp = await ghApiGet<{ login: string; id: number; avatar_url: string; name?: string }>(
        'https://api.github.com/user',
      );
      const userInfo = userResp.body;
      const scopes = (userResp.headers['x-oauth-scopes'] ?? '').split(',').map(s => s.trim());
      const hasCopilotScope = scopes.includes('copilot');

      // Start the real SDK with the user's token and list available models.
      // This is the only reliable way to check subscription — there's no public REST API.
      let models: Array<{ id: string; name: string }> | undefined;
      let hasSubscription = hasCopilotScope;
      if (hasCopilotScope && !useMock) {
        try {
          // (Re)start SDK with the real token so listModels hits the real API
          await sdk.restart({ githubToken: tokenStr, useMock: false });
          const sdkModels = await sdk.listModels();
          models = sdkModels.map((m) => ({ id: m.id, name: m.name }));
          hasSubscription = sdkModels.length > 0;
          console.warn(`[main] Copilot check: ${sdkModels.length} models available`);
        } catch (err) {
          console.warn('[main] Failed to list models from SDK:', err instanceof Error ? err.message : String(err));
          // Copilot scope present but SDK can't list models — user may not have an active subscription
          hasSubscription = false;
        }
      }

      // We can't reliably determine tier from REST API; report based on model count
      const tier: CopilotCheckResponse['tier'] = !hasSubscription ? undefined
        : (models && models.length > 3) ? 'pro' : 'free';

      return {
        hasSubscription,
        tier,
        user: {
          githubId: String(userInfo.id),
          githubLogin: userInfo.login,
          avatarUrl: userInfo.avatar_url,
          name: userInfo.name,
        },
        models,
      };
    } catch (err) {
      console.error('[COPILOT_CHECK] Failed to check Copilot subscription:', err);
      return { hasSubscription: false, error: 'Failed to check Copilot subscription.' };
    }
  });

  // --- Connector IPC handlers ---

  ipcMainAdapter.handle(IPC_CHANNELS.CONNECTOR_LIST, async () => {
    const servers = configStore.getServers();
    return Array.from(servers.entries()).map(([name, config]) => {
      const status = mcpClientManager.getServerStatus(name);
      return {
        name,
        type: config.type,
        connected: status === 'connected',
        error: status === 'error' ? 'Connection failed' : undefined,
        source: config.source,
      };
    });
  });

  ipcMainAdapter.handle(IPC_CHANNELS.CONNECTOR_REMOVE, async (...args: unknown[]) => {
    const request = args[0] as ConnectorRemoveRequest;
    try {
      // Reconciliation triggered via onDidChangeServers will auto-disconnect
      await configStore.removeServer(request.name);
      return { success: true };
    } catch (err) {
      console.error('[mainProcess] CONNECTOR_REMOVE failed:', err instanceof Error ? err.message : String(err));
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMainAdapter.handle(IPC_CHANNELS.CONNECTOR_CONNECT, async (...args: unknown[]) => {
    const request = args[0] as ConnectorConnectRequest;
    const config = configStore.getServer(request.name);
    if (!config) {
      return { success: false, error: `Server not found: ${request.name}` };
    }
    try {
      await mcpClientManager.connectServer(request.name, config);
      return { success: true };
    } catch (err) {
      console.error('[mainProcess] CONNECTOR_CONNECT failed:', err instanceof Error ? err.message : String(err));
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMainAdapter.handle(IPC_CHANNELS.CONNECTOR_DISCONNECT, async (...args: unknown[]) => {
    const request = args[0] as ConnectorDisconnectRequest;
    try {
      await mcpClientManager.disconnectServer(request.name);
      return { success: true };
    } catch (err) {
      console.error('[mainProcess] CONNECTOR_DISCONNECT failed:', err instanceof Error ? err.message : String(err));
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMainAdapter.handle(IPC_CHANNELS.CONNECTOR_SETUP_CONVERSATION, async () => {
    try {
      const conversationId = await agentService.createSetupConversation();
      return { conversationId };
    } catch (err) {
      console.error('[mainProcess] Setup conversation failed:', err);
      return { conversationId: '', error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Agent tools for MCP server management are implemented in @gho-work/connectors
  // (handleAddMCPServer, handleRemoveMCPServer, handleListMCPServers) but cannot be
  // registered with the Copilot SDK yet — the Technical Preview does not expose a
  // tool registration API (registerTool/onSessionCreated). When the SDK adds this
  // capability, wire the handlers here. Until then, users manage servers through the
  // Connectors sidebar UI. Tracked in the spec:
  // docs/superpowers/specs/2026-03-13-connector-simplification-design.md

  // --- Skill handlers ---
  ipcMainAdapter.handle(IPC_CHANNELS.SKILL_LIST, async () => {
    return listSkillsWithDisabledState();
  });

  ipcMainAdapter.handle(IPC_CHANNELS.SKILL_SOURCES, async () => {
    return skillRegistry.getSources();
  });

  ipcMainAdapter.handle(IPC_CHANNELS.SKILL_ADD_PATH, async (...args: unknown[]) => {
    const { path: newPath } = args[0] as { path: string };

    // Validate path exists
    if (!fs.existsSync(newPath)) {
      return { error: 'Directory not found' };
    }

    // Check for duplicates
    const existing = storageService?.getSetting('skills.additionalPaths');
    const paths: string[] = existing ? JSON.parse(existing) : [];
    if (paths.includes(newPath) || skillSources.some((s) => s.basePath === newPath)) {
      return { error: 'Path already added' };
    }

    paths.push(newPath);
    storageService?.setSetting('skills.additionalPaths', JSON.stringify(paths));

    skillSources.push({ id: `additional-${paths.length}`, priority: 20, basePath: newPath });
    await skillRegistry.refresh();

    ipcMainAdapter.sendToRenderer(IPC_CHANNELS.SKILL_CHANGED, listSkillsWithDisabledState());
    return { ok: true as const };
  });

  ipcMainAdapter.handle(IPC_CHANNELS.SKILL_REMOVE_PATH, async (...args: unknown[]) => {
    const { path: removePath } = args[0] as { path: string };

    const existing = storageService?.getSetting('skills.additionalPaths');
    const paths: string[] = existing ? JSON.parse(existing) : [];
    const filtered = paths.filter((p) => p !== removePath);
    storageService?.setSetting('skills.additionalPaths', JSON.stringify(filtered));

    const idx = skillSources.findIndex((s) => s.basePath === removePath && s.priority > 0);
    if (idx >= 0) {
      skillSources.splice(idx, 1);
    }
    await skillRegistry.refresh();

    ipcMainAdapter.sendToRenderer(IPC_CHANNELS.SKILL_CHANGED, listSkillsWithDisabledState());
  });

  ipcMainAdapter.handle(IPC_CHANNELS.SKILL_RESCAN, async () => {
    await skillRegistry.refresh();
    return listSkillsWithDisabledState();
  });

  ipcMainAdapter.handle(IPC_CHANNELS.SKILL_TOGGLE, async (...args: unknown[]) => {
    const { skillId, enabled } = SkillToggleRequestSchema.parse(args[0]);
    const raw = storageService?.getSetting('skills.disabled');
    const disabled: string[] = raw ? JSON.parse(raw) : [];

    if (enabled) {
      const filtered = disabled.filter(id => id !== skillId);
      storageService?.setSetting('skills.disabled', JSON.stringify(filtered));
    } else {
      if (!disabled.includes(skillId)) {
        disabled.push(skillId);
        storageService?.setSetting('skills.disabled', JSON.stringify(disabled));
      }
    }

    ipcMainAdapter.sendToRenderer(IPC_CHANNELS.SKILL_CHANGED, listSkillsWithDisabledState());
    return { ok: true as const };
  });

  ipcMainAdapter.handle(IPC_CHANNELS.SKILL_DISABLED_LIST, async () => {
    const raw = storageService?.getSetting('skills.disabled');
    return raw ? JSON.parse(raw) : [];
  });

  // --- Plugin IPC handlers ---

  ipcMainAdapter.handle(IPC_CHANNELS.PLUGIN_CATALOG, async (...args: unknown[]) => {
    const request = (args[0] ?? {}) as { forceRefresh?: boolean };
    return pluginService.fetchCatalog(request.forceRefresh);
  });

  ipcMainAdapter.handle(IPC_CHANNELS.PLUGIN_INSTALL, async (...args: unknown[]) => {
    const { name } = args[0] as { name: string };
    await pluginService.install(name);
  });

  ipcMainAdapter.handle(IPC_CHANNELS.PLUGIN_UNINSTALL, async (...args: unknown[]) => {
    const { name } = args[0] as { name: string };
    await pluginService.uninstall(name);
  });

  ipcMainAdapter.handle(IPC_CHANNELS.PLUGIN_ENABLE, async (...args: unknown[]) => {
    const { name } = args[0] as { name: string };
    await pluginService.enable(name);
  });

  ipcMainAdapter.handle(IPC_CHANNELS.PLUGIN_DISABLE, async (...args: unknown[]) => {
    const { name } = args[0] as { name: string };
    await pluginService.disable(name);
  });

  ipcMainAdapter.handle(IPC_CHANNELS.PLUGIN_LIST, async () => {
    return pluginService.getInstalled();
  });

  ipcMainAdapter.handle(IPC_CHANNELS.PLUGIN_AGENT_LIST, async () => pluginAgentRegistry.getAgents());

  ipcMainAdapter.handle(IPC_CHANNELS.PLUGIN_UPDATE, async (...args: unknown[]) => {
    const { name } = args[0] as { name: string };
    await pluginService.update(name);
  });

  ipcMainAdapter.handle(IPC_CHANNELS.PLUGIN_SKILL_DETAILS, async (...args: unknown[]) => {
    const { name } = args[0] as { name: string };

    // Skills from registry (category/name structure)
    const allSkills = skillRegistry.list();
    const prefix = `plugin:${name}`;
    const skills = allSkills
      .filter(s => s.sourceId === prefix || (s.sourceId.startsWith(`${prefix}:`) && !s.sourceId.endsWith(':commands')))
      .map(s => ({ name: s.name, description: s.description }));

    // Commands: read directly from disk since they use flat file layout
    // (the skill registry expects category/name.md structure, so commands aren't indexed there)
    const commands: Array<{ name: string; description: string }> = [];
    const plugin = pluginService.getPlugin(name);
    if (plugin) {
      try {
        // Resolve the actual plugin root (handles git-subdir nesting)
        let pluginRoot = plugin.cachePath;
        const loc = plugin.catalogMeta?.location;
        if (loc && typeof loc !== 'string' && loc.type === 'git-subdir') {
          pluginRoot = path.join(plugin.cachePath, loc.path.replace(/^\.\//, ''));
        }
        const manifest = await pluginInstaller.parseManifest(pluginRoot);
        const cmdDirs: string[] = [];
        if (manifest.commands) {
          const paths = Array.isArray(manifest.commands) ? manifest.commands : [manifest.commands];
          for (const p of paths) {
            cmdDirs.push(path.join(pluginRoot, p));
          }
        } else {
          const defaultDir = path.join(pluginRoot, 'commands');
          if (fs.existsSync(defaultDir)) { cmdDirs.push(defaultDir); }
        }
        for (const dir of cmdDirs) {
          if (!fs.existsSync(dir)) { continue; }
          const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
          for (const file of files) {
            const content = fs.readFileSync(path.join(dir, file), 'utf-8');
            // Parse frontmatter inline to avoid cross-package import
            let desc = '';
            let fmName = '';
            if (content.startsWith('---')) {
              const endIdx = content.indexOf('---', 3);
              if (endIdx !== -1) {
                const yaml = content.substring(3, endIdx);
                const descMatch = yaml.match(/^description:\s*"?(.+?)"?\s*$/m);
                if (descMatch) { desc = descMatch[1].trim(); }
                const nameMatch = yaml.match(/^name:\s*(.+)$/m);
                if (nameMatch) { fmName = nameMatch[1].trim(); }
              }
            }
            if (desc) {
              commands.push({ name: fmName || file.slice(0, -3), description: desc });
            }
          }
        }
      } catch (err) {
        console.warn(`[plugin-details] Failed to read commands for ${name}:`, err);
      }
    }

    // Agents from the agent registry
    const agents = pluginAgentRegistry.getAgents()
      .filter(a => a.pluginName === name)
      .map(a => ({ name: a.name, description: a.description }));

    // Hooks: read event names from manifest
    const hooks: Array<{ name: string; description: string }> = [];
    if (plugin) {
      try {
        let hooksPluginRoot = plugin.cachePath;
        const hooksLoc = plugin.catalogMeta?.location;
        if (hooksLoc && typeof hooksLoc !== 'string' && hooksLoc.type === 'git-subdir') {
          hooksPluginRoot = path.join(plugin.cachePath, hooksLoc.path.replace(/^\.\//, ''));
        }
        const manifest = await pluginInstaller.parseManifest(hooksPluginRoot);
        const parsed = await pluginInstaller.parseHooks(hooksPluginRoot, manifest.hooks);
        if (parsed) {
          for (const eventName of Object.keys(parsed)) {
            const count = Array.isArray(parsed[eventName]) ? parsed[eventName].length : 0;
            hooks.push({ name: eventName, description: `${count} hook${count !== 1 ? 's' : ''}` });
          }
        }
      } catch (err) {
        console.warn(`[plugin-details] Failed to read hooks for ${name}:`, err);
      }
    }

    return { skills, commands, agents, hooks };
  });

  ipcMainAdapter.handle(IPC_CHANNELS.PLUGIN_VALIDATE, async (...args: unknown[]) => {
    const { path: pluginPath } = args[0] as { path: string };
    return pluginInstaller.validatePlugin(pluginPath);
  });

  // --- Marketplace IPC handlers ---

  ipcMainAdapter.handle(IPC_CHANNELS.MARKETPLACE_LIST, async () => marketplaceRegistry.list());

  ipcMainAdapter.handle(IPC_CHANNELS.MARKETPLACE_ADD, async (...args: unknown[]) => {
    const { source } = args[0] as { source: MarketplaceSource };
    return marketplaceRegistry.add(source);
  });

  ipcMainAdapter.handle(IPC_CHANNELS.MARKETPLACE_REMOVE, async (...args: unknown[]) => {
    const { name } = args[0] as { name: string };
    await marketplaceRegistry.remove(name);
  });

  ipcMainAdapter.handle(IPC_CHANNELS.MARKETPLACE_UPDATE, async (...args: unknown[]) => {
    const { name } = args[0] as { name: string };
    return marketplaceRegistry.update(name);
  });

  // --- Connector add/update IPC handlers ---

  ipcMainAdapter.handle(IPC_CHANNELS.CONNECTOR_ADD, async (...args: unknown[]) => {
    const { name, config } = args[0] as { name: string; config: MCPServerConfig };
    await configStore.addServer(name, config);
  });

  ipcMainAdapter.handle(IPC_CHANNELS.CONNECTOR_UPDATE, async (...args: unknown[]) => {
    const { name, config } = args[0] as { name: string; config: MCPServerConfig };
    await configStore.updateServer(name, config);
  });

  ipcMainAdapter.handle(IPC_CHANNELS.DIALOG_OPEN_FOLDER, async () => {
    const { dialog } = await import('electron');
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select skill directory',
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }
    return { path: result.filePaths[0] };
  });

  ipcMainAdapter.handle(IPC_CHANNELS.DIALOG_OPEN_FILE, async (...args: unknown[]) => {
    const { dialog } = await import('electron');
    const req = args[0] as { filters?: Array<{ name: string; extensions: string[] }> } | undefined;
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: 'Select file',
      filters: req?.filters,
    });
    return { path: result.canceled ? null : result.filePaths[0] ?? null };
  });

  ipcMainAdapter.handle(IPC_CHANNELS.INSTRUCTIONS_GET_PATH, async () => {
    return validateInstructionsFile(getInstructionsPath());
  });

  ipcMainAdapter.handle(IPC_CHANNELS.INSTRUCTIONS_SET_PATH, async (...args: unknown[]) => {
    const { path: newPath } = args[0] as { path: string };
    if (newPath) {
      storageService?.setSetting('instructions.filePath', newPath);
    } else {
      // Reset to default: clear the setting (empty string is falsy, so getInstructionsPath returns default)
      storageService?.setSetting('instructions.filePath', '');
    }
    return validateInstructionsFile(getInstructionsPath());
  });

  ipcMainAdapter.handle(IPC_CHANNELS.SKILL_OPEN_FILE, async (_evt: unknown, args: unknown) => {
    const { filePath: fp } = args as { filePath: string };
    const { shell } = await import('electron');
    await shell.openPath(fp);
  });

  // --- File IPC handlers ---

  const fileService = new NodeFileService();

  // Dispose file service on app quit
  app.on('will-quit', () => {
    fileService.dispose();
  });

  const workspaceRoot = os.homedir();

  function validatePath(targetPath: string): void {
    const resolved = path.resolve(targetPath);
    const resolvedRoot = path.resolve(workspaceRoot) + path.sep;
    if (resolved !== path.resolve(workspaceRoot) && !resolved.startsWith(resolvedRoot)) {
      throw new Error('Path traversal detected: path is outside workspace');
    }
  }

  ipcMainAdapter.handle(IPC_CHANNELS.WORKSPACE_GET_ROOT, async () => {
    return { path: workspaceRoot };
  });

  ipcMainAdapter.handle(IPC_CHANNELS.FILES_READ_DIR, async (...args: unknown[]) => {
    const { path: dirPath } = args[0] as { path: string };
    validatePath(dirPath);
    return fileService.readDirWithStats(dirPath);
  });

  ipcMainAdapter.handle(IPC_CHANNELS.FILES_STAT, async (...args: unknown[]) => {
    const { path: filePath } = args[0] as { path: string };
    validatePath(filePath);
    return fileService.stat(filePath);
  });

  ipcMainAdapter.handle(IPC_CHANNELS.FILES_CREATE, async (...args: unknown[]) => {
    const { path: filePath, type, content } = args[0] as { path: string; type: 'file' | 'directory'; content?: string };
    validatePath(filePath);
    if (type === 'directory') {
      await fileService.createDir(filePath);
    } else {
      await fileService.createFile(filePath, content);
    }
  });

  ipcMainAdapter.handle(IPC_CHANNELS.FILES_RENAME, async (...args: unknown[]) => {
    const { oldPath, newPath } = args[0] as { oldPath: string; newPath: string };
    validatePath(oldPath);
    validatePath(newPath);
    await fileService.rename(oldPath, newPath);
  });

  ipcMainAdapter.handle(IPC_CHANNELS.FILES_DELETE, async (...args: unknown[]) => {
    const { path: filePath } = args[0] as { path: string };
    validatePath(filePath);
    await fileService.delete(filePath);
  });

  const watchers = new Map<string, { dispose: () => void }>();
  let nextWatchId = 0;

  ipcMainAdapter.handle(IPC_CHANNELS.FILES_WATCH, async (...args: unknown[]) => {
    const { path: dirPath } = args[0] as { path: string };
    validatePath(dirPath);
    const watchId = String(nextWatchId++);
    const watcher = await fileService.watch(dirPath);
    const listener = fileService.onDidChangeFile((event) => {
      ipcMainAdapter.sendToRenderer(IPC_CHANNELS.FILES_CHANGED, event);
    });
    watchers.set(watchId, {
      dispose: () => {
        watcher.dispose();
        listener.dispose();
      },
    });
    return { watchId };
  });

  ipcMainAdapter.handle(IPC_CHANNELS.FILES_UNWATCH, async (...args: unknown[]) => {
    const { watchId } = args[0] as { watchId: string };
    const watcher = watchers.get(watchId);
    if (watcher) {
      watcher.dispose();
      watchers.delete(watchId);
    }
  });

  ipcMainAdapter.handle(IPC_CHANNELS.SHELL_SHOW_ITEM_IN_FOLDER, async (...args: unknown[]) => {
    const { path: filePath } = args[0] as { path: string };
    shell.showItemInFolder(filePath);
  });

  ipcMainAdapter.handle(IPC_CHANNELS.FILES_SEARCH, async (...args: unknown[]) => {
    const { rootPath, query, maxResults } = args[0] as { rootPath: string; query: string; maxResults?: number };
    validatePath(rootPath);
    return fileService.search(rootPath, query, maxResults);
  });

  ipcMainAdapter.handle(IPC_CHANNELS.ONBOARDING_COMPLETE, async () => {
    // Write onboarding-complete flag
    fs.writeFileSync(onboardingFilePath, JSON.stringify({ complete: true }), 'utf-8');

    // Ensure SDK is running with real token (may already be started by verification step)
    if (!useMock) {
      try {
        const { stdout: token } = await execFileAsync('gh', ['auth', 'token']);
        const tokenStr = token.trim();
        if (tokenStr) {
          await sdk.restart({ githubToken: tokenStr, useMock: false });
          console.warn('[main] SDK restarted in real mode after onboarding');
        }
      } catch (err) {
        console.error('[main] Failed to restart SDK with real token:', err instanceof Error ? err.message : String(err));
      }
    }

    return { success: true };
  });

  return services;
}
