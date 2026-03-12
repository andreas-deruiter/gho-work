/**
 * AgentService — orchestrates task execution.
 * Creates SDK sessions, injects context, maps SDK events to AgentEvents via AsyncQueue.
 */
import { generateUUID } from '@gho-work/base';
import type { AgentContext, AgentEvent, PlatformContext } from '@gho-work/base';
import type { IAgentService } from '../common/agent.js';
import type { IConversationService } from '../common/conversation.js';
import type { ICopilotSDK, ISDKSession } from '../common/copilotSDK.js';
import type { MCPServerConfig, SessionEvent } from '../common/types.js';
import { AsyncQueue } from '../common/asyncQueue.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

function formatPackageManagers(pm: PlatformContext['packageManagers']): string {
  const items: string[] = [];
  items.push(pm.brew ? 'brew: available' : 'brew: not found');
  items.push(pm.winget ? 'winget: available' : 'winget: not found');
  items.push(pm.chocolatey ? 'chocolatey: available' : 'chocolatey: not found');
  return items.join(', ');
}

export class AgentServiceImpl implements IAgentService {
  private _activeTaskId: string | null = null;
  private _activeSession: ISDKSession | null = null;
  private readonly _installContexts = new Map<string, string>();

  constructor(
    private readonly _sdk: ICopilotSDK,
    private readonly _conversationService: IConversationService | null,
    private readonly _bundledSkillsPath: string,
    private readonly _readContextFiles?: () => Promise<string>,
  ) {}

  async *executeTask(prompt: string, context: AgentContext, mcpServers?: Record<string, MCPServerConfig>): AsyncIterable<AgentEvent> {
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

      // Prepend install context if available for this conversation
      const installContext = this._installContexts.get(context.conversationId);
      if (installContext) {
        systemContent = installContext + (systemContent ? '\n\n' + systemContent : '');
      }

      const session = await this._sdk.createSession({
        model: context.model ?? 'gpt-4o',
        sessionId: context.conversationId,
        systemMessage: systemContent ? { mode: 'append', content: systemContent } : undefined,
        streaming: true,
        mcpServers,
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

  async createInstallConversation(toolId: string, platformContext: PlatformContext): Promise<string> {
    if (!this._conversationService) {
      throw new Error('Install conversations require conversation service (no workspace)');
    }
    const skillContent = await this._loadInstallSkill(toolId);
    if (!skillContent) {
      throw new Error(`Install skill not found for tool: ${toolId}`);
    }
    const platformInfo = [
      `## Platform`,
      `- OS: ${platformContext.os}`,
      `- Architecture: ${platformContext.arch}`,
      `- Package managers: ${formatPackageManagers(platformContext.packageManagers)}`,
    ].join('\n');
    const systemMessage = `${skillContent}\n\n${platformInfo}`;
    const toolNames: Record<string, string> = {
      gh: 'GitHub CLI', pandoc: 'pandoc', git: 'git',
      mgc: 'Microsoft Graph CLI', az: 'Azure CLI',
      gcloud: 'Google Cloud CLI', workiq: 'Work IQ CLI',
    };
    const conversation = this._conversationService.createConversation('default');
    this._conversationService.renameConversation(conversation.id, `Install ${toolNames[toolId] ?? toolId}`);
    this._installContexts.set(conversation.id, systemMessage);
    return conversation.id;
  }

  getInstallContext(conversationId: string): string | undefined {
    return this._installContexts.get(conversationId);
  }

  private async _loadInstallSkill(toolId: string): Promise<string | undefined> {
    const skillPath = path.join(this._bundledSkillsPath, 'install', `${toolId}.md`);
    try {
      return await fs.readFile(skillPath, 'utf-8');
    } catch {
      return undefined;
    }
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
