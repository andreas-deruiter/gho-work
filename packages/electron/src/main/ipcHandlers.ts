/**
 * IPC handler registration — extracted from mainProcess.ts.
 *
 * All `ipcMainAdapter.handle(IPC_CHANNELS.XXX, ...)` calls live here, organised
 * by domain. The handlers close over a single `IpcHandlerDeps` object that is
 * assembled in mainProcess and passed in at startup.
 */
import { shell } from 'electron';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { AgentEvent, AgentContext, MCPServerConfig } from '@gho-work/base';
import {
  IPC_CHANNELS,
  SkillToggleRequestSchema,
} from '@gho-work/platform';
import type { IIPCMain } from '@gho-work/platform';
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
  ConnectorRemoveRequest,
  ConnectorConnectRequest,
  ConnectorDisconnectRequest,
} from '@gho-work/platform';
import type { SkillEntryDTO } from '@gho-work/platform';
import type { SqliteStorageService, NodeFileService } from '@gho-work/platform';
import type { ConversationServiceImpl } from '@gho-work/agent';
import type {
  CopilotSDKImpl,
  AgentServiceImpl,
  SkillRegistryImpl,
  PluginAgentRegistryImpl,
  InstructionResolver,
  SkillSource,
} from '@gho-work/agent';
import { toSdkMcpConfig } from '@gho-work/agent';
import type {
  IMCPClientManager,
  IConnectorConfigStore,
  PluginServiceImpl,
  MarketplaceRegistryImpl,
  PluginInstaller,
} from '@gho-work/connectors';
import type { MarketplaceSource } from '@gho-work/connectors';
import type { IAuthService } from '@gho-work/platform';
import { isOnboardingComplete } from './sdkLifecycle.js';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Deps interface — everything the IPC handlers need from the outside
// ---------------------------------------------------------------------------

export interface IpcHandlerDeps {
  ipc: IIPCMain;
  conversationService: ConversationServiceImpl | null;
  sdk: CopilotSDKImpl;
  agentService: AgentServiceImpl;
  sdkReady: Promise<void>;
  skillRegistry: SkillRegistryImpl;
  skillSources: SkillSource[];
  storageService: SqliteStorageService | undefined;
  mcpClientManager: IMCPClientManager;
  configStore: IConnectorConfigStore;
  pluginService: PluginServiceImpl;
  pluginInstaller: PluginInstaller;
  marketplaceRegistry: MarketplaceRegistryImpl;
  authService: IAuthService;
  fileService: NodeFileService;
  pluginAgentRegistry: PluginAgentRegistryImpl;
  instructionResolver: InstructionResolver;
  onboardingFilePath: string;
  workspaceId: string | undefined;
  useMock: boolean;
}

// ---------------------------------------------------------------------------
// Helper: list skills with disabled state overlaid from storage
// ---------------------------------------------------------------------------

function listSkillsWithDisabledState(
  skillRegistry: SkillRegistryImpl,
  storageService: SqliteStorageService | undefined,
): SkillEntryDTO[] {
  const disabledIds: string[] = JSON.parse(storageService?.getSetting('skills.disabled') ?? '[]');
  return skillRegistry.list().map(s => ({
    ...s,
    disabled: disabledIds.includes(s.id),
  }));
}

// ---------------------------------------------------------------------------
// Helper: instructions path resolution + validation
// ---------------------------------------------------------------------------

const DEFAULT_INSTRUCTIONS_PATH = path.join(os.homedir(), '.gho-work', 'gho-instructions.md');

function getInstructionsPath(storageService: SqliteStorageService | undefined): string {
  const custom = storageService?.getSetting('instructions.filePath');
  return custom || DEFAULT_INSTRUCTIONS_PATH;
}

async function validateInstructionsFile(
  filePath: string,
): Promise<{ path: string; exists: boolean; lineCount: number; isDefault: boolean }> {
  const isDefault = filePath === DEFAULT_INSTRUCTIONS_PATH;
  try {
    const content = await fs.promises.readFile(filePath, { encoding: 'utf-8' });
    const lineCount = content.split('\n').length;
    return { path: filePath, exists: true, lineCount, isDefault };
  } catch {
    return { path: filePath, exists: false, lineCount: 0, isDefault };
  }
}

// ---------------------------------------------------------------------------
// Helper: workspace path validation (prevents path traversal)
// ---------------------------------------------------------------------------

const workspaceRoot = os.homedir();

function validatePath(targetPath: string): void {
  const resolved = path.resolve(targetPath);
  const resolvedRoot = path.resolve(workspaceRoot) + path.sep;
  if (resolved !== path.resolve(workspaceRoot) && !resolved.startsWith(resolvedRoot)) {
    throw new Error('Path traversal detected: path is outside workspace');
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Registers ALL IPC handlers with the main-process IPC adapter.
 *
 * Handlers are grouped by domain. Each group is separated by a comment header.
 */
export function registerIpcHandlers(deps: IpcHandlerDeps): void {
  const {
    ipc,
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
  } = deps;

  // =========================================================================
  // Agent handlers
  // =========================================================================

  ipc.handle(IPC_CHANNELS.AGENT_SEND_MESSAGE, async (...args: unknown[]) => {
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
          ipc.sendToRenderer(IPC_CHANNELS.AGENT_EVENT, event);
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
        ipc.sendToRenderer(IPC_CHANNELS.AGENT_EVENT, errorEvent);
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
      ipc.sendToRenderer(IPC_CHANNELS.AGENT_EVENT, { type: 'done' });
    })();

    return { messageId: 'pending' };
  });

  ipc.handle(IPC_CHANNELS.AGENT_CANCEL, async () => {
    const taskId = agentService.getActiveTaskId();
    if (taskId) {
      agentService.cancelTask(taskId);
    }
  });

  // =========================================================================
  // Conversation handlers
  // =========================================================================

  ipc.handle(IPC_CHANNELS.CONVERSATION_LIST, async () => {
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

  ipc.handle(IPC_CHANNELS.CONVERSATION_CREATE, async () => {
    if (!conversationService) {
      return { id: 'no-storage', title: 'New Conversation' };
    }
    const conversation = conversationService.createConversation('gpt-4o');
    return { id: conversation.id, title: conversation.title };
  });

  ipc.handle(IPC_CHANNELS.CONVERSATION_GET, async (...args: unknown[]) => {
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

  ipc.handle(IPC_CHANNELS.CONVERSATION_DELETE, async (...args: unknown[]) => {
    const request = args[0] as ConversationDeleteRequest;
    if (conversationService) {
      conversationService.deleteConversation(request.conversationId);
    }
    return { success: true };
  });

  ipc.handle(IPC_CHANNELS.CONVERSATION_RENAME, async (...args: unknown[]) => {
    const request = args[0] as ConversationRenameRequest;
    if (conversationService) {
      conversationService.renameConversation(request.conversationId, request.title);
    }
    return { success: true };
  });

  // =========================================================================
  // Model handlers
  // =========================================================================

  ipc.handle(IPC_CHANNELS.MODEL_LIST, async () => {
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

  ipc.handle(IPC_CHANNELS.MODEL_SELECT, async (...args: unknown[]) => {
    const request = args[0] as ModelSelectRequest;
    // Store selection (for now just acknowledge — will persist via storage service later)
    return { modelId: request.modelId, success: true };
  });

  // =========================================================================
  // Quota handlers
  // =========================================================================

  ipc.handle(IPC_CHANNELS.QUOTA_GET, async () => {
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

  // =========================================================================
  // Storage handlers
  // =========================================================================

  ipc.handle(IPC_CHANNELS.STORAGE_GET, async (...args: unknown[]) => {
    const { key } = args[0] as { key: string };
    const value = storageService?.getSetting(key) ?? null;
    return { value };
  });

  ipc.handle(IPC_CHANNELS.STORAGE_SET, async (...args: unknown[]) => {
    const { key, value } = args[0] as { key: string; value: string };
    storageService?.setSetting(key, value);
    return {};
  });

  // =========================================================================
  // Auth handlers
  // =========================================================================

  ipc.handle(IPC_CHANNELS.AUTH_LOGIN, async () => {
    await authService.login();
  });

  ipc.handle(IPC_CHANNELS.AUTH_LOGOUT, async () => {
    await authService.logout();
  });

  ipc.handle(IPC_CHANNELS.AUTH_STATE, async () => {
    return authService.state;
  });

  // =========================================================================
  // Onboarding handlers
  // =========================================================================

  ipc.handle(IPC_CHANNELS.ONBOARDING_STATUS, async (): Promise<OnboardingStatusResponse> => {
    return { complete: isOnboardingComplete(onboardingFilePath) };
  });

  ipc.handle(IPC_CHANNELS.ONBOARDING_CHECK_GH, async (): Promise<GhCheckResponse> => {
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

  ipc.handle(IPC_CHANNELS.ONBOARDING_GH_LOGIN, async (): Promise<GhLoginResponse> => {
    // Helper to send progress events to renderer
    const sendLoginEvent = (event: GhLoginEvent) => {
      ipc.sendToRenderer(IPC_CHANNELS.ONBOARDING_GH_LOGIN_EVENT, event);
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

  ipc.handle(IPC_CHANNELS.ONBOARDING_CHECK_COPILOT, async (): Promise<CopilotCheckResponse> => {
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

  ipc.handle(IPC_CHANNELS.ONBOARDING_COMPLETE, async () => {
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

  // =========================================================================
  // Connector handlers
  // =========================================================================

  ipc.handle(IPC_CHANNELS.CONNECTOR_LIST, async () => {
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

  ipc.handle(IPC_CHANNELS.CONNECTOR_REMOVE, async (...args: unknown[]) => {
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

  ipc.handle(IPC_CHANNELS.CONNECTOR_CONNECT, async (...args: unknown[]) => {
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

  ipc.handle(IPC_CHANNELS.CONNECTOR_DISCONNECT, async (...args: unknown[]) => {
    const request = args[0] as ConnectorDisconnectRequest;
    try {
      await mcpClientManager.disconnectServer(request.name);
      return { success: true };
    } catch (err) {
      console.error('[mainProcess] CONNECTOR_DISCONNECT failed:', err instanceof Error ? err.message : String(err));
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipc.handle(IPC_CHANNELS.CONNECTOR_SETUP_CONVERSATION, async () => {
    try {
      const conversationId = await agentService.createSetupConversation();
      return { conversationId };
    } catch (err) {
      console.error('[mainProcess] Setup conversation failed:', err);
      return { conversationId: '', error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipc.handle(IPC_CHANNELS.CONNECTOR_ADD, async (...args: unknown[]) => {
    const { name, config } = args[0] as { name: string; config: MCPServerConfig };
    await configStore.addServer(name, config);
  });

  ipc.handle(IPC_CHANNELS.CONNECTOR_UPDATE, async (...args: unknown[]) => {
    const { name, config } = args[0] as { name: string; config: MCPServerConfig };
    await configStore.updateServer(name, config);
  });

  // =========================================================================
  // Skill handlers
  // =========================================================================

  ipc.handle(IPC_CHANNELS.SKILL_LIST, async () => {
    return listSkillsWithDisabledState(skillRegistry, storageService);
  });

  ipc.handle(IPC_CHANNELS.SKILL_SOURCES, async () => {
    return skillRegistry.getSources();
  });

  ipc.handle(IPC_CHANNELS.SKILL_ADD_PATH, async (...args: unknown[]) => {
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

    ipc.sendToRenderer(IPC_CHANNELS.SKILL_CHANGED, listSkillsWithDisabledState(skillRegistry, storageService));
    return { ok: true as const };
  });

  ipc.handle(IPC_CHANNELS.SKILL_REMOVE_PATH, async (...args: unknown[]) => {
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

    ipc.sendToRenderer(IPC_CHANNELS.SKILL_CHANGED, listSkillsWithDisabledState(skillRegistry, storageService));
  });

  ipc.handle(IPC_CHANNELS.SKILL_RESCAN, async () => {
    await skillRegistry.refresh();
    return listSkillsWithDisabledState(skillRegistry, storageService);
  });

  ipc.handle(IPC_CHANNELS.SKILL_TOGGLE, async (...args: unknown[]) => {
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

    ipc.sendToRenderer(IPC_CHANNELS.SKILL_CHANGED, listSkillsWithDisabledState(skillRegistry, storageService));
    return { ok: true as const };
  });

  ipc.handle(IPC_CHANNELS.SKILL_DISABLED_LIST, async () => {
    const raw = storageService?.getSetting('skills.disabled');
    return raw ? JSON.parse(raw) : [];
  });

  ipc.handle(IPC_CHANNELS.SKILL_OPEN_FILE, async (_evt: unknown, args: unknown) => {
    const { filePath: fp } = args as { filePath: string };
    const { shell: electronShell } = await import('electron');
    await electronShell.openPath(fp);
  });

  // =========================================================================
  // Plugin handlers
  // =========================================================================

  ipc.handle(IPC_CHANNELS.PLUGIN_CATALOG, async (...args: unknown[]) => {
    const request = (args[0] ?? {}) as { forceRefresh?: boolean };
    return pluginService.fetchCatalog(request.forceRefresh);
  });

  ipc.handle(IPC_CHANNELS.PLUGIN_INSTALL, async (...args: unknown[]) => {
    const { name } = args[0] as { name: string };
    await pluginService.install(name);
  });

  ipc.handle(IPC_CHANNELS.PLUGIN_UNINSTALL, async (...args: unknown[]) => {
    const { name } = args[0] as { name: string };
    await pluginService.uninstall(name);
  });

  ipc.handle(IPC_CHANNELS.PLUGIN_ENABLE, async (...args: unknown[]) => {
    const { name } = args[0] as { name: string };
    await pluginService.enable(name);
  });

  ipc.handle(IPC_CHANNELS.PLUGIN_DISABLE, async (...args: unknown[]) => {
    const { name } = args[0] as { name: string };
    await pluginService.disable(name);
  });

  ipc.handle(IPC_CHANNELS.PLUGIN_LIST, async () => {
    return pluginService.getInstalled();
  });

  ipc.handle(IPC_CHANNELS.PLUGIN_AGENT_LIST, async () => pluginAgentRegistry.getAgents());

  ipc.handle(IPC_CHANNELS.PLUGIN_UPDATE, async (...args: unknown[]) => {
    const { name } = args[0] as { name: string };
    await pluginService.update(name);
  });

  ipc.handle(IPC_CHANNELS.PLUGIN_SKILL_DETAILS, async (...args: unknown[]) => {
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

  ipc.handle(IPC_CHANNELS.PLUGIN_VALIDATE, async (...args: unknown[]) => {
    const { path: pluginPath } = args[0] as { path: string };
    return pluginInstaller.validatePlugin(pluginPath);
  });

  // =========================================================================
  // Marketplace handlers
  // =========================================================================

  ipc.handle(IPC_CHANNELS.MARKETPLACE_LIST, async () => marketplaceRegistry.list());

  ipc.handle(IPC_CHANNELS.MARKETPLACE_ADD, async (...args: unknown[]) => {
    const { source } = args[0] as { source: MarketplaceSource };
    return marketplaceRegistry.add(source);
  });

  ipc.handle(IPC_CHANNELS.MARKETPLACE_REMOVE, async (...args: unknown[]) => {
    const { name } = args[0] as { name: string };
    await marketplaceRegistry.remove(name);
  });

  ipc.handle(IPC_CHANNELS.MARKETPLACE_UPDATE, async (...args: unknown[]) => {
    const { name } = args[0] as { name: string };
    return marketplaceRegistry.update(name);
  });

  // =========================================================================
  // Dialog handlers
  // =========================================================================

  ipc.handle(IPC_CHANNELS.DIALOG_OPEN_FOLDER, async () => {
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

  ipc.handle(IPC_CHANNELS.DIALOG_OPEN_FILE, async (...args: unknown[]) => {
    const { dialog } = await import('electron');
    const req = args[0] as { filters?: Array<{ name: string; extensions: string[] }> } | undefined;
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: 'Select file',
      filters: req?.filters,
    });
    return { path: result.canceled ? null : result.filePaths[0] ?? null };
  });

  // =========================================================================
  // Instructions handlers
  // =========================================================================

  ipc.handle(IPC_CHANNELS.INSTRUCTIONS_GET_PATH, async () => {
    return validateInstructionsFile(getInstructionsPath(storageService));
  });

  ipc.handle(IPC_CHANNELS.INSTRUCTIONS_SET_PATH, async (...args: unknown[]) => {
    const { path: newPath } = args[0] as { path: string };
    if (newPath) {
      storageService?.setSetting('instructions.filePath', newPath);
    } else {
      // Reset to default: clear the setting (empty string is falsy, so getInstructionsPath returns default)
      storageService?.setSetting('instructions.filePath', '');
    }
    return validateInstructionsFile(getInstructionsPath(storageService));
  });

  // =========================================================================
  // File handlers
  // =========================================================================

  ipc.handle(IPC_CHANNELS.WORKSPACE_GET_ROOT, async () => {
    return { path: workspaceRoot };
  });

  ipc.handle(IPC_CHANNELS.FILES_READ_DIR, async (...args: unknown[]) => {
    const { path: dirPath } = args[0] as { path: string };
    validatePath(dirPath);
    return fileService.readDirWithStats(dirPath);
  });

  ipc.handle(IPC_CHANNELS.FILES_STAT, async (...args: unknown[]) => {
    const { path: filePath } = args[0] as { path: string };
    validatePath(filePath);
    return fileService.stat(filePath);
  });

  ipc.handle(IPC_CHANNELS.FILES_CREATE, async (...args: unknown[]) => {
    const { path: filePath, type, content } = args[0] as { path: string; type: 'file' | 'directory'; content?: string };
    validatePath(filePath);
    if (type === 'directory') {
      await fileService.createDir(filePath);
    } else {
      await fileService.createFile(filePath, content);
    }
  });

  ipc.handle(IPC_CHANNELS.FILES_RENAME, async (...args: unknown[]) => {
    const { oldPath, newPath } = args[0] as { oldPath: string; newPath: string };
    validatePath(oldPath);
    validatePath(newPath);
    await fileService.rename(oldPath, newPath);
  });

  ipc.handle(IPC_CHANNELS.FILES_DELETE, async (...args: unknown[]) => {
    const { path: filePath } = args[0] as { path: string };
    validatePath(filePath);
    await fileService.delete(filePath);
  });

  const watchers = new Map<string, { dispose: () => void }>();
  let nextWatchId = 0;

  ipc.handle(IPC_CHANNELS.FILES_WATCH, async (...args: unknown[]) => {
    const { path: dirPath } = args[0] as { path: string };
    validatePath(dirPath);
    const watchId = String(nextWatchId++);
    const watcher = await fileService.watch(dirPath);
    const listener = fileService.onDidChangeFile((event) => {
      ipc.sendToRenderer(IPC_CHANNELS.FILES_CHANGED, event);
    });
    watchers.set(watchId, {
      dispose: () => {
        watcher.dispose();
        listener.dispose();
      },
    });
    return { watchId };
  });

  ipc.handle(IPC_CHANNELS.FILES_UNWATCH, async (...args: unknown[]) => {
    const { watchId } = args[0] as { watchId: string };
    const watcher = watchers.get(watchId);
    if (watcher) {
      watcher.dispose();
      watchers.delete(watchId);
    }
  });

  ipc.handle(IPC_CHANNELS.FILES_SEARCH, async (...args: unknown[]) => {
    const { rootPath, query, maxResults } = args[0] as { rootPath: string; query: string; maxResults?: number };
    validatePath(rootPath);
    return fileService.search(rootPath, query, maxResults);
  });

  // =========================================================================
  // Shell handlers
  // =========================================================================

  ipc.handle(IPC_CHANNELS.SHELL_SHOW_ITEM_IN_FOLDER, async (...args: unknown[]) => {
    const { path: filePath } = args[0] as { path: string };
    shell.showItemInFolder(filePath);
  });
}
