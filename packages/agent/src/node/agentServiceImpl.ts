/**
 * AgentService — orchestrates task execution.
 * Creates SDK sessions, injects context, maps SDK events to AgentEvents via AsyncQueue.
 */
import { generateUUID } from '@gho-work/base';
import type { AgentContext, AgentEvent } from '@gho-work/base';
import type { IAgentService } from '../common/agent.js';
import type { ICopilotSDK, ISDKSession } from '../common/copilotSDK.js';
import type { SessionEvent } from '../common/types.js';
import { AsyncQueue } from '../common/asyncQueue.js';

export class AgentServiceImpl implements IAgentService {
  private _activeTaskId: string | null = null;
  private _activeSession: ISDKSession | null = null;

  constructor(
    private readonly _sdk: ICopilotSDK,
    private readonly _readContextFiles?: () => Promise<string>,
  ) {}

  async *executeTask(prompt: string, context: AgentContext): AsyncIterable<AgentEvent> {
    const taskId = generateUUID();
    this._activeTaskId = taskId;

    const queue = new AsyncQueue<AgentEvent>();

    try {
      // Build system message from context files
      let systemContent = '';
      if (this._readContextFiles) {
        systemContent = await this._readContextFiles();
      }
      if (context.systemPrompt) {
        systemContent += (systemContent ? '\n\n' : '') + context.systemPrompt;
      }

      const session = await this._sdk.createSession({
        model: context.model ?? 'gpt-4o',
        sessionId: context.conversationId,
        systemMessage: systemContent ? { mode: 'append', content: systemContent } : undefined,
        streaming: true,
      });
      this._activeSession = session;

      // Map SDK events to AgentEvents
      session.on((event: SessionEvent) => {
        const mapped = this._mapEvent(event);
        if (mapped) {
          queue.push(mapped);
          if (mapped.type === 'done') {
            queue.end();
          }
        }
      });

      // End queue if session is aborted (abort resolves without emitting session.idle)
      const origAbort = session.abort.bind(session);
      session.abort = async () => {
        await origAbort();
        queue.end();
      };

      await session.send({ prompt });
      yield* queue;
    } catch (err) {
      queue.push({
        type: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
      queue.end();
      yield* queue;
    } finally {
      this._activeTaskId = null;
      this._activeSession = null;
    }
  }

  cancelTask(_taskId: string): void {
    if (this._activeSession) {
      // abort() returns a Promise but cancelTask is sync — fire and forget
      void this._activeSession.abort();
    }
  }

  getActiveTaskId(): string | null {
    return this._activeTaskId;
  }

  private _mapEvent(event: SessionEvent): AgentEvent | null {
    const data = (event.data ?? {}) as Record<string, unknown>;
    switch (event.type) {
      case 'assistant.message_delta':
        return { type: 'text_delta', content: (data.deltaContent as string) ?? '' };
      case 'assistant.message':
        return { type: 'text', content: (data.content as string) ?? '' };
      case 'assistant.reasoning_delta':
        return { type: 'thinking', content: (data.content as string) ?? '' };
      case 'tool.execution_start':
        return {
          type: 'tool_call_start',
          toolCall: {
            id: (data.toolCallId as string) ?? generateUUID(),
            messageId: '',
            toolName: (data.toolName as string) ?? 'unknown',
            serverName: (data.mcpServerName as string) ?? 'built-in',
            arguments: (data.arguments as Record<string, unknown>) ?? {},
            permission: 'allow_once',
            status: 'executing',
            timestamp: Date.now(),
          },
        };
      case 'tool.execution_complete': {
        const result = (data.result as { content?: string }) ?? {};
        return {
          type: 'tool_call_result',
          toolCallId: data.toolCallId as string,
          result: { success: (data.success as boolean) ?? true, content: result.content ?? '' },
        };
      }
      case 'session.idle':
        return { type: 'done', messageId: generateUUID() };
      case 'session.error':
        return { type: 'error', error: (data.message as string) ?? 'Unknown error' };
      default:
        return null;
    }
  }
}
