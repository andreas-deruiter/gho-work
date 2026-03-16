/**
 * AgentService — orchestrates task execution.
 * Creates SDK sessions, injects context, maps SDK events to AgentEvents via AsyncQueue.
 *
 * Composes system message from:
 *   1. Bundled persona (gho-instructions skill)
 *   2. User/project instructions (InstructionResolver)
 *   3. Per-conversation ephemeral context (context.systemPrompt)
 *
 * Registers plugin agents as customAgents on the SDK session.
 */
import * as os from 'node:os';
import { generateUUID, Emitter } from '@gho-work/base';
import type { AgentContext, AgentEvent, Event, InstalledPlugin, PluginAgentDefinition } from '@gho-work/base';
import type { AgentState, QuotaSnapshot } from '../common/agent.js';
import type { IAgentService } from '../common/agent.js';
import type { IConversationService } from '../common/conversation.js';
import type { ICopilotSDK, ISDKSession } from '../common/copilotSDK.js';
import type { MessageOptions, SessionEvent, ToolDefinition } from '../common/types.js';
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

/** Interface for the instruction resolver dependency. */
export interface IInstructionResolverLike {
  resolve(): Promise<{
    content: string;
    sources: Array<{ path: string; origin: string; format: string }>;
  }>;
}

/** Interface for the plugin agent loader dependency. */
export interface IPluginAgentLoaderLike {
  loadAll(plugins: InstalledPlugin[]): Promise<Array<{
    pluginName: string;
    definition: PluginAgentDefinition;
  }>>;
}

export class AgentServiceImpl implements IAgentService {
  private _activeTaskId: string | null = null;
  private _activeSession: ISDKSession | null = null;
  private readonly _installContexts = new Map<string, SetupSessionOverrides>();
  /** Cached sessions keyed by conversationId — enables multi-turn conversations. */
  private readonly _sessions = new Map<string, ISDKSession>();
  /** Mutable reference so the todo tool handler always pushes to the current turn's queue. */
  private _currentQueue: AsyncQueue<AgentEvent> | null = null;

  private readonly _onDidChangeAgentState = new Emitter<{ state: AgentState }>();
  readonly onDidChangeAgentState: Event<{ state: AgentState }> = this._onDidChangeAgentState.event;

  private readonly _onDidChangeQuota = new Emitter<{ snapshots: QuotaSnapshot[] }>();
  readonly onDidChangeQuota: Event<{ snapshots: QuotaSnapshot[] }> = this._onDidChangeQuota.event;

  constructor(
    private readonly _sdk: ICopilotSDK,
    private readonly _conversationService: IConversationService | null,
    private readonly _skillRegistry: ISkillRegistry,
    private readonly _instructionResolver: IInstructionResolverLike,
    private readonly _pluginAgentLoader: IPluginAgentLoaderLike,
    private readonly _getDisabledSkills?: () => string[],
    private readonly _getEnabledPlugins?: () => InstalledPlugin[],
    private readonly _pluginAgentRegistry?: IPluginAgentRegistry,
    private readonly _hookService?: IHookService,
  ) {}

  async *executeTask(prompt: string, context: AgentContext, mcpServers?: Record<string, SdkMcpServerConfig>, attachments?: MessageOptions['attachments']): AsyncIterable<AgentEvent> {
    const taskId = generateUUID();
    this._activeTaskId = taskId;
    this._onDidChangeAgentState.fire({ state: 'working' });

    const queue = new AsyncQueue<AgentEvent>();
    this._currentQueue = queue;

    try {
      // Reuse existing session for this conversation, or create a new one
      let session = this._sessions.get(context.conversationId);
      if (!session) {
        // 1. Load bundled persona (always present)
        const persona = await this._skillRegistry.getSkill('system', 'gho-instructions') ?? '';

        // 2. Resolve user/project instructions
        const instructions = await this._instructionResolver.resolve();

        // 3. Load plugin agents
        const enabledPlugins = this._getEnabledPlugins?.() ?? [];
        const pluginAgents = await this._pluginAgentLoader.loadAll(enabledPlugins);

        // 4. Map PluginAgentDefinition → SDK customAgents format
        const customAgents = pluginAgents.map(a => ({
          name: a.definition.name,
          displayName: a.definition.displayName,
          description: a.definition.description,
          prompt: a.definition.prompt,
          tools: a.definition.tools,
          infer: a.definition.infer ?? true,
          ...(a.definition.mcpServers ? { mcpServers: a.definition.mcpServers } : {}),
        }));

        // 5. Compose system message — no hardcoded model
        const systemParts = [persona, instructions.content, context.systemPrompt].filter(Boolean);
        let systemContent = systemParts.join('\n\n');

        // Apply setup overrides if this is a setup conversation
        const setupOverrides = this._installContexts.get(context.conversationId);
        if (setupOverrides) {
          systemContent = setupOverrides.systemContent + (systemContent ? '\n\n' + systemContent : '');
        }

        const disabledSkills = this._getDisabledSkills?.() ?? [];

        session = await this._sdk.createSession({
          model: context.model || undefined,
          sessionId: context.conversationId,
          systemMessage: systemContent ? { mode: 'append', content: systemContent } : undefined,
          streaming: true,
          mcpServers,
          workingDirectory: setupOverrides?.workingDirectory,
          excludedTools: setupOverrides?.excludedTools,
          disabledSkills: disabledSkills.length > 0 ? disabledSkills : undefined,
          customAgents: customAgents.length > 0 ? customAgents : undefined,
          tools: [this._buildTodoTool()],
        });
        this._sessions.set(context.conversationId, session);
        if (this._hookService) {
          this._hookService.fire('SessionStart', {}).catch(err =>
            console.warn('[AgentService] SessionStart hook error:', err)
          );
        }

        // 6. Emit context_loaded for transparency (once per session)
        queue.push({
          type: 'context_loaded',
          sources: instructions.sources.map(s => ({
            path: s.path,
            origin: s.origin as 'user' | 'project',
            format: s.format,
          })),
          agents: pluginAgents.map(a => ({
            name: a.definition.displayName ?? a.definition.name,
            plugin: a.pluginName,
          })),
          skills: this._skillRegistry.list().map(s => ({
            name: s.name,
            source: s.sourceId,
          })),
        });
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
      this._currentQueue = null;
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
      case 'subagent.started':
        return {
          type: 'subagent_started',
          parentToolCallId: (data.parentToolCallId as string) ?? '',
          name: (data.name as string) ?? '',
          displayName: (data.displayName as string) ?? (data.name as string) ?? '',
        };
      case 'subagent.completed':
        return {
          type: 'subagent_completed',
          parentToolCallId: (data.parentToolCallId as string) ?? '',
          name: (data.name as string) ?? '',
          displayName: (data.displayName as string) ?? (data.name as string) ?? '',
          state: 'completed' as const,
        };
      case 'subagent.failed':
        return {
          type: 'subagent_failed',
          parentToolCallId: (data.parentToolCallId as string) ?? '',
          name: (data.name as string) ?? '',
          error: (data.error as string) ?? 'Unknown error',
        };
      case 'skill.invoked':
        return {
          type: 'skill_invoked',
          skillName: (data.skillName as string) ?? 'unknown',
          state: (data.state as 'running' | 'completed' | 'failed') ?? 'running',
        };
      case 'session.idle':
        return { type: 'done', messageId: generateUUID() };
      case 'session.error':
        return { type: 'error', error: (data.message as string) ?? 'Unknown error' };
      default:
        return null;
    }
  }

  private _buildTodoTool(): ToolDefinition {
    let previousTodos: Array<{ id: number; title: string; status: string }> = [];
    return {
      name: 'manage_todo_list',
      description: 'Create and update a todo list for tracking multi-step tasks. Send the full list each time (replace semantics). Only one item should be in-progress at a time. Mark items completed individually.',
      parameters: {
        type: 'object',
        properties: {
          todoList: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'number', description: 'Unique identifier' },
                title: { type: 'string', description: 'Concise action-oriented label (3-7 words)' },
                status: { type: 'string', enum: ['not-started', 'in-progress', 'completed'] },
              },
              required: ['id', 'title', 'status'],
            },
          },
        },
        required: ['todoList'],
      },
      handler: async ({ todoList }: { todoList: Array<{ id: number; title: string; status: 'not-started' | 'in-progress' | 'completed' }> }) => {
        // Use mutable _currentQueue so multi-turn conversations push to the active queue
        this._currentQueue?.push({ type: 'todo_list_updated', todos: todoList });
        const msg = this._buildTodoConfirmation(todoList, previousTodos);
        previousTodos = todoList;
        return msg;
      },
    };
  }

  private _buildTodoConfirmation(
    current: Array<{ id: number; title: string; status: string }>,
    previous: Array<{ id: number; title: string; status: string }>,
  ): string {
    const completed = current.filter(t => t.status === 'completed').length;
    const total = current.length;
    if (previous.length === 0) {
      return `Created ${total} todos`;
    }
    const newlyCompleted = current.find(t =>
      t.status === 'completed' && previous.find(p => p.id === t.id)?.status !== 'completed'
    );
    if (newlyCompleted) {
      return `Completed: *${newlyCompleted.title}* (${completed}/${total})`;
    }
    const newlyStarted = current.find(t =>
      t.status === 'in-progress' && previous.find(p => p.id === t.id)?.status !== 'in-progress'
    );
    if (newlyStarted) {
      return `Starting: *${newlyStarted.title}* (${completed}/${total})`;
    }
    return `Updated todos (${completed}/${total})`;
  }
}
