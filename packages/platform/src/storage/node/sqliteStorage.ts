import Database from 'better-sqlite3';
import type { IStorageService } from '../common/storage.js';
import { configurePragmas, migrateDatabase } from './migrations.js';
import { GLOBAL_MIGRATIONS } from './globalSchema.js';
import { WORKSPACE_MIGRATIONS } from './workspaceSchema.js';

export class SqliteStorageService implements IStorageService {
  private readonly _globalDb: Database.Database;
  private readonly _workspaceDbs = new Map<string, Database.Database>();
  private readonly _workspaceDbPath: string;

  constructor(globalDbPath: string, workspaceDbPath: string) {
    this._workspaceDbPath = workspaceDbPath;
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

  getGlobalDatabase(): Database.Database {
    return this._globalDb;
  }

  getWorkspaceDatabase(workspaceId: string): Database.Database {
    let db = this._workspaceDbs.get(workspaceId);
    if (!db) {
      const dbPath = this._workspaceDbPath === ':memory:'
        ? ':memory:'
        : `${this._workspaceDbPath}/${workspaceId}/workspace.db`;
      db = new Database(dbPath);
      configurePragmas(db);
      migrateDatabase(db, WORKSPACE_MIGRATIONS);
      this._workspaceDbs.set(workspaceId, db);
    }
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
