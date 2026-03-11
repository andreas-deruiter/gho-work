import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getAppPath: () => '/mock',
    getPath: () => '/mock',
    whenReady: () => Promise.resolve(),
    on: vi.fn(),
    quit: vi.fn(),
  },
  BrowserWindow: class {
    isDestroyed() {
      return false;
    }
    loadURL() {}
    loadFile() {}
    on() {}
    webContents = { send: vi.fn(), postMessage: vi.fn() };
  },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  shell: { openExternal: vi.fn() },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: () => Buffer.from(''),
    decryptString: () => '',
  },
}));

import { createMainProcess } from '../main-process.js';
import { BrowserWindow } from 'electron';

describe('electron main process', () => {
  it('createMainProcess returns a ServiceCollection', () => {
    const win = new BrowserWindow() as InstanceType<typeof BrowserWindow>;
    const services = createMainProcess(win);
    expect(services).toBeDefined();
  });
});
