export const WORKSPACE_MIGRATIONS: string[][] = [
  [
    `CREATE TABLE conversations (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, model TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived')),
      metadata TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE messages (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool_result')),
      content TEXT NOT NULL, tool_call_id TEXT, tokens_in INTEGER, tokens_out INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE tool_calls (
      id TEXT PRIMARY KEY, message_id TEXT NOT NULL, conversation_id TEXT NOT NULL,
      tool_name TEXT NOT NULL, server_name TEXT NOT NULL,
      arguments TEXT NOT NULL DEFAULT '{}', result TEXT, error TEXT,
      status TEXT NOT NULL DEFAULT 'pending', permission_rule_id TEXT,
      duration_ms INTEGER, created_at INTEGER NOT NULL, completed_at INTEGER,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC)`,
    `CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at)`,
    `CREATE INDEX idx_tool_calls_conversation ON tool_calls(conversation_id, created_at DESC)`,
    `CREATE INDEX idx_tool_calls_tool_name ON tool_calls(tool_name)`,
  ],
];
