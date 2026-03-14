import { createServiceIdentifier } from '@gho-work/base';
import type { AgentContext, AgentEvent, Event } from '@gho-work/base';
import type { MCPServerConfig, MessageOptions } from './types.js';

export type AgentState = 'idle' | 'working' | 'error';

export interface IAgentService {
  readonly onDidChangeAgentState: Event<{ state: AgentState }>;
  executeTask(prompt: string, context: AgentContext, mcpServers?: Record<string, MCPServerConfig>, attachments?: MessageOptions['attachments']): AsyncIterable<AgentEvent>;
  cancelTask(taskId: string): void;
  getActiveTaskId(): string | null;
  createSetupConversation(): Promise<string>;
  getInstallContext(conversationId: string): string | undefined;
}

export const IAgentService = createServiceIdentifier<IAgentService>('IAgentService');
