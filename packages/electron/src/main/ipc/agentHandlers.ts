/**
 * IPC handlers for Agent, Conversation, Model, and Quota domains.
 */
import { IPC_CHANNELS } from '@gho-work/platform';
import type {
  SendMessageRequest,
  ConversationGetRequest,
  ConversationDeleteRequest,
  ConversationRenameRequest,
  ModelSelectRequest,
} from '@gho-work/platform';
import type { AgentEvent, AgentContext } from '@gho-work/base';
import { toSdkMcpConfig } from '@gho-work/agent';
import type { IpcHandlerDeps } from './types.js';

export function registerAgentHandlers(deps: IpcHandlerDeps): void {
  const {
    ipc,
    conversationService,
    sdk,
    agentService,
    sdkReady,
    mcpClientManager,
    configStore,
    workspaceId,
  } = deps;

  // =========================================================================
  // Agent handlers
  // =========================================================================

  ipc.handle(IPC_CHANNELS.AGENT_SEND_MESSAGE, async (...args: unknown[]) => {
    const request = args[0] as SendMessageRequest;

    const context: AgentContext = {
      conversationId: request.conversationId,
      workspaceId: workspaceId ?? 'default',
      model: request.model,
    };

    // Ensure conversation exists in DB (auto-create if sent from welcome screen)
    if (conversationService) {
      try {
        const existing = conversationService.getConversation(request.conversationId);
        if (!existing) {
          conversationService.createConversationWithId(request.conversationId, request.model ?? 'gpt-4o');
        }
      } catch (err) { console.warn('[main] Non-critical error:', err instanceof Error ? err.message : String(err)); }
    }

    // Persist user message
    if (conversationService) {
      try {
        conversationService.addMessage(request.conversationId, {
          conversationId: request.conversationId,
          role: 'user',
          content: request.content,
          toolCalls: [],
          timestamp: Date.now(),
        });
      } catch (err) { console.warn('[main] Non-critical error:', err instanceof Error ? err.message : String(err)); }
    }

    // Stream events to renderer in background
    (async () => {
      let assistantContent = '';
      try {
        // Bridge connected MCP servers to SDK config
        let mcpServers: Parameters<typeof agentService.executeTask>[2];
        try {
          const servers = configStore.getServers();
          const connected: NonNullable<Parameters<typeof agentService.executeTask>[2]> = {};
          for (const [name, cfg] of servers) {
            if (mcpClientManager.getServerStatus(name) === 'connected') {
              connected[name] = toSdkMcpConfig(cfg);
            }
          }
          if (Object.keys(connected).length > 0) {
            mcpServers = connected;
          }
        } catch (err) {
          console.warn('[main] Non-critical error building MCP server config:', err instanceof Error ? err.message : String(err));
        }

        // Map IPC attachments to SDK format
        const sdkAttachments = request.attachments?.map(a => ({
          type: 'file' as const,
          path: a.path,
          displayName: a.name,
        }));

        for await (const event of agentService.executeTask(request.content, context, mcpServers, sdkAttachments)) {
          // Don't forward 'done' from the stream — we send our own after persist + auto-title
          if (event.type === 'done') { continue; }
          ipc.sendToRenderer(IPC_CHANNELS.AGENT_EVENT, event);
          // Accumulate assistant text for persistence
          if (event.type === 'text_delta') {
            assistantContent += event.content;
          }
        }
      } catch (err) {
        const errorEvent: AgentEvent = {
          type: 'error',
          error: err instanceof Error ? err.message : String(err),
        };
        ipc.sendToRenderer(IPC_CHANNELS.AGENT_EVENT, errorEvent);
      }

      // Persist assistant message
      if (conversationService && assistantContent) {
        try {
          conversationService.addMessage(request.conversationId, {
            conversationId: request.conversationId,
            role: 'assistant',
            content: assistantContent,
            toolCalls: [],
            timestamp: Date.now(),
          });
        } catch (err) { console.warn('[main] Non-critical error:', err instanceof Error ? err.message : String(err)); }
      }

      // Auto-title: on first message, use prompt as title (truncated to 60 chars)
      if (conversationService && request.content) {
        try {
          const conv = conversationService.getConversation(request.conversationId);
          if (conv && conv.title === 'New Conversation') {
            const title = request.content.length > 60
              ? request.content.substring(0, 57) + '...'
              : request.content;
            conversationService.renameConversation(request.conversationId, title);
          }
        } catch (err) { console.warn('[main] Non-critical error:', err instanceof Error ? err.message : String(err)); }
      }

      // Signal stream completion to renderer AFTER persist + auto-title
      ipc.sendToRenderer(IPC_CHANNELS.AGENT_EVENT, { type: 'done' });
    })();

    return { messageId: 'pending' };
  });

  ipc.handle(IPC_CHANNELS.AGENT_CANCEL, async () => {
    const taskId = agentService.getActiveTaskId();
    if (taskId) {
      agentService.cancelTask(taskId);
    }
  });

  // =========================================================================
  // Conversation handlers
  // =========================================================================

  ipc.handle(IPC_CHANNELS.CONVERSATION_LIST, async () => {
    if (!conversationService) {
      return { conversations: [] };
    }
    const conversations = conversationService.listConversations();
    return {
      conversations: conversations.map((c) => ({
        id: c.id,
        title: c.title,
        updatedAt: c.updatedAt,
      })),
    };
  });

  ipc.handle(IPC_CHANNELS.CONVERSATION_CREATE, async () => {
    if (!conversationService) {
      return { id: 'no-storage', title: 'New Conversation' };
    }
    const conversation = conversationService.createConversation('gpt-4o');
    return { id: conversation.id, title: conversation.title };
  });

  ipc.handle(IPC_CHANNELS.CONVERSATION_GET, async (...args: unknown[]) => {
    const request = args[0] as ConversationGetRequest;
    if (!conversationService) {
      return null;
    }
    const conversation = conversationService.getConversation(request.conversationId);
    if (!conversation) {
      return null;
    }
    const messages = conversationService.getMessages(request.conversationId);
    return { conversation, messages };
  });

  ipc.handle(IPC_CHANNELS.CONVERSATION_DELETE, async (...args: unknown[]) => {
    const request = args[0] as ConversationDeleteRequest;
    if (conversationService) {
      conversationService.deleteConversation(request.conversationId);
    }
    return { success: true };
  });

  ipc.handle(IPC_CHANNELS.CONVERSATION_RENAME, async (...args: unknown[]) => {
    const request = args[0] as ConversationRenameRequest;
    if (conversationService) {
      conversationService.renameConversation(request.conversationId, request.title);
    }
    return { success: true };
  });

  // =========================================================================
  // Model handlers
  // =========================================================================

  ipc.handle(IPC_CHANNELS.MODEL_LIST, async () => {
    try {
      // Wait for SDK to finish starting before listing models
      await sdkReady;
      const models = await sdk.listModels();
      return {
        models: models.map((m) => ({
          id: m.id,
          name: m.name,
          provider: m.id.startsWith('claude') ? 'anthropic' : 'openai',
        })),
      };
    } catch (err) {
      console.error('[MODEL_LIST] Failed to list models from SDK:', err);
      return {
        models: [],
        error: 'Failed to load models from SDK. Check your GitHub authentication.',
      };
    }
  });

  ipc.handle(IPC_CHANNELS.MODEL_SELECT, async (...args: unknown[]) => {
    const request = args[0] as ModelSelectRequest;
    // Store selection (for now just acknowledge — will persist via storage service later)
    return { modelId: request.modelId, success: true };
  });

  // =========================================================================
  // Quota handlers
  // =========================================================================

  ipc.handle(IPC_CHANNELS.QUOTA_GET, async () => {
    try {
      await sdkReady;
      const result = await sdk.getQuota();
      return {
        snapshots: Object.entries(result.quotaSnapshots).map(([key, snap]) => ({
          quotaType: key,
          entitlementRequests: snap.entitlementRequests,
          usedRequests: snap.usedRequests,
          remainingPercentage: snap.remainingPercentage,
          overage: snap.overage,
          overageAllowed: snap.overageAllowedWithExhaustedQuota,
          resetDate: snap.resetDate,
        })),
      };
    } catch (err) {
      console.warn('[MainProcess] Failed to get quota:', err instanceof Error ? err.message : String(err));
      return { snapshots: [] };
    }
  });
}
