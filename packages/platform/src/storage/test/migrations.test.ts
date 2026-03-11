import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { migrateDatabase, configurePragmas } from '../node/migrations.js';

describe('migrateDatabase', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
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
