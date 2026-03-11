/**
 * IPC channel definitions and typed message protocol.
 * These define the contract between main process and renderer.
 */
import { createServiceId } from '@gho-work/base';

// --- IPC Channel Names ---

export const IPC_CHANNELS = {
  // Renderer -> Main (invoke)
  AGENT_SEND_MESSAGE: 'agent:send-message',
  AGENT_CANCEL: 'agent:cancel',
  CONVERSATION_LIST: 'conversation:list',
  CONVERSATION_CREATE: 'conversation:create',

  // Main -> Renderer (send)
  AGENT_EVENT: 'agent:event',
} as const;

// --- IPC Message Types ---

export interface SendMessageRequest {
  conversationId: string;
  content: string;
  model?: string;
}

export interface SendMessageResponse {
  messageId: string;
}

export interface ConversationListResponse {
  conversations: Array<{ id: string; title: string; updatedAt: number }>;
}

// --- IPC Service Interface ---

/**
 * Abstraction over Electron IPC for the renderer side.
 * In the renderer, this calls through contextBridge.
 * Can be mocked for testing.
 */
export interface IIPCRenderer {
  invoke<T>(channel: string, ...args: unknown[]): Promise<T>;
  on(channel: string, callback: (...args: unknown[]) => void): void;
  removeListener(channel: string, callback: (...args: unknown[]) => void): void;
}

export const IIPCRenderer = createServiceId<IIPCRenderer>('IIPCRenderer');

/**
 * Abstraction over Electron IPC for the main process side.
 */
export interface IIPCMain {
  handle(channel: string, handler: (...args: unknown[]) => Promise<unknown>): void;
  sendToRenderer(channel: string, ...args: unknown[]): void;
}

export const IIPCMain = createServiceId<IIPCMain>('IIPCMain');
