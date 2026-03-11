/**
 * Main process setup — wires up IPC handlers, DI container, and agent service.
 * This runs in Electron's main process.
 */
import { BrowserWindow, ipcMain, shell, safeStorage } from 'electron';
import { ServiceCollection } from '@gho-work/base';
import type { AgentContext, AgentEvent } from '@gho-work/base';
import { IPC_CHANNELS, IIPCMain, AuthServiceImpl, SecureStorageService, IAuthService, ISecureStorageService } from '@gho-work/platform';
import type { SendMessageRequest } from '@gho-work/platform';
import { ICopilotSDK, IAgentService, MockCopilotSDK, MockAgentService } from '@gho-work/agent';

/**
 * Sets up the main process: DI container, IPC handlers, agent service.
 * Returns a function to get the service collection (for testing).
 */
export function createMainProcess(mainWindow: BrowserWindow): ServiceCollection {
  const services = new ServiceCollection();

  // --- Register services ---

  // Mock Copilot SDK (will be replaced with real SDK)
  const mockSDK = new MockCopilotSDK();
  services.set(ICopilotSDK, mockSDK);

  // Agent service (uses the SDK)
  const agentService = new MockAgentService(mockSDK);
  services.set(IAgentService, agentService);

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

  // --- Set up IPC handlers ---

  ipcMainAdapter.handle(IPC_CHANNELS.AGENT_SEND_MESSAGE, async (...args: unknown[]) => {
    const request = args[0] as SendMessageRequest;
    const context: AgentContext = {
      conversationId: request.conversationId,
      workspaceId: 'spike-workspace',
      model: request.model,
    };

    // Run agent in background, stream events to renderer
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
    agentService.cancelTask('current');
  });

  ipcMainAdapter.handle(IPC_CHANNELS.CONVERSATION_LIST, async () => {
    return { conversations: [] };
  });

  ipcMainAdapter.handle(IPC_CHANNELS.CONVERSATION_CREATE, async () => {
    return { id: 'spike-conversation', title: 'New Conversation' };
  });

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
