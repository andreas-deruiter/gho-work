export const GLOBAL_MIGRATIONS: string[][] = [
  [
    `CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
    `CREATE TABLE workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_opened INTEGER NOT NULL
    )`,
    `CREATE TABLE permission_rules (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL CHECK(scope IN ('global', 'workspace')),
      workspace_id TEXT,
      resource_pattern TEXT NOT NULL,
      server_name TEXT,
      decision TEXT NOT NULL CHECK(decision IN ('allow', 'deny')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE connector_configs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      transport TEXT NOT NULL CHECK(transport IN ('stdio', 'streamable_http')),
      command TEXT, args TEXT, url TEXT, env TEXT, headers TEXT,
      credential_ref TEXT,
      enabled INTEGER NOT NULL DEFAULT 1
    )`,
    `CREATE INDEX idx_permission_rules_scope ON permission_rules(scope, resource_pattern)`,
    `CREATE INDEX idx_workspaces_last_opened ON workspaces(last_opened DESC)`,
  ],
];
