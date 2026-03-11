/**
 * Main process setup — wires up IPC handlers, DI container, and services.
 * This runs in Electron's main process.
 *
 * Agent execution lives in the Agent Host utility process (agentHostMain.ts).
 * The main process handles conversation persistence, auth, and model selection.
 */
import { BrowserWindow, ipcMain, shell, safeStorage } from 'electron';
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
} from '@gho-work/platform';
import {
  ConversationServiceImpl,
  IConversationService,
  MockCopilotSDK,
  AgentServiceImpl,
  ICopilotSDK,
  IAgentService,
} from '@gho-work/agent';
import type { AgentContext } from '@gho-work/base';

/**
 * Sets up the main process: DI container, IPC handlers, conversation service.
 * Returns the service collection (for testing).
 *
 * @param mainWindow - The main BrowserWindow
 * @param storageService - SqliteStorageService for workspace DB access
 * @param workspaceId - The active workspace ID
 */
export function createMainProcess(
  mainWindow: BrowserWindow,
  storageService?: SqliteStorageService,
  workspaceId?: string,
): ServiceCollection {
  const services = new ServiceCollection();

  // --- Conversation Service ---
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

  // --- Agent service (runs in main process for now, will move to utility process later) ---
  const mockSDK = new MockCopilotSDK();
  void mockSDK.start();
  const agentService = new AgentServiceImpl(mockSDK);
  services.set(ICopilotSDK, mockSDK);
  services.set(IAgentService, agentService);

  // --- Set up IPC handlers ---

  ipcMainAdapter.handle(IPC_CHANNELS.AGENT_SEND_MESSAGE, async (...args: unknown[]) => {
    const request = args[0] as SendMessageRequest;
    const context: AgentContext = {
      conversationId: request.conversationId,
      workspaceId: workspaceId ?? 'default',
      model: request.model,
    };

    // Stream events to renderer in background
    (async () => {
      try {
        for await (const event of agentService.executeTask(request.content, context)) {
          ipcMainAdapter.sendToRenderer(IPC_CHANNELS.AGENT_EVENT, event);
        }
      } catch (err) {
        const errorEvent: AgentEvent = {
          type: 'error',
          error: err instanceof Error ? err.message : String(err),
        };
        ipcMainAdapter.sendToRenderer(IPC_CHANNELS.AGENT_EVENT, errorEvent);
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
    // Return available models (mock for now, will be populated from SDK later)
    return {
      models: [
        { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
        { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic' },
      ],
    };
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

  return services;
}
