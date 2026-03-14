import { createServiceIdentifier } from '@gho-work/base';
import type { AgentContext, AgentEvent } from '@gho-work/base';
import type { MessageOptions } from './types.js';
import type { SdkMcpServerConfig } from './mcpConfigMapping.js';

export interface IAgentService {
  executeTask(prompt: string, context: AgentContext, mcpServers?: Record<string, SdkMcpServerConfig>, attachments?: MessageOptions['attachments']): AsyncIterable<AgentEvent>;
  cancelTask(taskId: string): void;
  getActiveTaskId(): string | null;
  createSetupConversation(): Promise<string>;
  getInstallContext(conversationId: string): string | undefined;
}

export const IAgentService = createServiceIdentifier<IAgentService>('IAgentService');
