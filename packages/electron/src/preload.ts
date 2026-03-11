/**
 * Preload script — exposes safe IPC bridge to renderer via contextBridge.
 * This is the security boundary between main and renderer processes.
 */
import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@gho-work/platform';

// Whitelist of allowed channels
const ALLOWED_INVOKE_CHANNELS = [
  IPC_CHANNELS.AGENT_SEND_MESSAGE,
  IPC_CHANNELS.AGENT_CANCEL,
  IPC_CHANNELS.CONVERSATION_LIST,
  IPC_CHANNELS.CONVERSATION_CREATE,
];

const ALLOWED_LISTEN_CHANNELS = [
  IPC_CHANNELS.AGENT_EVENT,
];

export function createPreloadScript(): void {
  contextBridge.exposeInMainWorld('ghoWorkIPC', {
    invoke: (channel: string, ...args: unknown[]) => {
      if (!ALLOWED_INVOKE_CHANNELS.includes(channel)) {
        throw new Error(`IPC channel not allowed: ${channel}`);
      }
      return ipcRenderer.invoke(channel, ...args);
    },
    on: (channel: string, callback: (...args: unknown[]) => void) => {
      if (!ALLOWED_LISTEN_CHANNELS.includes(channel)) {
        throw new Error(`IPC channel not allowed: ${channel}`);
      }
      const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args);
      ipcRenderer.on(channel, handler);
    },
    removeListener: (channel: string, callback: (...args: unknown[]) => void) => {
      ipcRenderer.removeListener(channel, callback);
    },
  });
}

// Auto-execute when loaded as preload script
createPreloadScript();
