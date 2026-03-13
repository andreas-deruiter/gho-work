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
  ToolDetectResponse,
  OnboardingStatusResponse,
} from '@gho-work/platform';
import {
  ConversationServiceImpl,
  IConversationService,
  CopilotSDKImpl,
  AgentServiceImpl,
  ICopilotSDK,
  IAgentService,
} from '@gho-work/agent';
import type { AgentContext } from '@gho-work/base';
import {
  IConnectorRegistry,
  IMCPClientManager,
  ICLIDetectionService,
  IPlatformDetectionService,
  ConnectorRegistryImpl,
  MCPClientManagerImpl,
  CLIDetectionServiceImpl,
  MockCLIDetectionService,
  PlatformDetectionServiceImpl,
} from '@gho-work/connectors';
import { mapConnectorsToSDKConfig } from './connectorMapping.js';
import type {
  ConnectorRemoveRequest,
  ConnectorUpdateRequest,
  ConnectorGetToolsRequest,
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
  let _sdkReadyResolve: () => void;
  const sdkReady = new Promise<void>((resolve) => { _sdkReadyResolve = resolve; });

  void (async () => {
    if (useMock) {
      await sdk.start();
      console.log('[main] Agent started in Mock mode (--mock flag)');
      _sdkReadyResolve();
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
    _sdkReadyResolve();
  })();

  // In development, app.getAppPath() returns apps/desktop (the package directory).
  // Skills live at <repo-root>/skills/, which is 2 levels up.
  // In packaged builds, they're copied to resources/skills/.
  const skillsPath = app.isPackaged
    ? path.join(process.resourcesPath, 'skills')
    : path.join(app.getAppPath(), '..', '..', 'skills');
  const agentService = new AgentServiceImpl(sdk, conversationService, skillsPath);
  services.set(ICopilotSDK, sdk);
  services.set(IAgentService, agentService);

  // --- Connector Services ---
  let connectorRegistry: ConnectorRegistryImpl | null = null;
  let mcpClientManager: MCPClientManagerImpl | null = null;
  // CLI detection — use mock in --mock mode so sidebar populates without real tools
  const cliDetectionService = useMock
    ? new MockCLIDetectionService()
    : new CLIDetectionServiceImpl();
  services.set(ICLIDetectionService, cliDetectionService);

  const platformDetectionService = new PlatformDetectionServiceImpl(
    async (cmd: string, args: string[]) => {
      const { stdout } = await execFileAsync(cmd, args);
      return stdout;
    },
  );
  services.set(IPlatformDetectionService, platformDetectionService);

  const globalDb = storageService?.getGlobalDatabase?.();
  if (globalDb) {
    connectorRegistry = new ConnectorRegistryImpl(globalDb);
    mcpClientManager = new MCPClientManagerImpl(connectorRegistry);

    services.set(IConnectorRegistry, connectorRegistry);
    services.set(IMCPClientManager, mcpClientManager);

    // Forward status/tools events to renderer
    mcpClientManager.onDidChangeStatus((event) => {
      ipcMainAdapter.sendToRenderer(IPC_CHANNELS.CONNECTOR_STATUS_CHANGED, {
        id: event.connectorId,
        status: event.status,
      });
    });
    mcpClientManager.onDidChangeTools((event) => {
      ipcMainAdapter.sendToRenderer(IPC_CHANNELS.CONNECTOR_TOOLS_CHANGED, event);
    });

    // Auto-connect enabled servers on startup (non-blocking)
    void (async () => {
      try {
        const enabled = await connectorRegistry!.getEnabledConnectors();
        for (const c of enabled) {
          await mcpClientManager!.connectServer(c.id);
        }
        console.log(`[main] Connected ${enabled.length} MCP server(s)`);
      } catch (err) {
        console.error('[main] Error connecting MCP servers:', err instanceof Error ? err.message : String(err));
      }
    })();
  }

  // --- Set up IPC handlers ---

  ipcMainAdapter.handle(IPC_CHANNELS.AGENT_SEND_MESSAGE, async (...args: unknown[]) => {
    const request = args[0] as SendMessageRequest;

    // Build system prompt with CLI tool context so the agent knows what's available
    let systemPrompt = '';
    try {
      const tools = await cliDetectionService.detectAll();
      const installed = tools.filter(t => t.installed);
      if (installed.length > 0) {
        const lines = installed.map(t => {
          const auth = t.authenticated === true ? ' (authenticated)' : t.authenticated === false ? ' (not authenticated)' : '';
          return `- ${t.name} (${t.id}) v${t.version ?? 'unknown'}${auth}`;
        });
        systemPrompt = `## Available CLI Tools\nThe following CLI tools are installed on the user's machine and available for you to use via bash:\n${lines.join('\n')}`;
      }
    } catch (err) {
      console.warn('[main] Could not get CLI tool status for agent context:', err instanceof Error ? err.message : String(err));
    }

    const context: AgentContext = {
      conversationId: request.conversationId,
      workspaceId: workspaceId ?? 'default',
      model: request.model,
      systemPrompt: systemPrompt || undefined,
    };

    // Persist user message
    if (conversationService) {
      try {
        conversationService.addMessage(request.conversationId, {
          role: 'user',
          content: request.content,
        });
      } catch (err) { console.warn('[main] Non-critical error:', err instanceof Error ? err.message : String(err)); }
    }

    // Stream events to renderer in background
    (async () => {
      let assistantContent = '';
      try {
        // Bridge MCP connectors to SDK config
        let mcpServers: Record<string, import('@gho-work/agent').MCPServerConfig> | undefined;
        if (connectorRegistry) {
          try {
            const enabled = await connectorRegistry.getEnabledConnectors();
            const connected = enabled.filter(c => c.status === 'connected');
            if (connected.length > 0) {
              mcpServers = mapConnectorsToSDKConfig(connected);
            }
          } catch (err) { console.warn('[main] Non-critical error:', err instanceof Error ? err.message : String(err)); }
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
            role: 'assistant',
            content: assistantContent,
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

  ipcMainAdapter.handle(IPC_CHANNELS.ONBOARDING_DETECT_TOOLS, async (): Promise<ToolDetectResponse> => {
    const toolDefs = [
      { name: 'gh', description: 'GitHub CLI — Issues, PRs, repos' },
      { name: 'mgc', description: 'Microsoft Graph CLI — OneDrive, Outlook, Teams' },
      { name: 'pandoc', description: 'Document conversion — DOCX, PDF, HTML' },
      { name: 'az', description: 'Azure CLI — Cloud resources' },
      { name: 'gcloud', description: 'Google Cloud CLI' },
    ];

    const tools = await Promise.all(toolDefs.map(async (def) => {
      try {
        await execFileAsync('which', [def.name]);
        let version: string | undefined;
        try {
          const { stdout } = await execFileAsync(def.name, ['--version']);
          const match = stdout.match(/[\d]+\.[\d]+\.[\d]+/);
          if (match) {
            version = match[0];
          }
        } catch (err) {
          console.warn(`[ONBOARDING_DETECT_TOOLS] Failed to get version for ${def.name}:`, err instanceof Error ? err.message : String(err));
        }
        return { ...def, found: true, version };
      } catch {
        // Tool not found on PATH — expected if not installed
        return { ...def, found: false };
      }
    }));

    return { tools };
  });

  // --- Connector IPC handlers ---

  ipcMainAdapter.handle(IPC_CHANNELS.CONNECTOR_LIST, async () => {
    if (!connectorRegistry) {
      return { connectors: [] };
    }
    const connectors = await connectorRegistry.getConnectors();
    return { connectors };
  });

  ipcMainAdapter.handle(IPC_CHANNELS.CONNECTOR_ADD, async (...args: unknown[]) => {
    if (!connectorRegistry) {
      return;
    }
    const config = args[0] as import('@gho-work/base').ConnectorConfig;
    await connectorRegistry.addConnector(config);
    // Auto-connect if enabled
    if (config.enabled && mcpClientManager) {
      await mcpClientManager.connectServer(config.id);
    }
    ipcMainAdapter.sendToRenderer(IPC_CHANNELS.CONNECTOR_LIST_CHANGED);
    return { success: true };
  });

  ipcMainAdapter.handle(IPC_CHANNELS.CONNECTOR_REMOVE, async (...args: unknown[]) => {
    if (!connectorRegistry) {
      return;
    }
    const request = args[0] as ConnectorRemoveRequest;
    if (mcpClientManager) {
      await mcpClientManager.disconnectServer(request.id);
    }
    await connectorRegistry.removeConnector(request.id);
    ipcMainAdapter.sendToRenderer(IPC_CHANNELS.CONNECTOR_LIST_CHANGED);
  });

  ipcMainAdapter.handle(IPC_CHANNELS.CONNECTOR_UPDATE, async (...args: unknown[]) => {
    if (!connectorRegistry) {
      return;
    }
    const request = args[0] as ConnectorUpdateRequest;
    await connectorRegistry.updateConnector(request.id, request.updates);
    // Handle connect/disconnect when enabled flag changes
    if (mcpClientManager && request.updates.enabled !== undefined) {
      if (request.updates.enabled) {
        await mcpClientManager.connectServer(request.id);
      } else {
        await mcpClientManager.disconnectServer(request.id);
      }
    }
  });

  ipcMainAdapter.handle(IPC_CHANNELS.CONNECTOR_TEST, async (...args: unknown[]) => {
    if (!mcpClientManager) {
      return { success: false, error: 'Service not available' };
    }
    const config = args[0] as import('@gho-work/base').ConnectorConfig;
    return mcpClientManager.testConnection(config);
  });

  ipcMainAdapter.handle(IPC_CHANNELS.CONNECTOR_GET_TOOLS, async (...args: unknown[]) => {
    if (!mcpClientManager) {
      return { tools: [] };
    }
    const request = args[0] as ConnectorGetToolsRequest;
    const tools = await mcpClientManager.getTools(request.id);
    return { tools };
  });

  ipcMainAdapter.handle(IPC_CHANNELS.CLI_DETECT_ALL, async () => {
    const tools = await cliDetectionService.detectAll();
    return { tools };
  });

  ipcMainAdapter.handle(IPC_CHANNELS.CLI_REFRESH, async () => {
    await cliDetectionService.refresh();
  });

  // Push CLI tool status changes to renderer (e.g., after background auth completes)
  cliDetectionService.onDidChangeTools((tools) => {
    ipcMainAdapter.sendToRenderer(IPC_CHANNELS.CLI_TOOLS_CHANGED, { tools });
  });

  ipcMainAdapter.handle(IPC_CHANNELS.CLI_GET_PLATFORM_CONTEXT, async () => {
    return platformDetectionService.detect();
  });

  ipcMainAdapter.handle(IPC_CHANNELS.CONNECTOR_SETUP_CONVERSATION, async (...args: unknown[]) => {
    const { query } = (args[0] ?? {}) as { query?: string };
    try {
      const platformContext = await platformDetectionService.detect();
      const conversationId = await agentService.createSetupConversation(query, platformContext);
      return { conversationId };
    } catch (err) {
      console.error('[mainProcess] Setup conversation failed:', err);
      return { conversationId: '', error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMainAdapter.handle(IPC_CHANNELS.CLI_INSTALL, async (...args: unknown[]) => {
    const request = args[0] as { toolId: string };
    const result = await cliDetectionService.installTool(request.toolId);
    if (result.success && result.installUrl) {
      await shell.openExternal(result.installUrl);
    }
    return result;
  });

  ipcMainAdapter.handle(IPC_CHANNELS.CLI_AUTHENTICATE, async (...args: unknown[]) => {
    const request = args[0] as { toolId: string };
    const result = await cliDetectionService.authenticateTool(request.toolId);
    return result;
  });

  ipcMainAdapter.handle(IPC_CHANNELS.CLI_CREATE_AUTH_CONVERSATION, async (...args: unknown[]) => {
    const { toolId } = args[0] as { toolId: string };
    // Start auth in background to capture device code/URL
    const authResult = await cliDetectionService.authenticateTool(toolId);
    // Create conversation with auth context (device code, URL)
    const conversationId = await agentService.createAuthConversation(toolId, {
      authUrl: authResult.authUrl,
      deviceCode: authResult.deviceCode,
    });
    // Open the auth URL in browser after a delay — gives the agent time
    // to show the device code to the user first
    if (authResult.authUrl) {
      setTimeout(() => { void shell.openExternal(authResult.authUrl!); }, 3000);
    }
    return { conversationId, authUrl: authResult.authUrl, deviceCode: authResult.deviceCode };
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
