import type Database from 'better-sqlite3';

export function migrateDatabase(db: Database.Database, migrations: string[][]): void {
  const currentVersion = db.pragma('user_version', { simple: true }) as number;
  for (let i = currentVersion; i < migrations.length; i++) {
    const migration = migrations[i];
    const applyMigration = db.transaction(() => {
      for (const sql of migration) {
        db.exec(sql);
      }
      db.pragma(`user_version = ${i + 1}`);
    });
    applyMigration();
  }
}

export function configurePragmas(db: Database.Database): void {
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('temp_store = MEMORY');
  db.pragma('mmap_size = 268435456');
  db.pragma('foreign_keys = ON');
  db.pragma('cache_size = -64000');
}
