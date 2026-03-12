# Phase 3A: Core MCP + CLI Detection — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect MCP servers for lifecycle/discovery/health, persist connector configs in SQLite, detect CLI tools, and wire MCP server configs into SDK sessions for tool invocation.

**Architecture:** Independent MCP client (Approach C) manages connections using `@modelcontextprotocol/sdk`. The SDK handles actual tool invocation via its native `mcpServers` session config. The main process wiring layer bridges `packages/connectors` and `packages/agent` without violating the import hierarchy.

**Tech Stack:** `@modelcontextprotocol/sdk`, `better-sqlite3`, `node:child_process` (execFile only), Zod, Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-03-12-phase3a-connectors-core-design.md`

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `packages/connectors/src/common/connectorRegistry.ts` | `IConnectorRegistry` interface + service ID |
| `packages/connectors/src/common/mcpClientManager.ts` | `IMCPClientManager` interface + service ID + `ToolInfo` type |
| `packages/connectors/src/common/cliDetection.ts` | `ICLIDetectionService` interface + service ID + `CLIToolStatus` type |
| `packages/connectors/src/node/connectorRegistryImpl.ts` | SQLite-backed registry implementation |
| `packages/connectors/src/node/mcpClientManagerImpl.ts` | `@modelcontextprotocol/sdk` client management |
| `packages/connectors/src/node/mcpConnection.ts` | Single MCP connection wrapper (stdio or HTTP) |
| `packages/connectors/src/node/cliDetectionImpl.ts` | PATH scanning, version parsing |
| `packages/electron/src/main/connectorMapping.ts` | `mapConnectorsToSDKConfig()` bridge function |
| `packages/connectors/src/__tests__/connectorRegistry.test.ts` | Registry unit tests |
| `packages/connectors/src/__tests__/mcpClientManager.test.ts` | Manager unit tests |
| `packages/connectors/src/__tests__/mcpConnection.test.ts` | Connection unit tests |
| `packages/connectors/src/__tests__/cliDetection.test.ts` | CLI detection unit tests |
| `packages/electron/src/__tests__/connectorMapping.test.ts` | Mapping unit tests |
| `tests/integration/mcp-lifecycle.integration.test.ts` | MCP lifecycle integration test |
| `tests/fixtures/test-mcp-server.ts` | Minimal MCP server fixture for integration tests |
| `tests/e2e/connectors.spec.ts` | Playwright E2E test for connector IPC |

### Modified files

| File | Change |
|------|--------|
| `packages/base/src/common/types.ts` | Add `error?` and `toolsConfig?` to `ConnectorConfig` |
| `packages/connectors/src/index.ts` | Replace stub with new barrel exports |
| `packages/connectors/package.json` | Add `@modelcontextprotocol/sdk` dependency |
| `packages/agent/src/common/types.ts` | Remove `IMCPManager` (superseded) |
| `packages/agent/src/common/agent.ts` | Add `mcpServers?` to `executeTask()` signature |
| `packages/agent/src/node/agentServiceImpl.ts` | Pass `mcpServers` to SDK session |
| `packages/platform/src/ipc/common/ipc.ts` | Add connector + CLI IPC channels + Zod schemas |
| `packages/platform/src/storage/node/globalSchema.ts` | Add migration v1 for connector schema changes |
| `packages/electron/src/main/mainProcess.ts` | Wire connector services + IPC handlers |
| `apps/desktop/electron.vite.config.ts` | Add `@modelcontextprotocol/sdk` to external |
| `packages/connectors/src/__tests__/index.test.ts` | Replace old stub tests |

---

## Chunk 1: Foundation (Types, Interfaces, Schema)

### Task 1: Extend ConnectorConfig type

**Files:**
- Modify: `packages/base/src/common/types.ts:85-98`

- [ ] **Step 1: Write the failing test**

Create `packages/base/src/__tests__/types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { ConnectorConfig } from '../common/types.js';

describe('ConnectorConfig type', () => {
  it('accepts error and toolsConfig fields', () => {
    const config: ConnectorConfig = {
      id: 'test',
      type: 'local_mcp',
      name: 'Test',
      transport: 'stdio',
      command: 'echo',
      enabled: true,
      status: 'disconnected',
      error: 'Connection refused',
      toolsConfig: { 'read-file': true, 'write-file': false },
    };
    expect(config.error).toBe('Connection refused');
    expect(config.toolsConfig?.['write-file']).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/base/src/__tests__/types.test.ts`
Expected: FAIL -- `error` and `toolsConfig` not in the type

- [ ] **Step 3: Add fields to ConnectorConfig**

In `packages/base/src/common/types.ts`, add to `ConnectorConfig`:

```typescript
export interface ConnectorConfig {
  id: string;
  type: 'builtin' | 'local_mcp' | 'remote_mcp' | 'agent_skill';
  name: string;
  transport: 'stdio' | 'streamable_http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  enabled: boolean;
  capabilities?: ServerCapabilities;
  status: 'connected' | 'disconnected' | 'error' | 'initializing';
  error?: string;
  toolsConfig?: Record<string, boolean>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/base/src/__tests__/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/base/src/common/types.ts packages/base/src/__tests__/types.test.ts
git commit -m "feat(base): add error and toolsConfig fields to ConnectorConfig"
```

---

### Task 2: Add global schema migration for connectors table

**Files:**
- Modify: `packages/platform/src/storage/node/globalSchema.ts`
- Test: `packages/platform/src/storage/test/globalSchema.test.ts`

The existing `connector_configs` table (migration v0) lacks: `type`, `status`, `error`, `capabilities`, `tools_config`, `created_at`, `updated_at`. Migration v1 creates a new `connectors` table and migrates data from `connector_configs`.

- [ ] **Step 1: Write the failing test**

Add to `packages/platform/src/storage/test/globalSchema.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { configurePragmas, migrateDatabase } from '../node/migrations.js';
import { GLOBAL_MIGRATIONS } from '../node/globalSchema.js';

describe('global schema migration v1 (connectors)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    configurePragmas(db);
  });

  it('creates connectors table with all required columns', () => {
    migrateDatabase(db, GLOBAL_MIGRATIONS);
    const version = db.pragma('user_version', { simple: true });
    expect(version).toBe(2); // v0 + v1

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
    // Apply only v0
    migrateDatabase(db, [GLOBAL_MIGRATIONS[0]]);
    expect(db.pragma('user_version', { simple: true })).toBe(1);

    // Insert old-format data
    db.prepare(`INSERT INTO connector_configs (id, name, transport, enabled) VALUES (?, ?, ?, ?)`).run(
      'old-1', 'Old Server', 'stdio', 1,
    );

    // Now apply v1
    migrateDatabase(db, GLOBAL_MIGRATIONS);
    expect(db.pragma('user_version', { simple: true })).toBe(2);

    // Old data should be migrated
    const row = db.prepare('SELECT * FROM connectors WHERE id = ?').get('old-1') as Record<string, unknown>;
    expect(row.name).toBe('Old Server');
    expect(row.type).toBe('local_mcp');
    expect(row.status).toBe('disconnected');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/platform/src/storage/test/globalSchema.test.ts`
Expected: FAIL -- no migration v1 exists

- [ ] **Step 3: Add migration v1 to globalSchema.ts**

In `packages/platform/src/storage/node/globalSchema.ts`, add a second migration array:

```typescript
export const GLOBAL_MIGRATIONS: string[][] = [
  [
    // ... existing v0 migrations (unchanged) ...
  ],
  // v1: Phase 3A -- new connectors table with full schema
  [
    `CREATE TABLE connectors (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'local_mcp',
      name TEXT NOT NULL,
      transport TEXT NOT NULL CHECK(transport IN ('stdio', 'streamable_http')),
      command TEXT,
      args TEXT,
      env TEXT,
      url TEXT,
      headers TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'disconnected',
      error TEXT,
      capabilities TEXT,
      tools_config TEXT,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    )`,
    `INSERT OR IGNORE INTO connectors (id, type, name, transport, command, args, url, env, headers, enabled, created_at, updated_at)
      SELECT id, 'local_mcp', name, transport, command, args, url, env, headers, enabled, 0, 0
      FROM connector_configs`,
    `DROP TABLE IF EXISTS connector_configs`,
  ],
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/platform/src/storage/test/globalSchema.test.ts`
Expected: PASS

- [ ] **Step 5: Run full build to verify no regressions**

Run: `npx turbo build`
Expected: All packages build cleanly

- [ ] **Step 6: Commit**

```bash
git add packages/platform/src/storage/node/globalSchema.ts packages/platform/src/storage/test/globalSchema.test.ts
git commit -m "feat(platform): add connectors table migration v1 with data migration from connector_configs"
```

---

### Task 3: Define service interfaces (IConnectorRegistry, IMCPClientManager, ICLIDetectionService)

**Files:**
- Create: `packages/connectors/src/common/connectorRegistry.ts`
- Create: `packages/connectors/src/common/mcpClientManager.ts`
- Create: `packages/connectors/src/common/cliDetection.ts`

- [ ] **Step 1: Create IConnectorRegistry**

Create `packages/connectors/src/common/connectorRegistry.ts`:

```typescript
import { createServiceIdentifier, type IDisposable } from '@gho-work/base';
import type { Event } from '@gho-work/base';
import type { ConnectorConfig } from '@gho-work/base';

export interface IConnectorRegistry extends IDisposable {
  addConnector(config: ConnectorConfig): Promise<void>;
  updateConnector(id: string, updates: Partial<ConnectorConfig>): Promise<void>;
  removeConnector(id: string): Promise<void>;
  getConnector(id: string): Promise<ConnectorConfig | undefined>;
  getConnectors(): Promise<ConnectorConfig[]>;
  getEnabledConnectors(): Promise<ConnectorConfig[]>;
  updateStatus(id: string, status: ConnectorConfig['status'], error?: string): Promise<void>;

  readonly onDidChangeConnectors: Event<void>;
  readonly onDidChangeStatus: Event<{ id: string; status: ConnectorConfig['status'] }>;
}

export const IConnectorRegistry = createServiceIdentifier<IConnectorRegistry>('IConnectorRegistry');
```

- [ ] **Step 2: Create IMCPClientManager**

Create `packages/connectors/src/common/mcpClientManager.ts`:

```typescript
import { createServiceIdentifier, type IDisposable } from '@gho-work/base';
import type { Event } from '@gho-work/base';
import type { ConnectorConfig } from '@gho-work/base';

export interface ToolInfo {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  enabled: boolean;
}

export interface IMCPClientManager extends IDisposable {
  connectServer(connectorId: string): Promise<void>;
  disconnectServer(connectorId: string): Promise<void>;
  disconnectAll(): Promise<void>;
  getTools(connectorId: string): Promise<ToolInfo[]>;
  getAllTools(): Promise<Map<string, ToolInfo[]>>;
  testConnection(config: ConnectorConfig): Promise<{ success: boolean; error?: string }>;
  getServerStatus(connectorId: string): ConnectorConfig['status'];

  readonly onDidChangeTools: Event<{ connectorId: string; tools: ToolInfo[] }>;
  readonly onDidChangeStatus: Event<{ connectorId: string; status: ConnectorConfig['status'] }>;
}

export const IMCPClientManager = createServiceIdentifier<IMCPClientManager>('IMCPClientManager');
```

- [ ] **Step 3: Create ICLIDetectionService**

Create `packages/connectors/src/common/cliDetection.ts`:

```typescript
import { createServiceIdentifier, type IDisposable } from '@gho-work/base';
import type { Event } from '@gho-work/base';

export interface CLIToolStatus {
  id: string;
  name: string;
  installed: boolean;
  version?: string;
  authenticated?: boolean;
  installUrl: string;
  authCommand?: string;
}

export interface ICLIDetectionService extends IDisposable {
  detectAll(): Promise<CLIToolStatus[]>;
  detect(toolId: string): Promise<CLIToolStatus | undefined>;
  refresh(): Promise<void>;

  readonly onDidChangeTools: Event<CLIToolStatus[]>;
}

export const ICLIDetectionService = createServiceIdentifier<ICLIDetectionService>('ICLIDetectionService');
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p packages/connectors/tsconfig.json`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add packages/connectors/src/common/
git commit -m "feat(connectors): define IConnectorRegistry, IMCPClientManager, ICLIDetectionService interfaces"
```

---

### Task 4: Remove superseded interfaces + update barrel export

**Files:**
- Modify: `packages/agent/src/common/types.ts:77-84` (remove `IMCPManager`)
- Modify: `packages/connectors/src/index.ts` (replace stub)
- Modify: `packages/connectors/src/__tests__/index.test.ts` (replace old tests)

- [ ] **Step 1: Remove IMCPManager from agent/common/types.ts**

Remove lines 77-84 (the `IMCPManager` interface, its service identifier, and the `createServiceIdentifier` import if now unused). After removal the file should export: `SessionConfig`, `SystemMessageConfig`, `MessageOptions`, `MCPServerConfig`, `SessionMetadata`, `SessionEvent`, `SDKMessage`, `ModelInfo`, `PingResponse`.

- [ ] **Step 2: Replace connectors barrel export**

Replace `packages/connectors/src/index.ts`:

```typescript
// Service interfaces (common -- environment-agnostic)
export { IConnectorRegistry } from './common/connectorRegistry.js';
export { IMCPClientManager } from './common/mcpClientManager.js';
export type { ToolInfo } from './common/mcpClientManager.js';
export { ICLIDetectionService } from './common/cliDetection.js';
export type { CLIToolStatus } from './common/cliDetection.js';
```

Note: Node implementations will be added to the barrel in a later task once they exist. For now, main process code will import them directly by path.

- [ ] **Step 3: Replace old tests**

Replace `packages/connectors/src/__tests__/index.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { IConnectorRegistry } from '../common/connectorRegistry.js';
import { IMCPClientManager } from '../common/mcpClientManager.js';
import { ICLIDetectionService } from '../common/cliDetection.js';

describe('connectors package interfaces', () => {
  it('IConnectorRegistry service id is defined', () => {
    expect(IConnectorRegistry).toBeDefined();
    expect((IConnectorRegistry as any).id).toBe('IConnectorRegistry');
  });

  it('IMCPClientManager service id is defined', () => {
    expect(IMCPClientManager).toBeDefined();
    expect((IMCPClientManager as any).id).toBe('IMCPClientManager');
  });

  it('ICLIDetectionService service id is defined', () => {
    expect(ICLIDetectionService).toBeDefined();
    expect((ICLIDetectionService as any).id).toBe('ICLIDetectionService');
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/connectors/src/__tests__/index.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Check for IMCPManager regressions**

Run: `npx vitest run`
Expected: PASS. If anything imports `IMCPManager`, fix those references.

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/common/types.ts packages/connectors/src/index.ts packages/connectors/src/__tests__/index.test.ts
git commit -m "refactor: replace stub MCP interfaces with Phase 3A service definitions"
```

---

### Task 5: Add IPC channels and Zod schemas for connectors

**Files:**
- Modify: `packages/platform/src/ipc/common/ipc.ts`

- [ ] **Step 1: Add channels to IPC_CHANNELS**

Add to the `IPC_CHANNELS` object (after the existing `ONBOARDING_` entries):

```typescript
// Connector channels
CONNECTOR_LIST: 'connector:list',
CONNECTOR_ADD: 'connector:add',
CONNECTOR_REMOVE: 'connector:remove',
CONNECTOR_UPDATE: 'connector:update',
CONNECTOR_TEST: 'connector:test',
CONNECTOR_GET_TOOLS: 'connector:get-tools',
CONNECTOR_STATUS_CHANGED: 'connector:status-changed',
CONNECTOR_TOOLS_CHANGED: 'connector:tools-changed',
CLI_DETECT_ALL: 'cli:detect-all',
CLI_REFRESH: 'cli:refresh',
```

- [ ] **Step 2: Add Zod schemas**

Add after the existing schemas at the bottom of the file:

```typescript
// --- Connector schemas ---
export const ConnectorConfigSchema = z.object({
  id: z.string(),
  type: z.enum(['builtin', 'local_mcp', 'remote_mcp', 'agent_skill']),
  name: z.string(),
  transport: z.enum(['stdio', 'streamable_http']),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  url: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean(),
  capabilities: z.object({
    tools: z.boolean().optional(),
    resources: z.boolean().optional(),
    prompts: z.boolean().optional(),
  }).optional(),
  status: z.enum(['connected', 'disconnected', 'error', 'initializing']),
  error: z.string().optional(),
  toolsConfig: z.record(z.string(), z.boolean()).optional(),
});
export type ConnectorConfigIPC = z.infer<typeof ConnectorConfigSchema>;

export const ConnectorListResponseSchema = z.object({
  connectors: z.array(ConnectorConfigSchema),
});
export type ConnectorListResponse = z.infer<typeof ConnectorListResponseSchema>;

export const ConnectorRemoveRequestSchema = z.object({ id: z.string() });
export type ConnectorRemoveRequest = z.infer<typeof ConnectorRemoveRequestSchema>;

export const ConnectorUpdateRequestSchema = z.object({
  id: z.string(),
  updates: ConnectorConfigSchema.partial(),
});
export type ConnectorUpdateRequest = z.infer<typeof ConnectorUpdateRequestSchema>;

export const ConnectorTestResponseSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});
export type ConnectorTestResponse = z.infer<typeof ConnectorTestResponseSchema>;

export const ConnectorGetToolsRequestSchema = z.object({ id: z.string() });
export type ConnectorGetToolsRequest = z.infer<typeof ConnectorGetToolsRequestSchema>;

export const ToolInfoSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean(),
});

export const ConnectorGetToolsResponseSchema = z.object({
  tools: z.array(ToolInfoSchema),
});
export type ConnectorGetToolsResponse = z.infer<typeof ConnectorGetToolsResponseSchema>;

export const ConnectorStatusChangedSchema = z.object({
  id: z.string(),
  status: z.enum(['connected', 'disconnected', 'error', 'initializing']),
  error: z.string().optional(),
});
export type ConnectorStatusChanged = z.infer<typeof ConnectorStatusChangedSchema>;

export const ConnectorToolsChangedSchema = z.object({
  connectorId: z.string(),
  tools: z.array(ToolInfoSchema),
});
export type ConnectorToolsChanged = z.infer<typeof ConnectorToolsChangedSchema>;

export const CLIToolStatusSchema = z.object({
  id: z.string(),
  name: z.string(),
  installed: z.boolean(),
  version: z.string().optional(),
  authenticated: z.boolean().optional(),
  installUrl: z.string(),
  authCommand: z.string().optional(),
});

export const CLIDetectResponseSchema = z.object({
  tools: z.array(CLIToolStatusSchema),
});
export type CLIDetectResponse = z.infer<typeof CLIDetectResponseSchema>;
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p packages/platform/tsconfig.json`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/platform/src/ipc/common/ipc.ts
git commit -m "feat(platform): add connector and CLI IPC channels with Zod schemas"
```

---

## Chunk 2: Implementations

### Task 6: Implement ConnectorRegistryImpl

**Files:**
- Create: `packages/connectors/src/node/connectorRegistryImpl.ts`
- Create: `packages/connectors/src/__tests__/connectorRegistry.test.ts`

See spec section 5.1 for the full SQL schema and behavior. The implementation uses `better-sqlite3` directly (same as `ConversationServiceImpl` pattern).

- [ ] **Step 1: Write the failing tests**

Create `packages/connectors/src/__tests__/connectorRegistry.test.ts` with tests for: CRUD, getEnabledConnectors filter, updateStatus + event, duplicate ID rejection, onDidChangeConnectors fires on add/remove, toolsConfig storage. See the spec section 7.1 for the full test list.

Key test assertions: `addConnector` -> `getConnector` round-trip, `getEnabledConnectors` filters `enabled: false`, `updateStatus` changes status + fires `onDidChangeStatus`, `removeConnector` deletes, duplicate `id` throws.

The test needs an in-memory SQLite database with migrations applied. Pattern from existing tests:
```typescript
import Database from 'better-sqlite3';
// Import configurePragmas, migrateDatabase, GLOBAL_MIGRATIONS
// from platform package (check barrel exports or use direct paths)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/connectors/src/__tests__/connectorRegistry.test.ts`

- [ ] **Step 3: Implement ConnectorRegistryImpl**

Create `packages/connectors/src/node/connectorRegistryImpl.ts`. The class:
- Extends `Disposable`
- Takes a `Database.Database` in the constructor
- Uses `Emitter<void>` for `onDidChangeConnectors` and `Emitter<{id, status}>` for `onDidChangeStatus`
- All methods use `this._db.prepare(SQL).run/get/all(...)` pattern
- JSON fields (`args`, `env`, `headers`, `capabilities`, `toolsConfig`) are serialized with `JSON.stringify` on write, `JSON.parse` on read
- `enabled` is stored as `INTEGER` (0/1), converted to boolean on read
- `_rowToConfig()` private method handles the deserialization

See the spec section 5.1 for the full SQL schema.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/connectors/src/__tests__/connectorRegistry.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/connectors/src/node/connectorRegistryImpl.ts packages/connectors/src/__tests__/connectorRegistry.test.ts
git commit -m "feat(connectors): implement ConnectorRegistryImpl with SQLite persistence"
```

---

### Task 7: Implement CLIDetectionServiceImpl

**Files:**
- Create: `packages/connectors/src/node/cliDetectionImpl.ts`
- Create: `packages/connectors/src/__tests__/cliDetection.test.ts`

- [ ] **Step 1: Write the failing tests**

Tests use a mock `execFile` function injected via constructor. Test: detect installed CLI with version, handle missing CLI (ENOENT), auth check success/failure, pandoc without auth, detectAll returns 6 tools, workiq detection, refresh fires event.

Export the `ExecFileFunction` type from the implementation so tests can import it.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement CLIDetectionServiceImpl**

The class:
- Extends `Disposable`
- Constructor accepts optional `ExecFileFunction` (defaults to `promisify(nodeExecFile)`)
- Defines `CLI_TOOLS` array with 6 entries (gh, mgc, az, gcloud, pandoc, workiq), each with: id, name, versionArgs, versionPattern, authArgs?, installUrl, authCommand?
- `_detectOne(def)`: runs `execFile(def.id, def.versionArgs)`, catches ENOENT for missing, parses version with regex, runs auth check if `authArgs` defined
- Caches results. `refresh()` clears cache and fires `onDidChangeTools`.

See spec section 5.4 for the CLI table.

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/connectors/src/__tests__/cliDetection.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/connectors/src/node/cliDetectionImpl.ts packages/connectors/src/__tests__/cliDetection.test.ts
git commit -m "feat(connectors): implement CLIDetectionServiceImpl with version and auth checks"
```

---

### Task 8: Install @modelcontextprotocol/sdk + externalize

**Files:**
- Modify: `packages/connectors/package.json`
- Modify: `apps/desktop/electron.vite.config.ts`

- [ ] **Step 1: Install the dependency**

Run: `cd packages/connectors && npm install @modelcontextprotocol/sdk`

- [ ] **Step 2: Add to rollupOptions.external in electron.vite.config.ts**

In `apps/desktop/electron.vite.config.ts`, update the `external` array:

```typescript
external: ['better-sqlite3', '@github/copilot-sdk', '@modelcontextprotocol/sdk'],
```

- [ ] **Step 3: Verify build**

Run: `npx turbo build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/connectors/package.json package-lock.json apps/desktop/electron.vite.config.ts
git commit -m "chore(connectors): add @modelcontextprotocol/sdk dependency and externalize"
```

---

### Task 9: Implement MCPConnection

**Files:**
- Create: `packages/connectors/src/node/mcpConnection.ts`
- Create: `packages/connectors/src/__tests__/mcpConnection.test.ts`

- [ ] **Step 1: Write the failing tests**

Tests mock `@modelcontextprotocol/sdk` modules using `vi.mock`. Test: connect with stdio, connect with HTTP, disconnect, toolsConfig filtering, ping, status events, dispose cleanup.

Important: Check the actual export paths of `@modelcontextprotocol/sdk` before writing mock paths. Common paths: `@modelcontextprotocol/sdk/client/index.js`, `@modelcontextprotocol/sdk/client/stdio.js`, `@modelcontextprotocol/sdk/client/streamableHttp.js`. If the SDK uses different paths, adjust.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement MCPConnection**

The class:
- Extends `Disposable`
- Creates `StdioClientTransport` or `StreamableHTTPClientTransport` based on config
- `connect()`: creates transport, creates `Client`, calls `client.connect()`, refreshes tools, sets status to `connected`, starts heartbeat
- `disconnect()`: stops heartbeat, calls `client.close()`, sets status to `disconnected`
- `listTools()`: returns cached `_tools` array
- `_refreshTools()`: calls `client.listTools()`, applies `toolsConfig` enable/disable, fires `onDidChangeTools`
- Heartbeat: `setInterval` 30s, pings, marks error after 3 misses, recovers when ping succeeds
- Heartbeat interval registered in DisposableStore via `this._register(toDisposable(...))`
- `setNotificationHandler` for `notifications/tools/list_changed` -> `_refreshTools()`

See spec section 5.3.

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/connectors/src/__tests__/mcpConnection.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/connectors/src/node/mcpConnection.ts packages/connectors/src/__tests__/mcpConnection.test.ts
git commit -m "feat(connectors): implement MCPConnection with heartbeat and tool discovery"
```

---

### Task 10: Implement MCPClientManagerImpl

**Files:**
- Create: `packages/connectors/src/node/mcpClientManagerImpl.ts`
- Create: `packages/connectors/src/__tests__/mcpClientManager.test.ts`

- [ ] **Step 1: Write the failing tests**

Tests mock `MCPConnection` via `vi.mock`. Test: connectServer creates connection + updates registry status, disconnectServer closes + updates status, getTools returns from connection, disconnectAll, onDidChangeStatus fires, getServerStatus returns `disconnected` for unknown.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement MCPClientManagerImpl**

The class:
- Extends `Disposable`
- Takes `IConnectorRegistry` in constructor
- Maintains `Map<string, MCPConnection>`
- `connectServer(id)`: gets config from registry, creates MCPConnection, forwards events, connects, catches errors (marks as `error`, doesn't throw)
- `disconnectServer(id)`: disconnects, disposes, removes from map
- `disconnectAll()`: disconnects all
- `testConnection(config)`: creates temp MCPConnection, connects, pings, disconnects, returns success/failure
- `getServerStatus(id)`: returns connection status or `disconnected`
- `dispose()`: disconnects all, clears map

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/connectors/src/__tests__/mcpClientManager.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/connectors/src/node/mcpClientManagerImpl.ts packages/connectors/src/__tests__/mcpClientManager.test.ts
git commit -m "feat(connectors): implement MCPClientManagerImpl with connection lifecycle"
```

---

## Chunk 3: Tool Bridge + Wiring

### Task 11: Implement connectorMapping bridge function

**Files:**
- Create: `packages/electron/src/main/connectorMapping.ts`
- Create: `packages/electron/src/__tests__/connectorMapping.test.ts`

- [ ] **Step 1: Write the failing tests**

Test: maps stdio connector, maps HTTP connector, filters disabled tools, handles empty list, handles mixed, deduplicates names.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement mapConnectorsToSDKConfig**

The function:
- Takes `ConnectorConfig[]`, returns `Record<string, MCPServerConfig>`
- Key: connector name (deduplicated by appending `(id)` if collision)
- For stdio: `{ type: 'stdio', command, args, env, tools }`
- For HTTP: `{ type: 'http', url, headers, tools }`
- `tools`: from `toolsConfig`, include names where value !== false

- [ ] **Step 4: Run tests**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/electron/src/main/connectorMapping.ts packages/electron/src/__tests__/connectorMapping.test.ts
git commit -m "feat(electron): implement connectorMapping bridge function"
```

---

### Task 12: Update AgentServiceImpl to accept mcpServers parameter

**Files:**
- Modify: `packages/agent/src/common/agent.ts`
- Modify: `packages/agent/src/node/agentServiceImpl.ts`

- [ ] **Step 1: Add mcpServers to IAgentService.executeTask signature**

```typescript
executeTask(prompt: string, context: AgentContext, mcpServers?: Record<string, MCPServerConfig>): AsyncIterable<AgentEvent>;
```

Add `import type { MCPServerConfig } from './types.js';` to the imports.

- [ ] **Step 2: Update AgentServiceImpl.executeTask to pass mcpServers to session**

Add `mcpServers` to the `createSession` call:

```typescript
const session = await this._sdk.createSession({
  model: context.model ?? 'gpt-4o',
  sessionId: context.conversationId,
  systemMessage: systemContent ? { mode: 'append', content: systemContent } : undefined,
  streaming: true,
  mcpServers,
});
```

- [ ] **Step 3: Verify existing tests still pass**

Run: `npx vitest run packages/agent`
Expected: PASS (mcpServers is optional, existing callers unaffected)

- [ ] **Step 4: Commit**

```bash
git add packages/agent/src/common/agent.ts packages/agent/src/node/agentServiceImpl.ts
git commit -m "feat(agent): accept mcpServers parameter in executeTask"
```

---

### Task 13: Wire connector services in main process

**Files:**
- Modify: `packages/electron/src/main/mainProcess.ts`

This is the largest single task. It adds: imports, service creation, startup connection, IPC handlers for all 10 connector channels, and updates the AGENT_SEND_MESSAGE handler to bridge MCP configs.

- [ ] **Step 1: Add imports**

Add imports for connector services, connector mapping, and IPC types at the top of `mainProcess.ts`.

- [ ] **Step 2: Create connector services after existing service setup**

After `services.set(IAgentService, agentService);`, create `ConnectorRegistryImpl`, `MCPClientManagerImpl`, `CLIDetectionServiceImpl`. Guard with `if (globalDb)` (needs `storageService?.getGlobalDatabase()`). Start enabled servers in a non-blocking async IIFE. Forward status/tool events to renderer.

- [ ] **Step 3: Wire 10 connector IPC handlers**

Add handlers for: CONNECTOR_LIST, CONNECTOR_ADD, CONNECTOR_REMOVE, CONNECTOR_UPDATE, CONNECTOR_TEST, CONNECTOR_GET_TOOLS, CLI_DETECT_ALL, CLI_REFRESH. Each handler delegates to the appropriate service, guarded with null checks.

- [ ] **Step 4: Update AGENT_SEND_MESSAGE handler**

Before calling `agentService.executeTask()`, query `connectorRegistry.getEnabledConnectors()` and pass `mapConnectorsToSDKConfig(connectors)` as the third argument.

- [ ] **Step 5: Verify build**

Run: `npx turbo build`
Expected: PASS

- [ ] **Step 6: Run existing tests**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/electron/src/main/mainProcess.ts
git commit -m "feat(electron): wire connector services and IPC handlers in main process"
```

---

## Chunk 4: Integration, E2E, Final Verification

### Task 14: Create test MCP server fixture

**Files:**
- Create: `tests/fixtures/test-mcp-server.ts`

- [ ] **Step 1: Create the fixture**

A minimal MCP server using `@modelcontextprotocol/sdk/server` with stdio transport. Provides two tools: `echo` (returns input) and `add` (sums two numbers). Uses `StdioServerTransport`.

- [ ] **Step 2: Verify it runs**

Run: `echo '{}' | npx tsx tests/fixtures/test-mcp-server.ts`
Expected: Process starts (will hang waiting for MCP protocol -- Ctrl+C to exit)

- [ ] **Step 3: Commit**

```bash
git add tests/fixtures/test-mcp-server.ts
git commit -m "test: add minimal MCP server fixture for integration tests"
```

---

### Task 15: Write MCP lifecycle integration test

**Files:**
- Create: `tests/integration/mcp-lifecycle.integration.test.ts`

- [ ] **Step 1: Write the integration test**

Uses real in-memory SQLite + real `ConnectorRegistryImpl` + real `MCPClientManagerImpl` + real test server fixture (spawned via `npx tsx`). Tests: connect -> list tools -> verify 2 tools found -> disconnect -> verify status. 30s timeout.

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/integration/mcp-lifecycle.integration.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/integration/mcp-lifecycle.integration.test.ts
git commit -m "test: add MCP lifecycle integration test with real stdio server"
```

---

### Task 16: Write Playwright E2E test

**Files:**
- Create: `tests/e2e/connectors.spec.ts`

- [ ] **Step 1: Write the E2E test**

Launches the built Electron app (with `--mock` flag for SDK). Verifies: app launches without connector-related crashes, workbench renders, activity bar visible. This is a regression test ensuring the new connector services don't break the app.

- [ ] **Step 2: Build the app**

Run: `npm run desktop:build` (or equivalent)

- [ ] **Step 3: Run E2E**

Run: `npx playwright test tests/e2e/connectors.spec.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/connectors.spec.ts
git commit -m "test(e2e): add Playwright test verifying connector service wiring"
```

---

### Task 17: Update barrel export + final build

**Files:**
- Modify: `packages/connectors/src/index.ts`

- [ ] **Step 1: Add node implementation exports to barrel**

Add exports for `ConnectorRegistryImpl`, `MCPClientManagerImpl`, `CLIDetectionServiceImpl`. If this causes environment boundary issues (browser consumers pulling in Node deps), split into separate entry points per CLAUDE.md's barrel export rule.

- [ ] **Step 2: Full build**

Run: `npx turbo build`
Expected: PASS

- [ ] **Step 3: Full lint**

Run: `npx turbo lint`
Expected: 0 errors

- [ ] **Step 4: Full test suite**

Run: `npx vitest run`
Expected: All pass

- [ ] **Step 5: Playwright E2E**

Run: `npx playwright test`
Expected: All pass

- [ ] **Step 6: Commit if changes**

```bash
git add packages/connectors/src/index.ts
git commit -m "fix(connectors): update barrel exports with node implementations"
```

---

### Task 18: App launch verification (HARD GATE)

- [ ] **Step 1: Launch the app**

Run: `npm run desktop:dev`

- [ ] **Step 2: Verify**

Check:
1. App launches without errors in the console
2. Console shows `[main] Connected 0 MCP server(s)` (no servers configured yet)
3. Workbench renders normally (activity bar, sidebar, main panel)
4. Chat still works (send message, get response)
5. No `CONNECTOR` or `MCP` errors in the console

- [ ] **Step 3: Screenshot verification**

Write a temp Playwright script that launches the built app, takes a screenshot, and reads it to verify the workbench renders correctly. Clean up after.

- [ ] **Step 4: Document results**

Record what was observed. If issues found, fix and re-verify before committing.
