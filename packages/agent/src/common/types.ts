import type { SdkMcpServerConfig } from './mcpConfigMapping.js';

export interface SessionConfig {
  model?: string;
  sessionId?: string;
  systemMessage?: SystemMessageConfig;
  mcpServers?: Record<string, SdkMcpServerConfig>;
  streaming?: boolean;
  workingDirectory?: string;
  availableTools?: string[];
  excludedTools?: string[];
  disabledSkills?: string[];
  customAgents?: Array<{
    name: string;
    displayName?: string;
    description: string;
    prompt: string;
    tools?: string[] | null;
    infer?: boolean;
    mcpServers?: Record<string, unknown>;
  }>;
}

export type SystemMessageConfig =
  | { mode?: 'append'; content?: string }
  | { mode: 'replace'; content: string };

export interface MessageOptions {
  prompt: string;
  attachments?: Array<
    | { type: 'file'; path: string; displayName?: string }
    | { type: 'directory'; path: string; displayName?: string }
  >;
  mode?: 'enqueue' | 'immediate';
}

export type { MCPServerConfig } from '@gho-work/base';

export interface SessionMetadata {
  sessionId: string;
  startTime: Date;
  modifiedTime: Date;
  summary?: string;
}

export interface SessionEvent {
  type: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SDKMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  capabilities: {
    supports: { vision: boolean; reasoningEffort: boolean };
    limits: { max_context_window_tokens: number };
  };
  policy?: { state: 'enabled' | 'disabled' | 'unconfigured' };
}

export interface PingResponse {
  message: string;
  timestamp: number;
}
