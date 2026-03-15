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
  IPC_CHANNELS.CONNECTOR_ADD,
  IPC_CHANNELS.CONNECTOR_UPDATE,
  IPC_CHANNELS.PLUGIN_CATALOG,
  IPC_CHANNELS.PLUGIN_INSTALL,
  IPC_CHANNELS.PLUGIN_UNINSTALL,
  IPC_CHANNELS.PLUGIN_ENABLE,
  IPC_CHANNELS.PLUGIN_DISABLE,
  IPC_CHANNELS.PLUGIN_LIST,
  IPC_CHANNELS.PLUGIN_UPDATE,
  IPC_CHANNELS.PLUGIN_VALIDATE,
  IPC_CHANNELS.PLUGIN_SKILL_DETAILS,
  IPC_CHANNELS.PLUGIN_AGENT_LIST,
  IPC_CHANNELS.MARKETPLACE_LIST,
  IPC_CHANNELS.MARKETPLACE_ADD,
  IPC_CHANNELS.MARKETPLACE_REMOVE,
  IPC_CHANNELS.MARKETPLACE_UPDATE,
  IPC_CHANNELS.STORAGE_GET,
  IPC_CHANNELS.STORAGE_SET,
  IPC_CHANNELS.SKILL_LIST,
  IPC_CHANNELS.SKILL_SOURCES,
  IPC_CHANNELS.SKILL_ADD_PATH,
  IPC_CHANNELS.SKILL_REMOVE_PATH,
  IPC_CHANNELS.SKILL_RESCAN,
  IPC_CHANNELS.SKILL_TOGGLE,
  IPC_CHANNELS.SKILL_DISABLED_LIST,
  IPC_CHANNELS.SKILL_OPEN_FILE,
  IPC_CHANNELS.DIALOG_OPEN_FOLDER,
  IPC_CHANNELS.FILES_READ_DIR,
  IPC_CHANNELS.FILES_STAT,
  IPC_CHANNELS.FILES_CREATE,
  IPC_CHANNELS.FILES_RENAME,
  IPC_CHANNELS.FILES_DELETE,
  IPC_CHANNELS.FILES_WATCH,
  IPC_CHANNELS.FILES_UNWATCH,
  IPC_CHANNELS.FILES_SEARCH,
  IPC_CHANNELS.WORKSPACE_GET_ROOT,
  IPC_CHANNELS.QUOTA_GET,
];

const ALLOWED_LISTEN_CHANNELS = [
  IPC_CHANNELS.AGENT_EVENT,
  IPC_CHANNELS.AUTH_STATE_CHANGED,
  IPC_CHANNELS.ONBOARDING_GH_LOGIN_EVENT,
  IPC_CHANNELS.CONNECTOR_STATUS_CHANGED,
  IPC_CHANNELS.CONNECTOR_LIST_CHANGED,
  IPC_CHANNELS.SKILL_CHANGED,
  IPC_CHANNELS.FILES_CHANGED,
  IPC_CHANNELS.AGENT_STATE_CHANGED,
  IPC_CHANNELS.QUOTA_CHANGED,
  IPC_CHANNELS.PLUGIN_CHANGED,
  IPC_CHANNELS.PLUGIN_INSTALL_PROGRESS,
  IPC_CHANNELS.PLUGIN_UPDATES_AVAILABLE,
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
