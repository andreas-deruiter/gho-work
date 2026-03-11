---
name: sqlite-patterns
description: Consult when working with SQLite — better-sqlite3 setup, schema design, migrations, performance, process architecture. Covers Phase 1 storage and Phase 4 data tasks.
---

# SQLite Patterns for GHO Work

## Setup with Electron

1. `npm install better-sqlite3` + `npm install -D @electron/rebuild`
2. Postinstall hook: `"postinstall": "electron-rebuild"`
3. Externalize in electron-vite: `external: ['better-sqlite3']`
4. ASAR unpack: `"asarUnpack": ["**/node_modules/better-sqlite3/**"]`

See `electron-hardening` skill for full native module setup.

## Process Architecture

**Run SQLite in the main process.** This is what VS Code does.

- Main process has full Node.js access — native modules load cleanly
- No IPC overhead for storage operations
- Single writer aligns with SQLite's single-writer constraint
- Expose to renderer via IPC:
  ```typescript
  ipcMain.handle('db:conversations:list', async (_, wsId, limit, offset) =>
    conversationStore.list(wsId, limit, offset)
  );
  ```
- For heavy operations (FTS across all conversations), use `utilityProcess` with a read-only connection

## Database Topology

- **Global database**: `app.getPath('userData')/gho-work.db` — settings, permission rules, connector configs, workspace registry
- **Per-workspace database**: `app.getPath('userData')/workspaces/<id>/workspace.db` — conversations, messages, tool calls

## Essential PRAGMAs (Set on Every Connection)

```typescript
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');           // concurrent reads + writes
db.pragma('synchronous = NORMAL');         // safe in WAL mode
db.pragma('temp_store = MEMORY');          // temp tables in RAM
db.pragma('mmap_size = 268435456');        // 256MB memory-mapped I/O
db.pragma('foreign_keys = ON');            // enforce FK constraints
db.pragma('cache_size = -64000');          // 64MB page cache
```

## Schema Migrations with `PRAGMA user_version`

No migration library needed. Roll your own:

```typescript
function migrateDatabase(db: Database): void {
  const version = db.pragma('user_version', { simple: true }) as number;
  const migrations: string[][] = [
    // v0 -> v1: initial schema
    [`CREATE TABLE conversations (...)`, `CREATE TABLE messages (...)`],
    // v1 -> v2: add FTS
    [`CREATE VIRTUAL TABLE messages_fts USING fts5(...)`],
  ];
  if (version < migrations.length) {
    db.transaction(() => {
      for (let i = version; i < migrations.length; i++) {
        for (const sql of migrations[i]) db.exec(sql);
        db.pragma(`user_version = ${i + 1}`);
      }
    })();
  }
}
```

Run migrations at app startup, before UI is shown. Back up the `.db` file before migrating.

## Prepared Statements

Cache statements for hot paths:
```typescript
class ConversationStore {
  private stmts: { getById: Statement; list: Statement; insert: Statement };
  constructor(private db: Database) {
    this.stmts = {
      getById: db.prepare('SELECT * FROM conversations WHERE id = ?'),
      list: db.prepare('SELECT * FROM conversations WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?'),
      insert: db.prepare('INSERT INTO conversations (id, workspace_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'),
    };
  }
}
```

## Transaction Batching

Wrap bulk operations in transactions — massive performance gain:
```typescript
const insertMessages = db.transaction((msgs: Message[]) => {
  const stmt = db.prepare('INSERT INTO messages (...) VALUES (?, ?, ?, ?, ?)');
  for (const m of msgs) stmt.run(m.id, m.conversationId, m.role, m.content, m.createdAt);
});
insertMessages(batch); // all-or-nothing, single lock acquisition
```

## Key Schema Tables

**Global database:**
- `settings` (key TEXT PK, value TEXT) — JSON-encoded key-value
- `permission_rules` (id, scope, resource_pattern, decision, created_at, updated_at)
- `connector_configs` (id, name, transport, command, args, url, env, credential_ref, enabled)
- `workspaces` (id, name, path, created_at, last_opened)

**Per-workspace database:**
- `conversations` (id, title, model, status, created_at, updated_at, metadata)
- `messages` (id, conversation_id FK, role, content, tool_call_id, tokens_in, tokens_out, created_at)
- `tool_calls` (id, message_id FK, conversation_id FK, tool_name, server_id, server_name, arguments, result, error, status, permission_rule_id, duration_ms, created_at, completed_at)

## Indexes

```sql
CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX idx_tool_calls_conversation ON tool_calls(conversation_id, created_at DESC);
CREATE INDEX idx_tool_calls_tool_name ON tool_calls(tool_name);
CREATE INDEX idx_permission_rules_scope ON permission_rules(scope, resource_pattern);
```

## Full-Text Search

```sql
CREATE VIRTUAL TABLE messages_fts USING fts5(content, content=messages, content_rowid=rowid, tokenize='porter unicode61');
-- Keep in sync with triggers on INSERT/UPDATE/DELETE
```

## Connection Rules

- **Single connection** per database file (no pooling needed for desktop app)
- `better-sqlite3` is synchronous — queries block but return in microseconds
- Call `db.pragma('optimize')` before closing (or periodically)
- For corrupt database: fall back to in-memory database so UI still renders (VS Code pattern)
