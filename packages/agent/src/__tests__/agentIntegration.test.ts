import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { configurePragmas, migrateDatabase, WORKSPACE_MIGRATIONS } from '@gho-work/platform';
import type { AgentEvent } from '@gho-work/base';
import { MockCopilotSDK } from '../node/mockCopilotSDK.js';
import { AgentServiceImpl } from '../node/agentServiceImpl.js';
import { ConversationServiceImpl } from '../node/conversationServiceImpl.js';
import { SkillRegistryImpl } from '../node/skillRegistryImpl.js';

const noopInstructionResolver = { resolve: async () => ({ content: '', sources: [] }) };
const noopPluginAgentLoader = { loadAll: async () => [] };

describe('Agent Integration', () => {
  let db: Database.Database;
  let sdk: MockCopilotSDK;
  let agentService: AgentServiceImpl;
  let conversationService: ConversationServiceImpl;

  beforeEach(async () => {
    db = new Database(':memory:');
    configurePragmas(db);
    migrateDatabase(db, WORKSPACE_MIGRATIONS);
    conversationService = new ConversationServiceImpl(db);

    sdk = new MockCopilotSDK();
    await sdk.start();
    const registry = new SkillRegistryImpl([]);
    await registry.scan();
    agentService = new AgentServiceImpl(sdk, null, registry, noopInstructionResolver, noopPluginAgentLoader);
  });

  afterEach(async () => {
    await sdk.stop();
    db.close();
  });

  it('executes a full chat flow: create conversation, send message, persist', async () => {
    // Create conversation
    const conv = conversationService.createConversation('gpt-4o');
    expect(conv.id).toBeTruthy();

    // Persist user message
    const userMsg = conversationService.addMessage(conv.id, {
      conversationId: conv.id,
      role: 'user',
      content: 'Hello',
      toolCalls: [],
      timestamp: Date.now(),
    });
    expect(userMsg.id).toBeTruthy();

    // Execute task and collect events
    const events: AgentEvent[] = [];
    for await (const event of agentService.executeTask('Hello', {
      conversationId: conv.id,
      workspaceId: 'test',
      model: 'gpt-4o',
    })) {
      events.push(event);
    }

    // Should have text deltas and a done event
    const types = new Set(events.map((e) => e.type));
    expect(types.has('text_delta')).toBe(true);
    expect(types.has('done')).toBe(true);

    // Persist assistant message
    const fullText = events
      .filter((e) => e.type === 'text_delta')
      .map((e) => (e as { type: 'text_delta'; content: string }).content)
      .join('');

    const assistantMsg = conversationService.addMessage(conv.id, {
      conversationId: conv.id,
      role: 'assistant',
      content: fullText,
      toolCalls: [],
      timestamp: Date.now(),
    });
    expect(assistantMsg.id).toBeTruthy();

    // Verify persistence
    const messages = conversationService.getMessages(conv.id);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');
    expect(typeof messages[1].content === 'string' ? messages[1].content.length : 0).toBeGreaterThan(0);
  });

  it('executes a task with tool calls and persists them', async () => {
    const conv = conversationService.createConversation('gpt-4o');
    conversationService.addMessage(conv.id, {
      conversationId: conv.id,
      role: 'user',
      content: 'Search for files',
      toolCalls: [],
      timestamp: Date.now(),
    });

    // Create assistant message placeholder for tool calls
    const assistantMsg = conversationService.addMessage(conv.id, {
      conversationId: conv.id,
      role: 'assistant',
      content: '',
      toolCalls: [],
      timestamp: Date.now(),
    });

    const events: AgentEvent[] = [];
    for await (const event of agentService.executeTask('Search for files', {
      conversationId: conv.id,
      workspaceId: 'test',
    })) {
      events.push(event);

      // Persist tool calls as they arrive
      if (event.type === 'tool_call_start') {
        conversationService.addToolCall(assistantMsg.id, conv.id, {
          messageId: assistantMsg.id,
          toolName: event.toolCall.toolName,
          serverName: event.toolCall.serverName,
          arguments: event.toolCall.arguments,
          result: null,
          permission: 'allow_once',
          status: 'pending',
          durationMs: null,
          timestamp: Date.now(),
        });
      }
    }

    // Should have tool call events (prompt mentions "search" and "files")
    const toolStarts = events.filter((e) => e.type === 'tool_call_start');
    expect(toolStarts.length).toBeGreaterThan(0);

    // Verify tool call persistence
    const toolCalls = conversationService.getToolCalls(conv.id);
    expect(toolCalls.length).toBeGreaterThan(0);
  });

  it('persists multiple conversations independently', () => {
    const conv1 = conversationService.createConversation('gpt-4o');
    const conv2 = conversationService.createConversation('claude-sonnet');

    conversationService.addMessage(conv1.id, {
      conversationId: conv1.id,
      role: 'user',
      content: 'Message in conv 1',
      toolCalls: [],
      timestamp: Date.now(),
    });

    conversationService.addMessage(conv2.id, {
      conversationId: conv2.id,
      role: 'user',
      content: 'Message in conv 2',
      toolCalls: [],
      timestamp: Date.now(),
    });

    expect(conversationService.getMessages(conv1.id)).toHaveLength(1);
    expect(conversationService.getMessages(conv2.id)).toHaveLength(1);
    expect(conversationService.listConversations()).toHaveLength(2);
  });
});
