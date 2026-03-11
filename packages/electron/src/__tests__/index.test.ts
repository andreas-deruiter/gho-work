import { describe, it, expect, vi } from 'vitest';

// Capture IPC handlers registered via ipcMain.handle
const ipcHandlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();

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
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => Promise<unknown>) => {
      ipcHandlers.set(channel, handler);
    }),
    on: vi.fn(),
  },
  shell: { openExternal: vi.fn() },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: () => Buffer.from(''),
    decryptString: () => '',
  },
  utilityProcess: { fork: vi.fn() },
  MessageChannelMain: vi.fn(),
}));

import { createMainProcess } from '../main/mainProcess.js';
import { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '@gho-work/platform';

describe('electron main process', () => {
  it('createMainProcess returns a ServiceCollection', () => {
    const win = new BrowserWindow() as InstanceType<typeof BrowserWindow>;
    const services = createMainProcess(win);
    expect(services).toBeDefined();
  });

  it('AGENT_SEND_MESSAGE handler streams events to renderer', async () => {
    ipcHandlers.clear();
    const win = new BrowserWindow() as InstanceType<typeof BrowserWindow>;
    const sendSpy = win.webContents.send as ReturnType<typeof vi.fn>;
    sendSpy.mockClear();

    createMainProcess(win);

    // Wait for async SDK initialization (CopilotSDKImpl starts async with mock fallback)
    await new Promise((r) => setTimeout(r, 3000));

    // Verify the handler was registered
    const handler = ipcHandlers.get(IPC_CHANNELS.AGENT_SEND_MESSAGE);
    expect(handler).toBeDefined();

    // Invoke the handler like Electron would (first arg is IpcMainInvokeEvent, rest are user args)
    await handler!({} as never, { conversationId: 'test', content: 'Hello' });

    // Wait for async streaming to complete (mock agent takes ~500ms)
    await new Promise((r) => setTimeout(r, 2000));

    // Verify events were sent to the renderer
    const agentEventCalls = sendSpy.mock.calls.filter(
      (call: unknown[]) => call[0] === IPC_CHANNELS.AGENT_EVENT,
    );
    expect(agentEventCalls.length).toBeGreaterThan(0);

    // Should have at least text_delta and done events
    const eventTypes = agentEventCalls.map((call: unknown[]) => (call[1] as { type: string }).type);
    expect(eventTypes).toContain('text_delta');
    expect(eventTypes).toContain('done');
  }, 15000);

  it('AGENT_CANCEL handler does not throw', async () => {
    ipcHandlers.clear();
    const win = new BrowserWindow() as InstanceType<typeof BrowserWindow>;
    createMainProcess(win);

    const handler = ipcHandlers.get(IPC_CHANNELS.AGENT_CANCEL);
    expect(handler).toBeDefined();
    await expect(handler!({} as never)).resolves.not.toThrow();
  });
});
