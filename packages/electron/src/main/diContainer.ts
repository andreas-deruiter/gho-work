/**
 * DI container setup — creates and wires core services (storage, auth, IPC adapter).
 *
 * Extracted from mainProcess.ts to keep the orchestrator focused on IPC handler
 * registration. Everything here is pure service construction with no IPC wiring.
 */
import { ipcMain, shell, safeStorage } from 'electron';
import type { BrowserWindow } from 'electron';
import * as path from 'node:path';
import { ServiceCollection } from '@gho-work/base';
import {
  IPC_CHANNELS,
  IIPCMain,
  AuthServiceImpl,
  SecureStorageService,
  IAuthService,
  ISecureStorageService,
  SqliteStorageService,
} from '@gho-work/platform';
import {
  ConversationServiceImpl,
  IConversationService,
} from '@gho-work/agent';

/**
 * Result of DI container creation — all services needed by mainProcess.
 *
 * `storageService` and `workspaceId` may differ from the inputs if SQLite
 * was lazily initialised inside the container (no-storage → new instance).
 */
export interface DIContainerResult {
  services: ServiceCollection;
  storageService: SqliteStorageService | undefined;
  workspaceId: string | undefined;
  conversationService: ConversationServiceImpl | null;
  authService: IAuthService;
  ipcMainAdapter: IIPCMain;
}

/**
 * Creates the DI container with core services: storage, conversation,
 * auth (with secure-storage backing), and the IPC main adapter.
 *
 * @param mainWindow   - The main BrowserWindow (needed for sendToRenderer)
 * @param storageService - Optional pre-created SQLite storage
 * @param workspaceId    - Optional workspace identifier
 * @param options        - MainProcessOptions subset (only userDataPath used here)
 */
export function createDIContainer(
  mainWindow: BrowserWindow,
  storageService: SqliteStorageService | undefined,
  workspaceId: string | undefined,
  options?: { userDataPath?: string },
): DIContainerResult {
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
  const ipcMainAdapter: IIPCMain = {
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

  return {
    services,
    storageService,
    workspaceId,
    conversationService,
    authService,
    ipcMainAdapter,
  };
}
