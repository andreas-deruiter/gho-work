import { createServiceIdentifier } from '@gho-work/base';
import type { AgentContext, AgentEvent } from '@gho-work/base';

export interface IAgentService {
  executeTask(prompt: string, context: AgentContext): AsyncIterable<AgentEvent>;
  cancelTask(taskId: string): void;
  getActiveTaskId(): string | null;
}

export const IAgentService = createServiceIdentifier<IAgentService>('IAgentService');
