/**
 * Preload script — exposes safe IPC bridge to renderer via contextBridge.
 * This is the security boundary between main and renderer processes.
 */
import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@gho-work/platform/common';

// Whitelist of allowed channels
const ALLOWED_INVOKE_CHANNELS = [
  IPC_CHANNELS.AGENT_SEND_MESSAGE,
  IPC_CHANNELS.AGENT_CANCEL,
  IPC_CHANNELS.CONVERSATION_LIST,
  IPC_CHANNELS.CONVERSATION_CREATE,
  IPC_CHANNELS.CONVERSATION_GET,
  IPC_CHANNELS.CONVERSATION_DELETE,
  IPC_CHANNELS.CONVERSATION_RENAME,
  IPC_CHANNELS.MODEL_LIST,
  IPC_CHANNELS.MODEL_SELECT,
  IPC_CHANNELS.AUTH_LOGIN,
  IPC_CHANNELS.AUTH_LOGOUT,
  IPC_CHANNELS.AUTH_STATE,
  IPC_CHANNELS.ONBOARDING_CHECK_GH,
  IPC_CHANNELS.ONBOARDING_GH_LOGIN,
  IPC_CHANNELS.ONBOARDING_CHECK_COPILOT,
  IPC_CHANNELS.ONBOARDING_COMPLETE,
  IPC_CHANNELS.ONBOARDING_STATUS,
  IPC_CHANNELS.CONNECTOR_LIST,
  IPC_CHANNELS.CONNECTOR_REMOVE,
  IPC_CHANNELS.CONNECTOR_CONNECT,
  IPC_CHANNELS.CONNECTOR_DISCONNECT,
  IPC_CHANNELS.CONNECTOR_SETUP_CONVERSATION,
  IPC_CHANNELS.STORAGE_GET,
  IPC_CHANNELS.STORAGE_SET,
  IPC_CHANNELS.SKILL_LIST,
  IPC_CHANNELS.SKILL_SOURCES,
  IPC_CHANNELS.SKILL_ADD_PATH,
  IPC_CHANNELS.SKILL_REMOVE_PATH,
  IPC_CHANNELS.SKILL_RESCAN,
  IPC_CHANNELS.SKILL_TOGGLE,
  IPC_CHANNELS.SKILL_DISABLED_LIST,
  IPC_CHANNELS.DIALOG_OPEN_FOLDER,
];

const ALLOWED_LISTEN_CHANNELS = [
  IPC_CHANNELS.AGENT_EVENT,
  IPC_CHANNELS.AUTH_STATE_CHANGED,
  IPC_CHANNELS.ONBOARDING_GH_LOGIN_EVENT,
  IPC_CHANNELS.CONNECTOR_STATUS_CHANGED,
  IPC_CHANNELS.CONNECTOR_LIST_CHANGED,
  IPC_CHANNELS.SKILL_CHANGED,
];

// Map from caller-provided callback to the wrapped ipcRenderer handler,
// so removeListener can correctly deregister the wrapper (not the raw callback).
type IPCCallback = (...args: unknown[]) => void;
type IPCHandler = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => void;
const _listenerMap = new Map<IPCCallback, IPCHandler>();

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
    _listenerMap.set(callback, handler);
    ipcRenderer.on(channel, handler);
  },
  removeListener: (channel: string, callback: (...args: unknown[]) => void) => {
    const handler = _listenerMap.get(callback);
    if (handler) {
      ipcRenderer.removeListener(channel, handler);
      _listenerMap.delete(callback);
    }
  },
});
