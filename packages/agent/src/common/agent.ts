import { createServiceIdentifier } from '@gho-work/base';
import type { AgentContext, AgentEvent } from '@gho-work/base';
import type { MCPServerConfig } from './types.js';

export interface IAgentService {
  executeTask(prompt: string, context: AgentContext, mcpServers?: Record<string, MCPServerConfig>): AsyncIterable<AgentEvent>;
  cancelTask(taskId: string): void;
  getActiveTaskId(): string | null;
}

export const IAgentService = createServiceIdentifier<IAgentService>('IAgentService');
