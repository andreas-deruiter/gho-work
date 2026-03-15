/**
 * AgentService — orchestrates task execution.
 * Creates SDK sessions, injects context, maps SDK events to AgentEvents via AsyncQueue.
 */
import * as os from 'node:os';
import { generateUUID, Emitter } from '@gho-work/base';
import type { AgentContext, AgentEvent, Event } from '@gho-work/base';
import type { AgentState, QuotaSnapshot } from '../common/agent.js';
import type { IAgentService } from '../common/agent.js';
import type { IConversationService } from '../common/conversation.js';
import type { ICopilotSDK, ISDKSession } from '../common/copilotSDK.js';
import type { MessageOptions, SessionEvent } from '../common/types.js';
import type { SdkMcpServerConfig } from '../common/mcpConfigMapping.js';
import { AsyncQueue } from '../common/asyncQueue.js';
import type { ISkillRegistry } from '../common/skillRegistry.js';
import type { IPluginAgentRegistry } from '../common/pluginAgentRegistry.js';
import type { IHookService } from '../common/hookService.js';

interface SetupSessionOverrides {
  systemContent: string;
  workingDirectory?: string;
  excludedTools?: string[];
}

export class AgentServiceImpl implements IAgentService {
  private _activeTaskId: string | null = null;
  private _activeSession: ISDKSession | null = null;
  private readonly _installContexts = new Map<string, SetupSessionOverrides>();
  /** Cached sessions keyed by conversationId — enables multi-turn conversations. */
  private readonly _sessions = new Map<string, ISDKSession>();

  private readonly _onDidChangeAgentState = new Emitter<{ state: AgentState }>();
  readonly onDidChangeAgentState: Event<{ state: AgentState }> = this._onDidChangeAgentState.event;

  private readonly _onDidChangeQuota = new Emitter<{ snapshots: QuotaSnapshot[] }>();
  readonly onDidChangeQuota: Event<{ snapshots: QuotaSnapshot[] }> = this._onDidChangeQuota.event;

  constructor(
    private readonly _sdk: ICopilotSDK,
    private readonly _conversationService: IConversationService | null,
    private readonly _skillRegistry: ISkillRegistry,
    private readonly _readContextFiles?: () => Promise<string>,
    private readonly _getDisabledSkills?: () => string[],
    private readonly _pluginAgentRegistry?: IPluginAgentRegistry,
    private readonly _hookService?: IHookService,
  ) {}

  async *executeTask(prompt: string, context: AgentContext, mcpServers?: Record<string, SdkMcpServerConfig>, attachments?: MessageOptions['attachments']): AsyncIterable<AgentEvent> {
    const taskId = generateUUID();
    this._activeTaskId = taskId;
    this._onDidChangeAgentState.fire({ state: 'working' });

    const queue = new AsyncQueue<AgentEvent>();

    try {
      // Reuse existing session for this conversation, or create a new one
      let session = this._sessions.get(context.conversationId);
      if (!session) {
        // Build system message from context files
        let systemContent = '';
        if (this._readContextFiles) {
          systemContent = await this._readContextFiles();
        }
        if (context.systemPrompt) {
          systemContent += (systemContent ? '\n\n' : '') + context.systemPrompt;
        }

        // Apply setup overrides if this is a setup conversation
        const setupOverrides = this._installContexts.get(context.conversationId);
        if (setupOverrides) {
          systemContent = setupOverrides.systemContent + (systemContent ? '\n\n' + systemContent : '');
        }

        const disabledSkills = this._getDisabledSkills?.() ?? [];

        session = await this._sdk.createSession({
          model: context.model ?? 'gpt-4o',
          sessionId: context.conversationId,
          systemMessage: systemContent ? { mode: 'append', content: systemContent } : undefined,
          streaming: true,
          mcpServers,
          workingDirectory: setupOverrides?.workingDirectory,
          excludedTools: setupOverrides?.excludedTools,
          disabledSkills: disabledSkills.length > 0 ? disabledSkills : undefined,
        });
        this._sessions.set(context.conversationId, session);
        if (this._hookService) {
          this._hookService.fire('SessionStart', {}).catch(err =>
            console.warn('[AgentService] SessionStart hook error:', err)
          );
        }
      }
      this._activeSession = session;

      // Map SDK events to AgentEvents (re-register each turn since queue is new)
      const unsubscribe = session.on((event: SessionEvent) => {
        const mapped = this._mapEvent(event);
        if (mapped) {
          queue.push(mapped);
          if (mapped.type === 'done') {
            queue.end();
          }
        }
        // Fire PostToolUse hook after tool execution completes (non-blocking)
        if (event.type === 'tool.execution_complete' && this._hookService) {
          const d = (event.data ?? {}) as Record<string, unknown>;
          const result = (d.result as { content?: string }) ?? {};
          this._hookService.fire('PostToolUse', {
            toolName: d.toolName as string | undefined,
            toolInput: d.arguments,
            toolResult: result.content,
          }).catch(err => console.warn('[AgentService] Hook error:', err));
        }
      });

      // End queue if session is aborted (abort resolves without emitting session.idle)
      const origAbort = session.abort.bind(session);
      session.abort = async () => {
        await origAbort();
        queue.end();
      };

      await session.send({ prompt, attachments });
      yield* queue;
      unsubscribe();
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
      this._onDidChangeAgentState.fire({ state: 'idle' });
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

  async createSetupConversation(): Promise<string> {
    if (!this._conversationService) {
      throw new Error('Setup conversations require conversation service (no workspace)');
    }
    const setupSkill = await this._loadSkill('connectors', 'setup');
    const conversation = this._conversationService.createConversation('default');
    this._conversationService.renameConversation(conversation.id, 'Set up connector');
    this._installContexts.set(conversation.id, {
      systemContent: setupSkill ?? '',
      // Scope the agent to the user's home directory — NOT the project folder.
      // This prevents the agent from exploring source code while still allowing
      // bash for running CLI commands (npx, uvx, docker, etc.).
      workingDirectory: os.homedir(),
    });
    return conversation.id;
  }

  getInstallContext(conversationId: string): string | undefined {
    return this._installContexts.get(conversationId)?.systemContent;
  }

  private async _loadSkill(category: string, toolId: string): Promise<string | undefined> {
    const skillId = `${category}/${toolId}`;
    const disabled = this._getDisabledSkills?.() ?? [];
    if (disabled.includes(skillId)) {
      return undefined;
    }
    return this._skillRegistry.getSkill(category, toolId);
  }

  private _mapEvent(event: SessionEvent): AgentEvent | null {
    const data = (event.data ?? {}) as Record<string, unknown>;
    switch (event.type) {
      case 'assistant.message_delta':
        return { type: 'text_delta', content: (data.deltaContent as string) ?? '' };
      case 'assistant.message':
        return { type: 'text', content: (data.content as string) ?? '' };
      case 'assistant.reasoning_delta':
        return { type: 'thinking_delta', content: (data.deltaContent as string) ?? (data.content as string) ?? '' };
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
        const fileMeta = data.fileMeta as { path: string; size: number; action: 'created' | 'modified' } | undefined;
        return {
          type: 'tool_call_result',
          toolCallId: data.toolCallId as string,
          result: { success: (data.success as boolean) ?? true, content: result.content ?? '' },
          ...(fileMeta ? { fileMeta } : {}),
        };
      }
      case 'assistant.usage': {
        const quotaSnapshots = data.quotaSnapshots as Record<string, Record<string, unknown>> | undefined;
        if (quotaSnapshots) {
          this._onDidChangeQuota.fire({
            snapshots: Object.entries(quotaSnapshots).map(([key, snap]) => ({
              quotaType: key,
              remainingPercentage: (snap.remainingPercentage as number) ?? 0,
              entitlementRequests: (snap.entitlementRequests as number) ?? 0,
              usedRequests: (snap.usedRequests as number) ?? 0,
              overage: (snap.overage as number) ?? 0,
              overageAllowed: (snap.overageAllowedWithExhaustedQuota as boolean) ?? false,
              resetDate: snap.resetDate as string | undefined,
            })),
          });
        }
        return null;
      }
      case 'plan.created': {
        const steps = (data.steps as Array<{ id: string; label: string }>) ?? [];
        return {
          type: 'plan_created',
          plan: { id: (data.planId as string) ?? generateUUID(), steps },
        };
      }
      case 'plan.step_updated':
        return {
          type: 'plan_step_updated',
          planId: data.planId as string,
          stepId: data.stepId as string,
          state: data.state as 'pending' | 'running' | 'completed' | 'failed',
          messageId: (data.messageId as string) ?? undefined,
          startedAt: data.state === 'running' ? Date.now() : undefined,
          completedAt: data.state === 'completed' ? Date.now() : undefined,
          error: (data.error as string) ?? undefined,
        };
      case 'skill.invoked':
        return {
          type: 'skill_invoked',
          skillName: (data.skillName as string) ?? 'unknown',
          state: (data.state as 'running' | 'completed' | 'failed') ?? 'running',
        };
      case 'subagent.started':
        return {
          type: 'subagent_started',
          subagentId: (data.subagentId as string) ?? generateUUID(),
          subagentName: (data.subagentName as string) ?? (data.name as string) ?? 'subagent',
        };
      case 'subagent.completed':
      case 'subagent.failed':
        return {
          type: 'subagent_completed',
          subagentId: (data.subagentId as string) ?? '',
          state: event.type === 'subagent.completed' ? 'completed' : 'failed',
        };
      case 'session.idle':
        return { type: 'done', messageId: generateUUID() };
      case 'session.error':
        return { type: 'error', error: (data.message as string) ?? 'Unknown error' };
      default:
        return null;
    }
  }
}
