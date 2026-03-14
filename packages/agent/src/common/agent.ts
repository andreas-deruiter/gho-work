import { createServiceIdentifier } from '@gho-work/base';
import type { AgentContext, AgentEvent } from '@gho-work/base';
import type { MCPServerConfig, MessageOptions } from './types.js';

export interface IAgentService {
  executeTask(prompt: string, context: AgentContext, mcpServers?: Record<string, MCPServerConfig>, attachments?: MessageOptions['attachments']): AsyncIterable<AgentEvent>;
  cancelTask(taskId: string): void;
  getActiveTaskId(): string | null;
  createSetupConversation(): Promise<string>;
  getInstallContext(conversationId: string): string | undefined;
}

export const IAgentService = createServiceIdentifier<IAgentService>('IAgentService');
