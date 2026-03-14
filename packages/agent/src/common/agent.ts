import { createServiceIdentifier } from '@gho-work/base';
import type { AgentContext, AgentEvent, Event } from '@gho-work/base';
import type { MCPServerConfig, MessageOptions } from './types.js';
import type { SdkMcpServerConfig } from './mcpConfigMapping.js';

export type AgentState = 'idle' | 'working' | 'error';

export interface QuotaSnapshot {
  quotaType: string;
  entitlementRequests: number;
  usedRequests: number;
  remainingPercentage: number;
  overage: number;
  overageAllowed: boolean;
  resetDate?: string;
}

export interface IAgentService {
  readonly onDidChangeAgentState: Event<{ state: AgentState }>;
  readonly onDidChangeQuota: Event<{ snapshots: QuotaSnapshot[] }>;
  executeTask(prompt: string, context: AgentContext, mcpServers?: Record<string, SdkMcpServerConfig>, attachments?: MessageOptions['attachments']): AsyncIterable<AgentEvent>;
  cancelTask(taskId: string): void;
  getActiveTaskId(): string | null;
  createSetupConversation(): Promise<string>;
  getInstallContext(conversationId: string): string | undefined;
}

export const IAgentService = createServiceIdentifier<IAgentService>('IAgentService');
