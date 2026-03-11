import { createServiceIdentifier } from '@gho-work/base';
import type { ConnectorConfig } from '@gho-work/base';

export interface SessionConfig {
  model: string;
  sessionId?: string;
  systemMessage?: { content: string };
  mcpServers?: MCPServerConfig[];
  streaming?: boolean;
}

export interface SendOptions {
  prompt: string;
  attachments?: Array<{ type: 'file'; path: string; displayName?: string }>;
  mode?: 'enqueue' | 'immediate';
}

export interface MCPServerConfig {
  name: string;
  transport: 'stdio' | 'streamable_http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

export interface SessionMetadata {
  sessionId: string;
  model: string;
  createdAt: number;
}

export interface SessionEvent {
  type: string;
  [key: string]: unknown;
}

export interface SDKMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface IMCPManager {
  connect(config: ConnectorConfig): Promise<void>;
  disconnect(connectorId: string): Promise<void>;
  listTools(connectorId: string): Promise<Array<{ name: string; description: string }>>;
  callTool(connectorId: string, toolName: string, args: Record<string, unknown>): Promise<unknown>;
}

export const IMCPManager = createServiceIdentifier<IMCPManager>('IMCPManager');
