import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GLOBAL_MIGRATIONS } from '../node/globalSchema.js';
import { migrateDatabase, configurePragmas } from '../node/migrations.js';

describe('Global database schema', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    configurePragmas(db);
    migrateDatabase(db, GLOBAL_MIGRATIONS);
  });

  afterEach(() => { db.close(); });

  it('should CRUD settings', () => {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('theme', '"dark"');
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('theme') as any;
    expect(row.value).toBe('"dark"');
  });

  it('should CRUD workspaces', () => {
    const now = Date.now();
    db.prepare(
      'INSERT INTO workspaces (id, name, path, created_at, last_opened) VALUES (?, ?, ?, ?, ?)',
    ).run('ws-1', 'My Workspace', '/home/user/project', now, now);
    const row = db.prepare('SELECT * FROM workspaces WHERE id = ?').get('ws-1') as any;
    expect(row.name).toBe('My Workspace');
  });

  it('should CRUD permission_rules', () => {
    const now = Date.now();
    db.prepare(
      'INSERT INTO permission_rules (id, scope, resource_pattern, decision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('rule-1', 'global', 'read_file:*', 'allow', now, now);
    const row = db.prepare('SELECT * FROM permission_rules WHERE id = ?').get('rule-1') as any;
    expect(row.decision).toBe('allow');
  });

  it('should CRUD connector_configs', () => {
    db.prepare(
      'INSERT INTO connector_configs (id, name, transport, enabled) VALUES (?, ?, ?, ?)',
    ).run('conn-1', 'filesystem', 'stdio', 1);
    const row = db.prepare('SELECT * FROM connector_configs WHERE id = ?').get('conn-1') as any;
    expect(row.name).toBe('filesystem');
  });

  it('should enforce WAL mode on file-based databases', () => {
    // WAL mode is not supported on :memory: databases — test with a real file
    const dir = mkdtempSync(join(tmpdir(), 'gho-wal-test-'));
    const fileDb = new Database(join(dir, 'test.db'));
    try {
      configurePragmas(fileDb);
      const mode = fileDb.pragma('journal_mode', { simple: true });
      expect(mode).toBe('wal');
    } finally {
      fileDb.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
