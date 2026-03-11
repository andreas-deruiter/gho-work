import { createServiceIdentifier } from '@gho-work/base';
import type { SessionConfig, SendOptions, SessionEvent, SDKMessage, SessionMetadata } from './types.js';

export interface ICopilotSDK {
  start(): Promise<void>;
  stop(): Promise<void>;
  createSession(config: SessionConfig): Promise<ISDKSession>;
  resumeSession(sessionId: string): Promise<ISDKSession>;
  listSessions(): Promise<SessionMetadata[]>;
  deleteSession(sessionId: string): Promise<void>;
  ping(): Promise<string>;
}

export const ICopilotSDK = createServiceIdentifier<ICopilotSDK>('ICopilotSDK');

export interface ISDKSession {
  readonly sessionId: string;
  send(options: SendOptions): Promise<string>;
  sendAndWait(options: SendOptions, timeout?: number): Promise<SDKMessage>;
  abort(): Promise<void>;
  on(event: string, handler: (event: SessionEvent) => void): () => void;
  on(handler: (event: SessionEvent) => void): () => void;
  getMessages(): Promise<SDKMessage[]>;
  disconnect(): Promise<void>;
}
