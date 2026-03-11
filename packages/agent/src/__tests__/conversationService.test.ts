import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { configurePragmas, migrateDatabase, WORKSPACE_MIGRATIONS } from '@gho-work/platform';
import { ConversationServiceImpl } from '../node/conversationServiceImpl.js';

describe('ConversationServiceImpl', () => {
  let db: Database.Database;
  let service: ConversationServiceImpl;

  beforeEach(() => {
    db = new Database(':memory:');
    configurePragmas(db);
    migrateDatabase(db, WORKSPACE_MIGRATIONS);
    service = new ConversationServiceImpl(db);
  });

  afterEach(() => {
    db.close();
  });

  it('creates and lists conversations', () => {
    const c1 = service.createConversation('gpt-4');
    const c2 = service.createConversation('claude-opus');

    expect(c1.title).toBe('New Conversation');
    expect(c1.model).toBe('gpt-4');
    expect(c1.status).toBe('active');
    expect(c1.workspaceId).toBe('');

    // Update c1 so it has a later updated_at
    service.renameConversation(c1.id, 'First');

    const list = service.listConversations();
    expect(list).toHaveLength(2);
    // Most recently updated first (c1 was renamed after c2 was created)
    expect(list[0].id).toBe(c1.id);
    expect(list[1].id).toBe(c2.id);
  });

  it('gets a conversation by id', () => {
    const created = service.createConversation('gpt-4');
    const fetched = service.getConversation(created.id);

    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.model).toBe('gpt-4');

    expect(service.getConversation('nonexistent')).toBeUndefined();
  });

  it('renames a conversation', () => {
    const c = service.createConversation('gpt-4');
    service.renameConversation(c.id, 'My Chat');

    const fetched = service.getConversation(c.id);
    expect(fetched!.title).toBe('My Chat');
    expect(fetched!.updatedAt).toBeGreaterThanOrEqual(c.updatedAt);
  });

  it('deletes a conversation and its messages (cascade)', () => {
    const c = service.createConversation('gpt-4');
    const msg = service.addMessage(c.id, {
      conversationId: c.id,
      role: 'user',
      content: 'Hello',
      toolCalls: [],
      timestamp: Date.now(),
    });
    service.addToolCall(msg.id, c.id, {
      messageId: msg.id,
      toolName: 'read_file',
      serverName: 'fs',
      arguments: { path: '/tmp' },
      result: null,
      permission: 'allow_once',
      status: 'pending',
      durationMs: null,
      timestamp: Date.now(),
    });

    service.deleteConversation(c.id);

    expect(service.getConversation(c.id)).toBeUndefined();
    expect(service.getMessages(c.id)).toHaveLength(0);
    expect(service.getToolCalls(c.id)).toHaveLength(0);
  });

  it('archives a conversation', () => {
    const c = service.createConversation('gpt-4');
    service.archiveConversation(c.id);

    const fetched = service.getConversation(c.id);
    expect(fetched!.status).toBe('archived');

    // Archived conversations are not listed
    const list = service.listConversations();
    expect(list).toHaveLength(0);
  });

  it('adds and retrieves messages', () => {
    const c = service.createConversation('gpt-4');

    const m1 = service.addMessage(c.id, {
      conversationId: c.id,
      role: 'user',
      content: 'Hello',
      toolCalls: [],
      timestamp: Date.now(),
    });

    const m2 = service.addMessage(c.id, {
      conversationId: c.id,
      role: 'assistant',
      content: 'Hi there!',
      toolCalls: [],
      timestamp: Date.now(),
    });

    expect(m1.id).toBeDefined();
    expect(m1.role).toBe('user');
    expect(m1.content).toBe('Hello');
    expect(m1.toolCalls).toEqual([]);

    const messages = service.getMessages(c.id);
    expect(messages).toHaveLength(2);
    expect(messages[0].id).toBe(m1.id);
    expect(messages[1].id).toBe(m2.id);
    expect(messages[1].content).toBe('Hi there!');

    // Conversation updated_at should be bumped
    const updated = service.getConversation(c.id);
    expect(updated!.updatedAt).toBeGreaterThanOrEqual(c.updatedAt);
  });

  it('handles structured content in messages', () => {
    const c = service.createConversation('gpt-4');
    const structured = { type: 'markdown' as const, data: '# Hello' };

    const msg = service.addMessage(c.id, {
      conversationId: c.id,
      role: 'assistant',
      content: structured,
      toolCalls: [],
      timestamp: Date.now(),
    });

    expect(msg.content).toEqual(structured);

    const messages = service.getMessages(c.id);
    expect(messages[0].content).toEqual(structured);
  });

  it('adds and updates tool calls', () => {
    const c = service.createConversation('gpt-4');
    const msg = service.addMessage(c.id, {
      conversationId: c.id,
      role: 'assistant',
      content: 'Let me check that.',
      toolCalls: [],
      timestamp: Date.now(),
    });

    const tc = service.addToolCall(msg.id, c.id, {
      messageId: msg.id,
      toolName: 'read_file',
      serverName: 'filesystem',
      arguments: { path: '/tmp/test.txt' },
      result: null,
      permission: 'allow_once',
      status: 'pending',
      durationMs: null,
      timestamp: Date.now(),
    });

    expect(tc.id).toBeDefined();
    expect(tc.toolName).toBe('read_file');
    expect(tc.serverName).toBe('filesystem');
    expect(tc.arguments).toEqual({ path: '/tmp/test.txt' });
    expect(tc.status).toBe('pending');
    expect(tc.result).toBeNull();
    expect(tc.permission).toBe('allow_once');

    // Update status and result
    const result = { success: true, content: 'file contents' };
    service.updateToolCall(tc.id, {
      status: 'completed',
      result,
      durationMs: 42,
    });

    const toolCalls = service.getToolCalls(c.id);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].status).toBe('completed');
    expect(toolCalls[0].result).toEqual(result);
    expect(toolCalls[0].durationMs).toBe(42);
  });
});
