import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GLOBAL_MIGRATIONS } from '../node/globalSchema.js';
import { migrateDatabase, configurePragmas } from '../node/migrations.js';

// better-sqlite3 may be compiled for Electron ABI — skip tests gracefully.
// The JS wrapper loads fine; the native .node binary only fails at construction time.
function canLoadSqlite(): boolean {
  try {
    const Db = require('better-sqlite3');
    const test = new Db(':memory:');
    test.close();
    return true;
  } catch {
    return false;
  }
}

const sqliteAvailable = canLoadSqlite();
const describeIfSqlite = sqliteAvailable ? describe : describe.skip;

describeIfSqlite('Global database schema', () => {
  // Lazy-load so the require only executes when the suite actually runs
  const Database = (): any => require('better-sqlite3');
  let db: import('better-sqlite3').Database;

  beforeEach(() => {
    db = new (Database())(':memory:');
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

  it('should CRUD connectors', () => {
    const now = Date.now();
    db.prepare(
      'INSERT INTO connectors (id, type, name, transport, enabled, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run('conn-1', 'local_mcp', 'filesystem', 'stdio', 1, 'disconnected', now, now);
    const row = db.prepare('SELECT * FROM connectors WHERE id = ?').get('conn-1') as any;
    expect(row.name).toBe('filesystem');
  });

  it('should enforce WAL mode on file-based databases', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gho-wal-test-'));
    const fileDb = new (Database())(join(dir, 'test.db'));
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

describeIfSqlite('Migration v1: connectors table', () => {
  const Database = (): any => require('better-sqlite3');
  let db: import('better-sqlite3').Database;

  beforeEach(() => {
    db = new (Database())(':memory:');
    configurePragmas(db);
  });

  afterEach(() => { db.close(); });

  it('creates connectors table with all required columns', () => {
    migrateDatabase(db, GLOBAL_MIGRATIONS);
    const version = db.pragma('user_version', { simple: true });
    expect(version).toBe(2);

    db.prepare(`INSERT INTO connectors (id, type, name, transport, enabled, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'test-1', 'local_mcp', 'Test Server', 'stdio', 1, 'disconnected', Date.now(), Date.now(),
    );

    const row = db.prepare('SELECT * FROM connectors WHERE id = ?').get('test-1') as Record<string, unknown>;
    expect(row.name).toBe('Test Server');
    expect(row.type).toBe('local_mcp');
    expect(row.status).toBe('disconnected');
  });

  it('migrates existing connector_configs data to connectors table', () => {
    migrateDatabase(db, [GLOBAL_MIGRATIONS[0]]);
    expect(db.pragma('user_version', { simple: true })).toBe(1);

    db.prepare(`INSERT INTO connector_configs (id, name, transport, enabled) VALUES (?, ?, ?, ?)`).run(
      'old-1', 'Old Server', 'stdio', 1,
    );

    migrateDatabase(db, GLOBAL_MIGRATIONS);
    expect(db.pragma('user_version', { simple: true })).toBe(2);

    const row = db.prepare('SELECT * FROM connectors WHERE id = ?').get('old-1') as Record<string, unknown>;
    expect(row.name).toBe('Old Server');
    expect(row.type).toBe('local_mcp');
    expect(row.status).toBe('disconnected');
  });
});
