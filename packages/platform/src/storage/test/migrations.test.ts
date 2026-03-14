import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { migrateDatabase, configurePragmas } from '../node/migrations.js';

// better-sqlite3 may be compiled for Electron ABI — skip tests gracefully.
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

const describeIfSqlite = canLoadSqlite() ? describe : describe.skip;

describeIfSqlite('migrateDatabase', () => {
  const Database = (): any => require('better-sqlite3');
  let db: import('better-sqlite3').Database;

  beforeEach(() => {
    db = new (Database())(':memory:');
    configurePragmas(db);
  });

  afterEach(() => { db.close(); });

  it('should apply migrations from version 0', () => {
    const migrations = [
      ['CREATE TABLE test (id TEXT PRIMARY KEY, value TEXT)'],
      ['ALTER TABLE test ADD COLUMN extra TEXT'],
    ];
    migrateDatabase(db, migrations);
    const version = db.pragma('user_version', { simple: true });
    expect(version).toBe(2);
    const info = db.prepare("PRAGMA table_info('test')").all();
    const columns = info.map((c: any) => c.name);
    expect(columns).toContain('id');
    expect(columns).toContain('value');
    expect(columns).toContain('extra');
  });

  it('should skip already-applied migrations', () => {
    const migrations = [
      ['CREATE TABLE test (id TEXT PRIMARY KEY)'],
      ['ALTER TABLE test ADD COLUMN v2 TEXT'],
    ];
    db.exec('CREATE TABLE test (id TEXT PRIMARY KEY)');
    db.pragma('user_version = 1');
    migrateDatabase(db, migrations);
    const version = db.pragma('user_version', { simple: true });
    expect(version).toBe(2);
  });
});
