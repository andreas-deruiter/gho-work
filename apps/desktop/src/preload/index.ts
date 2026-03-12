/**
 * Preload script — re-exports from @gho-work/electron.
 * This file is the preload entry point for electron-vite.
 */
import { contextBridge, ipcRenderer } from 'electron';

// Whitelist of allowed channels
const ALLOWED_INVOKE_CHANNELS = [
  'agent:send-message',
  'agent:cancel',
  'conversation:list',
  'conversation:create',
  'conversation:get',
  'conversation:delete',
  'conversation:rename',
  'model:list',
  'model:select',
  'auth:login',
  'auth:logout',
  'auth:state',
  'storage:get',
  'storage:set',
  'onboarding:check-gh',
  'onboarding:gh-login',
  'onboarding:check-copilot',
  'onboarding:detect-tools',
  'onboarding:complete',
  'onboarding:status',
  'connector:list',
  'connector:add',
  'connector:remove',
  'connector:update',
  'connector:test',
  'connector:get-tools',
  'cli:detect-all',
  'cli:refresh',
  'cli:install',
  'cli:authenticate',
];

const ALLOWED_LISTEN_CHANNELS = [
  'agent:event',
  'auth:state-changed',
  'onboarding:gh-login-event',
  'connector:status-changed',
  'connector:tools-changed',
];

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
