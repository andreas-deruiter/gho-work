/**
 * IPC handlers for Dialog, Instructions, File, and Shell domains.
 */
import { shell } from 'electron';
import * as os from 'node:os';
import { IPC_CHANNELS } from '@gho-work/platform';
import { getInstructionsPath, validateInstructionsFile, validatePath } from './authHandlers.js';
import type { IpcHandlerDeps } from './types.js';

const workspaceRoot = os.homedir();

export function registerSystemHandlers(deps: IpcHandlerDeps): void {
  const {
    ipc,
    storageService,
    fileService,
  } = deps;

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
