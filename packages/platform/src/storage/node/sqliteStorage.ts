import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { IStorageService } from '../common/storage.js';
import { configurePragmas, migrateDatabase } from './migrations.js';
import { GLOBAL_MIGRATIONS } from './globalSchema.js';
import { WORKSPACE_MIGRATIONS } from './workspaceSchema.js';

// Lazy-load better-sqlite3 to avoid crashing at module load time when the native
// module is compiled for a different Node ABI (e.g., system Node vs Electron).
import type Database from 'better-sqlite3';

type DatabaseConstructor = typeof Database;
type DatabaseInstance = Database.Database;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const loadDatabase = (): DatabaseConstructor => require('better-sqlite3');

export class SqliteStorageService implements IStorageService {
  private readonly _globalDb: DatabaseInstance;
  private readonly _workspaceDbs = new Map<string, DatabaseInstance>();
  private readonly _workspaceDbPath: string;

  constructor(globalDbPath: string, workspaceDbPath: string) {
    this._workspaceDbPath = workspaceDbPath;
    mkdirSync(dirname(globalDbPath), { recursive: true });
    const Database = loadDatabase();
    this._globalDb = new Database(globalDbPath);
    configurePragmas(this._globalDb);
    migrateDatabase(this._globalDb, GLOBAL_MIGRATIONS);
  }

  getSetting(key: string): string | undefined {
    const row = this._globalDb
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(key) as { value: string } | undefined;
    return row?.value;
  }

  setSetting(key: string, value: string): void {
    this._globalDb
      .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
      .run(key, value);
  }

  getGlobalDatabase(): DatabaseInstance {
    return this._globalDb;
  }

  getWorkspaceDatabase(workspaceId: string): DatabaseInstance {
    const existing = this._workspaceDbs.get(workspaceId);
    if (existing) {
      return existing;
    }
    const dbPath = this._workspaceDbPath === ':memory:'
      ? ':memory:'
      : `${this._workspaceDbPath}/${workspaceId}/workspace.db`;
    if (dbPath !== ':memory:') {
      mkdirSync(dirname(dbPath), { recursive: true });
    }
    const Database = loadDatabase();
    const db = new Database(dbPath);
    configurePragmas(db);
    migrateDatabase(db, WORKSPACE_MIGRATIONS);
    this._workspaceDbs.set(workspaceId, db);
    return db;
  }

  close(): void {
    this._globalDb.pragma('optimize');
    this._globalDb.close();
    for (const db of this._workspaceDbs.values()) {
      db.pragma('optimize');
      db.close();
    }
    this._workspaceDbs.clear();
  }
}
