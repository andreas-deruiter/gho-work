# Phase 3A: Core MCP + CLI Detection — Design Spec

**Date:** 2026-03-12
**Phase:** 3A (subset of Phase 3: Connectors and Integrations)
**Approach:** C — Independent MCP Client for management, SDK for tool invocation

---

## 1. Scope

Phase 3A delivers the backend plumbing for connectors:

- **MCP Manager** — connect/disconnect MCP servers, discover tools, monitor health
- **Connector Registry** — persist connector configs in SQLite, track status
- **CLI Detection** — detect installed CLIs (gh, mgc, az, gcloud, pandoc, workiq), check versions and auth
- **Tool Bridge** — wire MCP server configs into SDK sessions for tool invocation
- **Tests** — unit, integration, smoke, Playwright E2E

Phase 3B (deferred) covers: MCP Registry integration, Remote MCP + OAuth, Connector Settings UI.

### Superseded Interfaces

Phase 3A replaces the following existing stub interfaces:
- `IMCPClientManager` in `packages/connectors/src/index.ts` (Phase 0 stub with `addServer/removeServer`) → replaced by the new `IMCPClientManager`
- `IMCPManager` in `packages/agent/src/common/types.ts` (includes `callTool()`) → **removed**. Our MCP client never calls tools; the SDK does that natively. The `callTool()` method contradicts the Approach C design.

---

## 2. Architecture

### Process Model

All connector services run in the **main process** (Node.js). The renderer accesses data via IPC.

```
┌─────────────────────────────────────────────────────┐
│  Main Process                                        │
│                                                      │
│  ConnectorRegistry ──── SQLite (global DB)           │
│       │                                              │
│  MCPClientManager ──── @modelcontextprotocol/sdk     │
│       │                  ├─ stdio transport           │
│       │                  └─ streamable HTTP transport │
│       │                                              │
│  CLIDetectionService ── PATH scanning + execFile     │
│       │                                              │
│  AgentServiceImpl ──── ICopilotSDK                   │
│       │                  └─ mcpServers config ←──┐   │
│       │                                          │   │
│  Main Process Wiring ── queries Registry ────────┘   │
│       └──── passes mcpServers to executeTask()       │
│                                                      │
│  IPC Handlers ──── expose to renderer                │
└─────────────────────────────────────────────────────┘
```

### Data Flow

1. User adds a connector config → persisted in `ConnectorRegistry` (SQLite)
2. `MCPClientManager` connects to the server, discovers tools, monitors health
3. When agent executes a task, the **main process wiring layer** (`packages/electron`) queries `ConnectorRegistry` for enabled servers, maps to `mcpServers` config, and passes it to `AgentServiceImpl.executeTask()` as a parameter. This avoids a direct dependency from `packages/agent` → `packages/connectors` (they're peer packages in the import hierarchy)
4. SDK handles actual tool invocation during the session
5. Renderer gets connector status/tool lists via IPC for UI display

### Design Rationale (Approach C)

- **Our MCP client manages** — connect, discover tools, health monitoring, status tracking
- **SDK executes tools** — during agent sessions via native `mcpServers` config
- This avoids dual tool invocation (our client never calls tools, only the SDK does)
- Enables full UI capabilities (tool lists, status, health) without an active agent session

---

## 3. Package Structure

```
packages/connectors/src/
  common/
    connectorRegistry.ts      # IConnectorRegistry interface + service ID
    mcpClientManager.ts        # IMCPClientManager interface + service ID + ToolInfo type
    cliDetection.ts            # ICLIDetectionService interface + service ID + CLIToolStatus type
    types.ts                   # Shared types (extend ConnectorConfig with error field)
  node/
    connectorRegistryImpl.ts   # SQLite-backed implementation
    mcpClientManagerImpl.ts    # @modelcontextprotocol/sdk client management
    mcpConnection.ts           # Single MCP connection wrapper (stdio or HTTP)
    cliDetectionImpl.ts        # PATH scanning, execFile, version parsing
  __tests__/
    connectorRegistry.test.ts
    mcpClientManager.test.ts
    mcpConnection.test.ts
    cliDetection.test.ts
```

---

## 4. Service Interfaces

### 4.1 IConnectorRegistry

Persists connector configs in the global SQLite database. Source of truth for what's configured.

```typescript
import { createServiceIdentifier, IDisposable } from '@gho-work/base';
import { Event } from '@gho-work/base';
import type { ConnectorConfig } from '@gho-work/base';

export interface IConnectorRegistry extends IDisposable {
  // CRUD
  addConnector(config: ConnectorConfig): Promise<void>;
  updateConnector(id: string, updates: Partial<ConnectorConfig>): Promise<void>;
  removeConnector(id: string): Promise<void>;
  getConnector(id: string): Promise<ConnectorConfig | undefined>;
  getConnectors(): Promise<ConnectorConfig[]>;
  getEnabledConnectors(): Promise<ConnectorConfig[]>;

  // Status (updated by MCPClientManager)
  updateStatus(id: string, status: ConnectorConfig['status'], error?: string): Promise<void>;

  // Events
  onDidChangeConnectors: Event<void>;
  onDidChangeStatus: Event<{ id: string; status: ConnectorConfig['status'] }>;
}

export const IConnectorRegistry = createServiceIdentifier<IConnectorRegistry>('IConnectorRegistry');
```

### 4.2 IMCPClientManager

Manages MCP client connections for lifecycle, discovery, and health. Does **not** invoke tools.

```typescript
import { createServiceIdentifier, IDisposable } from '@gho-work/base';
import { Event } from '@gho-work/base';
import type { ConnectorConfig } from '@gho-work/base';

export interface ToolInfo {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  enabled: boolean; // reflects user's toolsConfig preference; disabled tools still returned but marked false
}

export interface IMCPClientManager extends IDisposable {
  // Lifecycle
  connectServer(connectorId: string): Promise<void>;
  disconnectServer(connectorId: string): Promise<void>;
  disconnectAll(): Promise<void>;

  // Discovery
  getTools(connectorId: string): Promise<ToolInfo[]>;
  getAllTools(): Promise<Map<string, ToolInfo[]>>;

  // Health
  testConnection(config: ConnectorConfig): Promise<{ success: boolean; error?: string }>;
  getServerStatus(connectorId: string): ConnectorConfig['status'];

  // Events
  onDidChangeTools: Event<{ connectorId: string; tools: ToolInfo[] }>;
  onDidChangeStatus: Event<{ connectorId: string; status: ConnectorConfig['status'] }>;
}

export const IMCPClientManager = createServiceIdentifier<IMCPClientManager>('IMCPClientManager');
```

### 4.3 ICLIDetectionService

Detects installed CLI tools, checks versions and auth status.

```typescript
import { createServiceIdentifier, IDisposable } from '@gho-work/base';
import { Event } from '@gho-work/base';

export interface CLIToolStatus {
  id: string;               // 'gh', 'mgc', 'az', 'gcloud', 'pandoc', 'workiq'
  name: string;             // 'GitHub CLI'
  installed: boolean;
  version?: string;
  authenticated?: boolean;
  installUrl: string;
  authCommand?: string;     // e.g., 'gh auth login'
}

export interface ICLIDetectionService extends IDisposable {
  detectAll(): Promise<CLIToolStatus[]>;
  detect(toolId: string): Promise<CLIToolStatus | undefined>;
  refresh(): Promise<void>;

  onDidChangeTools: Event<CLIToolStatus[]>;
}

export const ICLIDetectionService = createServiceIdentifier<ICLIDetectionService>('ICLIDetectionService');
```

---

## 5. Implementation Details

### 5.1 ConnectorRegistryImpl (SQLite)

Uses the existing `IStorageService` pattern with the global database.

**Schema:**

```sql
CREATE TABLE IF NOT EXISTS connectors (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  transport TEXT NOT NULL,
  command TEXT,
  args TEXT,          -- JSON array
  env TEXT,           -- JSON object
  url TEXT,
  headers TEXT,       -- JSON object
  enabled INTEGER DEFAULT 1,
  status TEXT DEFAULT 'disconnected',
  error TEXT,
  capabilities TEXT,  -- JSON object
  tools_config TEXT,  -- JSON: per-tool enable/disable overrides { "toolName": false }
  created_at INTEGER,
  updated_at INTEGER
);
```

Stored in the **global** database (not per-workspace), since connectors are system-wide. Workspace overrides (from `Workspace.connectorOverrides`) are applied at read time by merging the override fields onto the base config.

### 5.2 MCPClientManagerImpl

Wraps `@modelcontextprotocol/sdk`'s `Client` class. Maintains one `MCPConnection` per connected server.

**Dependencies:** `@modelcontextprotocol/sdk` (new), `IConnectorRegistry` (for reading configs and updating status).

**Startup:** Reads enabled connectors from registry, connects each. Listens for `onDidChangeConnectors` to handle adds/removes.

### 5.3 MCPConnection (internal class)

Manages a single MCP server connection.

```typescript
class MCPConnection extends Disposable {
  // State
  private _client: Client;
  private _transport: StdioClientTransport | StreamableHTTPClientTransport;
  private _tools: ToolInfo[];
  private _status: ConnectorConfig['status'];
  private _heartbeatInterval: NodeJS.Timeout;

  // Lifecycle
  async connect(): Promise<void>;    // Create transport, client.connect(), listTools()
  async disconnect(): Promise<void>; // client.close(), kill child process for stdio

  // Discovery
  async listTools(): Promise<ToolInfo[]>; // client.listTools(), cache result

  // Health
  async ping(): Promise<boolean>;    // client.ping() with 5s timeout

  // Events
  onDidChangeTools: Event<ToolInfo[]>;
  onDidChangeStatus: Event<ConnectorConfig['status']>;
}
```

**Transport creation:**
- `transport: 'stdio'` → `new StdioClientTransport({ command, args, env, cwd })`
- `transport: 'streamable_http'` → `new StreamableHTTPClientTransport(new URL(url), { headers })`

**Heartbeat:** `setInterval` every 30s calling `ping()`. After 3 consecutive failures, status → `'error'`. On recovery, status → `'connected'`. The interval is registered in the `DisposableStore` via `this._register(toDisposable(() => clearInterval(this._heartbeatInterval)))` to ensure cleanup regardless of disposal path.

**Startup error handling:** If a server fails to connect at startup (binary not found, timeout, etc.), it is marked as `'error'` and skipped. Startup is never blocked by a single failing server.

**Dynamic tool updates:** Listen for `notifications/tools/list_changed` notification → re-call `listTools()` → fire `onDidChangeTools`.

### 5.4 CLIDetectionImpl

Uses `child_process.execFile` with 5-second timeouts. Never uses `exec` (prevents shell injection).

| CLI | Binary | Version Command | Auth Check |
|-----|--------|-----------------|------------|
| GitHub CLI | `gh` | `gh --version` | `gh auth status` (exit 0 = authed) |
| MS Graph CLI | `mgc` | `mgc --version` | `mgc me get` (exit 0 = authed) |
| Azure CLI | `az` | `az --version` | `az account show` (exit 0 = authed) |
| Google Cloud | `gcloud` | `gcloud --version` | `gcloud auth print-access-token` (exit 0 = authed) |
| Pandoc | `pandoc` | `pandoc --version` | N/A (no auth needed) |
| Work IQ | `workiq` | `workiq --version` | `workiq auth status` (exit 0 = authed) |

**Detection flow:**
1. `execFile(binary, ['--version'])` → if succeeds, binary is installed (catches `ENOENT` for missing). No `which` needed — `execFile` with the binary name is cross-platform.
2. Parse version string from stdout
3. If auth check defined: run auth command → check exit code
4. Return `CLIToolStatus`

Results cached. Refresh on explicit `refresh()` call or app restart.

### 5.5 Tool Bridge (Main Process Wiring)

`AgentServiceImpl` does **not** depend on `IConnectorRegistry` (they're peer packages — `packages/agent` and `packages/connectors` are at the same level in the import hierarchy). Instead, the main process wiring layer (`packages/electron`) bridges them.

In `packages/electron/src/main/mainProcess.ts`, the IPC handler for `AGENT_SEND_MESSAGE` queries the registry and passes MCP configs to `executeTask()`:

```typescript
ipcMainAdapter.handle(IPC_CHANNELS.AGENT_SEND_MESSAGE, async (...args) => {
  const request = args[0] as SendMessageRequest;

  // Wiring layer bridges connectors → agent (no direct dependency)
  const connectors = await connectorRegistry.getEnabledConnectors();
  const mcpServers = mapConnectorsToSDKConfig(connectors);

  (async () => {
    for await (const event of agentService.executeTask({
      ...request,
      mcpServers, // Passed as parameter, not injected
    })) {
      ipcMainAdapter.sendToRenderer(IPC_CHANNELS.AGENT_EVENT, event);
    }
  })();
  return { messageId: 'pending' };
});
```

**`mapConnectorsToSDKConfig(connectors: ConnectorConfig[]): Record<string, MCPServerConfig>`**

Converts our `ConnectorConfig[]` to the SDK's expected format:
- Key: connector name (sanitized to be unique)
- Value: `{ type, command, args, env, url, headers, tools }` from config
- `tools`: includes only tool names where `toolsConfig[name] !== false` (all tools enabled by default)

This function lives in `packages/electron/src/main/connectorMapping.ts` (wiring layer, can import both packages).

**AgentServiceImpl change:** `executeTask()` signature gains an optional `mcpServers` parameter (or it's added to the existing task config type). No new constructor dependency.

### 5.6 IPC Channels

New channels added to `IPC_CHANNELS` enum in `packages/platform/src/ipc/common/ipc.ts`:

| Channel | Direction | Request | Response |
|---------|-----------|---------|----------|
| `CONNECTOR_LIST` | invoke | — | `ConnectorConfig[]` |
| `CONNECTOR_ADD` | invoke | `ConnectorConfig` | `void` |
| `CONNECTOR_REMOVE` | invoke | `{ id: string }` | `void` |
| `CONNECTOR_UPDATE` | invoke | `{ id: string; updates: Partial<ConnectorConfig> }` | `void` |
| `CONNECTOR_TEST` | invoke | `ConnectorConfig` | `{ success: boolean; error?: string }` |
| `CONNECTOR_GET_TOOLS` | invoke | `{ id: string }` | `ToolInfo[]` |
| `CONNECTOR_STATUS_CHANGED` | push | — | `{ id: string; status: string; error?: string }` |
| `CONNECTOR_TOOLS_CHANGED` | push | — | `{ connectorId: string; tools: ToolInfo[] }` |
| `CLI_DETECT_ALL` | invoke | — | `CLIToolStatus[]` |
| `CLI_REFRESH` | invoke | — | `CLIToolStatus[]` |

Zod schemas defined for each request/response type, including a `ConnectorConfigSchema` that validates the full `ConnectorConfig` shape (with the new `error` and `toolsConfig` fields). All IPC channel schemas use this as a building block.

### 5.7 Dependencies

**New npm dependency:** `@modelcontextprotocol/sdk` in `packages/connectors/package.json`.

**Externalization:** Add `@modelcontextprotocol/sdk` (and any transitive deps that use dynamic import) to `rollupOptions.external` in `electron.vite.config.ts` per the externalization rule.

**ConnectorConfig extension:** Add `error?: string` and `toolsConfig?: Record<string, boolean>` fields to `ConnectorConfig` in `packages/base/src/common/types.ts`.

### 5.8 Main Process Wiring

In `packages/electron/src/main/mainProcess.ts`:

1. Create `ConnectorRegistryImpl` with global database
2. Create `MCPClientManagerImpl` with registry reference
3. Create `CLIDetectionImpl`
4. Register all three in `ServiceCollection`
5. Wire IPC handlers for all connector channels
6. In `AGENT_SEND_MESSAGE` handler, query registry and pass `mcpServers` to `executeTask()` (bridge pattern — no direct agent→connectors dependency)
7. On app quit: `mcpClientManager.dispose()` (disconnects all servers, clears heartbeats)

---

## 6. Type Changes

### ConnectorConfig (packages/base/src/common/types.ts)

Add fields:

```typescript
export interface ConnectorConfig {
  // ... existing fields ...
  error?: string;                          // Error message when status is 'error'
  toolsConfig?: Record<string, boolean>;   // Per-tool enable/disable: { "toolName": false }
}
```

### MCPServerConfig (packages/agent/src/common/types.ts)

Already defined and sufficient. No changes needed.

---

## 7. Test Plan

### 7.1 Unit Tests

**connectorRegistry.test.ts:**
- CRUD operations (add, get, update, remove)
- `getEnabledConnectors()` filters by `enabled: true`
- `updateStatus()` changes status and fires event
- Duplicate ID rejected
- Concurrent updates don't corrupt

**mcpClientManager.test.ts:**
- Connect/disconnect lifecycle (mock transport)
- `getTools()` returns cached tools
- `testConnection()` returns success/failure
- Status event fires on connect/disconnect/error

**mcpConnection.test.ts:**
- Transport creation for stdio vs HTTP configs
- Tool list caching and refresh on `tools/list_changed`
- Heartbeat marks unhealthy after 3 missed pings
- Heartbeat recovers when ping succeeds again
- Dispose cleans up interval and transport

**cliDetection.test.ts:**
- Detects installed CLI (mock execFile returns version)
- Handles missing CLI (mock execFile throws ENOENT)
- Auth check succeeds/fails based on exit code
- Version parsing for each supported CLI
- Timeout handling (5s exceeded)
- Work IQ detected in both CLI and MCP modes

**connectorMapping.test.ts** (in `packages/electron/src/__tests__/`):
- Maps ConnectorConfig[] to SDK mcpServers format
- Filters disabled tools from tools list (toolsConfig[name] === false → excluded)
- Handles empty connector list
- Handles mixed stdio/HTTP connectors

### 7.2 Integration Tests

**mcp-lifecycle.integration.test.ts:**
- Spawn a minimal test MCP server fixture (stdio, provides 2 dummy tools)
- Connect via MCPClientManager → verify tools discovered
- Kill server → verify status changes to error
- Reconnect → verify recovery
- Disconnect → verify clean shutdown

### 7.3 Playwright E2E Test

**tests/e2e/connectors.spec.ts:**
- Launch app
- Invoke `CONNECTOR_ADD` IPC with a test connector config
- Verify `CONNECTOR_LIST` returns the added connector
- Invoke `CONNECTOR_REMOVE`, verify it's gone
- Verify `CLI_DETECT_ALL` returns results (at least the detection ran without crashing)
- This catches IPC wiring issues that unit tests miss (per "32 passing tests, broken app" lesson)

### 7.4 Smoke Test

**tests/smoke/phase3a.ts:**
- Configure a test MCP server in ConnectorRegistry
- Verify MCPClientManager connects and discovers tools
- Verify AgentServiceImpl session config includes mcpServers
- Verify CLI detection finds at least `gh` (if installed)

---

## 8. Out of Scope (Phase 3B)

- MCP Registry API integration and server browser UI
- Remote MCP servers with OAuth token management
- Connector Settings UI (tabbed panel, detail view)
- Sidebar connector quick-view
- Sampling support (`sampling/complete` routing)
- Elicitation support (`elicitation/request` UI dialogs)
