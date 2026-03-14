import type Database from 'better-sqlite3';
import { generateUUID } from '@gho-work/base';
import type { Conversation, Message, ToolCall, ToolResult, StructuredContent } from '@gho-work/base';
import type { IConversationService } from '../common/conversation.js';

interface ConversationRow {
  id: string;
  title: string;
  model: string;
  status: 'active' | 'archived';
  metadata: string | null;
  created_at: number;
  updated_at: number;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool_result';
  content: string;
  tool_call_id: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  created_at: number;
}

interface ToolCallRow {
  id: string;
  message_id: string;
  conversation_id: string;
  tool_name: string;
  server_name: string;
  arguments: string;
  result: string | null;
  error: string | null;
  status: string;
  permission_rule_id: string | null;
  duration_ms: number | null;
  created_at: number;
  completed_at: number | null;
}

function rowToConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    workspaceId: '',
    title: row.title,
    model: row.model,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToMessage(row: MessageRow): Message {
  let content: string | StructuredContent = row.content;
  try {
    const parsed = JSON.parse(row.content);
    if (parsed && typeof parsed === 'object' && 'type' in parsed && 'data' in parsed) {
      content = parsed as StructuredContent;
    }
  } catch {
    // plain string content
  }

  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content,
    toolCalls: [],
    timestamp: row.created_at,
  };
}

function rowToToolCall(row: ToolCallRow): ToolCall {
  return {
    id: row.id,
    messageId: row.message_id,
    toolName: row.tool_name,
    serverName: row.server_name,
    arguments: JSON.parse(row.arguments) as Record<string, unknown>,
    result: row.result ? (JSON.parse(row.result) as ToolResult) : null,
    permission: 'allow_once',
    status: row.status as ToolCall['status'],
    durationMs: row.duration_ms,
    timestamp: row.created_at,
  };
}

export class ConversationServiceImpl implements IConversationService {
  constructor(private readonly _db: Database.Database) {}

  listConversations(): Conversation[] {
    const rows = this._db
      .prepare('SELECT * FROM conversations WHERE status = ? ORDER BY updated_at DESC')
      .all('active') as ConversationRow[];
    return rows.map(rowToConversation);
  }

  getConversation(id: string): Conversation | undefined {
    const row = this._db
      .prepare('SELECT * FROM conversations WHERE id = ?')
      .get(id) as ConversationRow | undefined;
    return row ? rowToConversation(row) : undefined;
  }

  createConversation(model: string): Conversation {
    const id = generateUUID();
    const now = Date.now();
    this._db
      .prepare(
        'INSERT INTO conversations (id, title, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(id, 'New Conversation', model, 'active', now, now);
    return {
      id,
      workspaceId: '',
      title: 'New Conversation',
      model,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
  }

  createConversationWithId(id: string, model: string): Conversation {
    const now = Date.now();
    this._db
      .prepare(
        'INSERT INTO conversations (id, title, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(id, 'New Conversation', model, 'active', now, now);
    return {
      id,
      workspaceId: '',
      title: 'New Conversation',
      model,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
  }

  renameConversation(id: string, title: string): void {
    this._db
      .prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?')
      .run(title, Date.now(), id);
  }

  deleteConversation(id: string): void {
    this._db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
  }

  archiveConversation(id: string): void {
    this._db
      .prepare('UPDATE conversations SET status = ?, updated_at = ? WHERE id = ?')
      .run('archived', Date.now(), id);
  }

  addMessage(conversationId: string, message: Omit<Message, 'id'>): Message {
    const id = generateUUID();
    const now = Date.now();
    const content =
      typeof message.content === 'string'
        ? message.content
        : JSON.stringify(message.content);

    this._db
      .prepare(
        'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(id, conversationId, message.role, content, now);

    this._db
      .prepare('UPDATE conversations SET updated_at = ? WHERE id = ?')
      .run(now, conversationId);

    return {
      id,
      conversationId,
      role: message.role,
      content: message.content,
      toolCalls: [],
      timestamp: now,
    };
  }

  getMessages(conversationId: string): Message[] {
    const rows = this._db
      .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
      .all(conversationId) as MessageRow[];
    return rows.map(rowToMessage);
  }

  addToolCall(
    messageId: string,
    conversationId: string,
    toolCall: Omit<ToolCall, 'id'>,
  ): ToolCall {
    const id = generateUUID();
    const now = Date.now();
    this._db
      .prepare(
        `INSERT INTO tool_calls (id, message_id, conversation_id, tool_name, server_name, arguments, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        messageId,
        conversationId,
        toolCall.toolName,
        toolCall.serverName,
        JSON.stringify(toolCall.arguments),
        toolCall.status,
        now,
      );
    return {
      id,
      messageId,
      toolName: toolCall.toolName,
      serverName: toolCall.serverName,
      arguments: toolCall.arguments,
      result: null,
      permission: 'allow_once',
      status: toolCall.status,
      durationMs: null,
      timestamp: now,
    };
  }

  updateToolCall(
    id: string,
    update: Partial<Pick<ToolCall, 'result' | 'status' | 'durationMs'>>,
  ): void {
    const setClauses: string[] = [];
    const values: unknown[] = [];

    if (update.status !== undefined) {
      setClauses.push('status = ?');
      values.push(update.status);
    }
    if (update.result !== undefined) {
      setClauses.push('result = ?');
      values.push(JSON.stringify(update.result));
    }
    if (update.durationMs !== undefined) {
      setClauses.push('duration_ms = ?');
      values.push(update.durationMs);
      setClauses.push('completed_at = ?');
      values.push(Date.now());
    }

    if (setClauses.length === 0) {
      return;
    }

    values.push(id);
    this._db
      .prepare(`UPDATE tool_calls SET ${setClauses.join(', ')} WHERE id = ?`)
      .run(...values);
  }

  getToolCalls(conversationId: string): ToolCall[] {
    const rows = this._db
      .prepare('SELECT * FROM tool_calls WHERE conversation_id = ? ORDER BY created_at ASC')
      .all(conversationId) as ToolCallRow[];
    return rows.map(rowToToolCall);
  }
}
