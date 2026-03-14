import { createServiceIdentifier } from '@gho-work/base';
import type { SessionConfig, MessageOptions, SessionEvent, SessionMetadata, ModelInfo, PingResponse } from './types.js';

export interface QuotaSnapshotRaw {
  entitlementRequests: number;
  usedRequests: number;
  remainingPercentage: number;
  overage: number;
  overageAllowedWithExhaustedQuota: boolean;
  resetDate?: string;
}

export interface SDKQuotaResult {
  quotaSnapshots: Record<string, QuotaSnapshotRaw>;
}

export interface ICopilotSDK {
  start(): Promise<void>;
  stop(): Promise<Error[]>;
  createSession(config: SessionConfig): Promise<ISDKSession>;
  resumeSession(sessionId: string, config?: Partial<SessionConfig>): Promise<ISDKSession>;
  listSessions(): Promise<SessionMetadata[]>;
  deleteSession(sessionId: string): Promise<void>;
  listModels(): Promise<ModelInfo[]>;
  ping(message?: string): Promise<PingResponse>;
  restart(options?: { githubToken?: string; useMock?: boolean }): Promise<void>;
  getQuota(): Promise<SDKQuotaResult>;
}

export const ICopilotSDK = createServiceIdentifier<ICopilotSDK>('ICopilotSDK');

export interface ISDKSession {
  readonly sessionId: string;
  send(options: MessageOptions): Promise<string>;
  sendAndWait(options: MessageOptions, timeout?: number): Promise<SessionEvent | undefined>;
  abort(): Promise<void>;
  setModel(model: string): Promise<void>;
  on(event: string, handler: (event: SessionEvent) => void): () => void;
  on(handler: (event: SessionEvent) => void): () => void;
  getMessages(): Promise<SessionEvent[]>;
  disconnect(): Promise<void>;
}
