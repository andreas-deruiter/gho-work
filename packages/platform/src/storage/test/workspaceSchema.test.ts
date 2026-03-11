import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { WORKSPACE_MIGRATIONS } from '../node/workspaceSchema.js';
import { migrateDatabase, configurePragmas } from '../node/migrations.js';

describe('Workspace database schema', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    configurePragmas(db);
    migrateDatabase(db, WORKSPACE_MIGRATIONS);
  });

  afterEach(() => { db.close(); });

  it('should CRUD conversations', () => {
    const now = Date.now();
    db.prepare(
      'INSERT INTO conversations (id, title, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('conv-1', 'Test Chat', 'gpt-4o', 'active', now, now);
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get('conv-1') as any;
    expect(conv.title).toBe('Test Chat');
  });

  it('should CRUD messages with FK to conversations', () => {
    const now = Date.now();
    db.prepare(
      'INSERT INTO conversations (id, title, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('conv-1', 'Test', 'gpt-4o', 'active', now, now);
    db.prepare(
      'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run('msg-1', 'conv-1', 'user', 'Hello!', now);
    const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get('msg-1') as any;
    expect(msg.content).toBe('Hello!');
  });

  it('should cascade delete messages when conversation deleted', () => {
    const now = Date.now();
    db.prepare(
      'INSERT INTO conversations (id, title, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('conv-1', 'Test', 'gpt-4o', 'active', now, now);
    db.prepare(
      'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run('msg-1', 'conv-1', 'user', 'Hello!', now);
    db.prepare('DELETE FROM conversations WHERE id = ?').run('conv-1');
    const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get('msg-1');
    expect(msg).toBeUndefined();
  });

  it('should store tool calls', () => {
    const now = Date.now();
    db.prepare(
      'INSERT INTO conversations (id, title, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('conv-1', 'Test', 'gpt-4o', 'active', now, now);
    db.prepare(
      'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run('msg-1', 'conv-1', 'assistant', '', now);
    db.prepare(
      `INSERT INTO tool_calls (id, message_id, conversation_id, tool_name, server_name, arguments, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('tc-1', 'msg-1', 'conv-1', 'read_file', 'builtin', '{"path":"/tmp"}', 'completed', now);
    const tc = db.prepare('SELECT * FROM tool_calls WHERE id = ?').get('tc-1') as any;
    expect(tc.tool_name).toBe('read_file');
  });
});
