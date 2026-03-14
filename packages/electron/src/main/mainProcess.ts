/**
 * Main process setup — wires up IPC handlers, DI container, and services.
 * This runs in Electron's main process.
 *
 * Agent execution lives in the Agent Host utility process (agentHostMain.ts).
 * The main process handles conversation persistence, auth, and model selection.
 */
import { app, BrowserWindow, ipcMain, shell, safeStorage } from 'electron';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ServiceCollection } from '@gho-work/base';
import type { AgentEvent } from '@gho-work/base';
import {
  IPC_CHANNELS,
  IIPCMain,
  AuthServiceImpl,
  SecureStorageService,
  IAuthService,
  ISecureStorageService,
  SqliteStorageService,
  NodeFileService,
} from '@gho-work/platform';
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
  ConversationServiceImpl,
  IConversationService,
  CopilotSDKImpl,
  AgentServiceImpl,
  ICopilotSDK,
  IAgentService,
  SkillRegistryImpl,
  buildSkillSources,
} from '@gho-work/agent';
import * as os from 'node:os';
import type { AgentContext } from '@gho-work/base';
import {
  IMCPClientManager,
  IConnectorConfigStore,
  ConnectorConfigStoreImpl,
  MCPClientManagerImpl,
  handleAddMCPServer,
  handleRemoveMCPServer,
  handleListMCPServers,
} from '@gho-work/connectors';
import type {
  ConnectorRemoveRequest,
  ConnectorConnectRequest,
  ConnectorDisconnectRequest,
} from '@gho-work/platform';

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
}

export function createMainProcess(
  mainWindow: BrowserWindow,
  storageService?: SqliteStorageService,
  workspaceId?: string,
  options?: MainProcessOptions,
): ServiceCollection {
  const services = new ServiceCollection();

  // --- Storage & Conversation Service ---
  // If no storageService was provided but userDataPath is set, create one.
  // better-sqlite3 may fail to load if the native module was compiled for a different
  // Node ABI (e.g., system Node vs Electron). Catch and degrade gracefully.
  if (!storageService && options?.userDataPath) {
    try {
      const globalDbPath = path.join(options.userDataPath, 'global.db');
      const workspaceDbDir = path.join(options.userDataPath, 'workspaces');
      storageService = new SqliteStorageService(globalDbPath, workspaceDbDir);
      workspaceId = 'default';
    } catch (err) {
      console.error('[main] CRITICAL: SQLite storage unavailable:', (err as Error).message);
      console.error('[main] Conversations, settings, and install/auth flows will not work.');
      console.error('[main] Fix: npx @electron/rebuild -w better-sqlite3 --module-dir apps/desktop');
      // Show error dialog so the user knows the app is degraded — never silently continue
      void import('electron').then(({ dialog }) => {
        dialog.showErrorBox(
          'GHO Work — Storage Unavailable',
          'The database module failed to load. Conversations and settings will not work.\n\n'
          + 'To fix, quit the app and run:\n'
          + 'npx @electron/rebuild -w better-sqlite3 --module-dir apps/desktop\n\n'
          + `Error: ${(err as Error).message}`,
        );
      });
    }
  }

  let conversationService: ConversationServiceImpl | null = null;
  if (storageService && workspaceId) {
    const db = storageService.getWorkspaceDatabase(workspaceId);
    conversationService = new ConversationServiceImpl(db);
    services.set(IConversationService, conversationService);
  }

  // In-memory key-value store for secure storage (backed by safeStorage encryption)
  const _tokenStore = new Map<string, string>();
  const secureStorage: ISecureStorageService = new SecureStorageService(safeStorage, {
    read: (key: string) => _tokenStore.get(key) ?? null,
    write: (key: string, value: string) => { _tokenStore.set(key, value); },
    delete: (key: string) => { _tokenStore.delete(key); },
  });
  services.set(ISecureStorageService, secureStorage);

  // Auth service
  const authService: IAuthService = new AuthServiceImpl(secureStorage, {
    openExternal: (url: string) => shell.openExternal(url),
    createLocalServer: async (port: number) => {
      const http = await import('node:http');
      return new Promise((resolve) => {
        let _resolve: (url: string) => void;
        const callbackPromise = new Promise<string>((res) => { _resolve = res; });
        const server = http.createServer((req, res) => {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body>Authentication complete. You may close this tab.</body></html>');
          _resolve(req.url ?? '/');
          server.close();
        });
        server.listen(port, '127.0.0.1', () => {
          resolve({
            waitForCallback: () => callbackPromise,
            close: () => server.close(),
          });
        });
      });
    },
    fetchJson: async (url: string, headers?: Record<string, string>) => {
      const { default: https } = await import('node:https');
      return new Promise((resolve, reject) => {
        const req = https.get(url, { headers }, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => { resolve(JSON.parse(data)); });
        });
        req.on('error', reject);
      });
    },
  });
  services.set(IAuthService, authService);

  // Subscribe to auth state changes and push to renderer
  authService.onDidChangeAuth((state) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.AUTH_STATE_CHANGED, state);
    }
  });

  // IPC Main adapter
  const ipcMainAdapter: import('@gho-work/platform').IIPCMain = {
    handle(channel: string, handler: (...args: unknown[]) => Promise<unknown>) {
      ipcMain.handle(channel, (_event, ...args) => handler(...args));
    },
    sendToRenderer(channel: string, ...args: unknown[]) {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, ...args);
      }
    },
  };
  services.set(IIPCMain, ipcMainAdapter);

  // --- Onboarding state ---
  const execFileAsync = promisify(execFile);
  const onboardingFilePath = path.join(app.getPath('userData'), 'onboarding-complete.json');

  function isOnboardingComplete(): boolean {
    try {
      const data = JSON.parse(fs.readFileSync(onboardingFilePath, 'utf-8'));
      return data?.complete === true;
    } catch {
      return false;
    }
  }

  // --- Agent service (runs in main process for now, will move to utility process later) ---
  const useMock = options?.useMockSDK === true;
  const sdk = new CopilotSDKImpl({ cwd: process.cwd(), useMock });

  // Start SDK async — store promise so IPC handlers can await readiness.
  // - If --mock flag: start in mock mode immediately
  // - If onboarding complete: start with real gh token
  // - If onboarding incomplete: defer start until ONBOARDING_COMPLETE handler
  let _sdkReadyResolve: (() => void) | undefined;
  const sdkReady = new Promise<void>((resolve) => { _sdkReadyResolve = resolve; });

  void (async () => {
    if (useMock) {
      await sdk.start();
      console.log('[main] Agent started in Mock mode (--mock flag)');
      _sdkReadyResolve?.();
      return;
    }

    if (isOnboardingComplete()) {
      try {
        const { stdout: token } = await execFileAsync('gh', ['auth', 'token']);
        if (token.trim()) {
          (sdk as any)._options.githubToken = token.trim();
        }
      } catch (err) {
        console.warn('[main] Could not get gh auth token, SDK will use default auth:', err instanceof Error ? err.message : String(err));
      }

      try {
        await sdk.start();
        console.log('[main] Agent started in Copilot SDK mode');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[main] CRITICAL: Copilot SDK failed to start:', msg);
        // Show error to user — never silently degrade to a broken state
        const { dialog } = await import('electron');
        dialog.showErrorBox(
          'GHO Work — Agent Unavailable',
          'The Copilot SDK failed to start. The AI agent will not work.\n\n'
          + 'This usually means GitHub authentication is missing or expired.\n'
          + 'Try: gh auth login\n\n'
          + `Error: ${msg}`,
        );
      }
    } else {
      console.log('[main] SDK start deferred — waiting for onboarding to complete');
    }
    _sdkReadyResolve?.();
  })();

  // Skill registry: multi-source skill discovery with priority-based deduplication.
  // In development, app.getAppPath() returns apps/desktop (the package directory).
  // Bundled skills live at <repo-root>/skills/, which is 2 levels up.
  // In packaged builds, they're copied to resources/skills/.
  const bundledSkillsPath = app.isPackaged
    ? path.join(process.resourcesPath, 'skills')
    : path.join(app.getAppPath(), '..', '..', 'skills');
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
          skillSources.push({ id: `additional-${i + 1}`, priority: 20, basePath: additionalPaths[i] });
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
  const agentService = new AgentServiceImpl(sdk, conversationService, skillRegistry);
  services.set(ICopilotSDK, sdk);
  services.set(IAgentService, agentService);

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

  // Auto-reconcile on startup — connect all configured servers (non-blocking)
  void (async () => {
    try {
      const servers = configStore.getServers();
      if (servers.size > 0) {
        await mcpClientManager.reconcile(servers);
        console.log(`[main] Reconciled ${servers.size} MCP server(s) on startup`);
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
        let mcpServers: Record<string, import('@gho-work/agent').MCPServerConfig> | undefined;
        try {
          const servers = configStore.getServers();
          const connected: Record<string, import('@gho-work/agent').MCPServerConfig> = {};
          for (const [name, cfg] of servers) {
            if (mcpClientManager.getServerStatus(name) === 'connected') {
              // Map base MCPServerConfig to agent MCPServerConfig (adds tools: string[])
              connected[name] = { ...cfg, tools: [] };
            }
          }
          if (Object.keys(connected).length > 0) {
            mcpServers = connected;
          }
        } catch (err) {
          console.warn('[main] Non-critical error building MCP server config:', err instanceof Error ? err.message : String(err));
        }

        for await (const event of agentService.executeTask(request.content, context, mcpServers)) {
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
    return { complete: isOnboardingComplete() };
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
          console.log(`[main] Copilot check: ${sdkModels.length} models available`);
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
    const result = Array.from(servers.entries()).map(([name, config]) => ({
      name,
      type: config.type,
      status: mcpClientManager.getServerStatus(name),
    }));
    return { servers: result };
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
    return skillRegistry.list();
  });

  ipcMainAdapter.handle(IPC_CHANNELS.SKILL_SOURCES, async () => {
    return skillSources;
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

    ipcMainAdapter.sendToRenderer(IPC_CHANNELS.SKILL_CHANGED, skillRegistry.list());
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

    ipcMainAdapter.sendToRenderer(IPC_CHANNELS.SKILL_CHANGED, skillRegistry.list());
  });

  ipcMainAdapter.handle(IPC_CHANNELS.SKILL_RESCAN, async () => {
    await skillRegistry.refresh();
    return skillRegistry.list();
  });

  // --- File IPC handlers ---

  const fileService = new NodeFileService();

  // Dispose file service on app quit
  app.on('will-quit', () => {
    fileService.dispose();
  });

  const workspaceRoot = process.cwd();

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
          console.log('[main] SDK restarted in real mode after onboarding');
        }
      } catch (err) {
        console.error('[main] Failed to restart SDK with real token:', err instanceof Error ? err.message : String(err));
      }
    }

    return { success: true };
  });

  return services;
}
