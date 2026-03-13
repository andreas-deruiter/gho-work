# Connector Simplification Design

## Goal

Simplify connector management by removing CLI tool detection, replacing SQLite connector storage with a VS Code-compatible JSON config file, and adding Copilot SDK agent tools for MCP server configuration.

## Motivation

The current connector subsystem has accumulated complexity that is hard to test and maintain:

- **CLI detection** — a hardcoded catalog of 7 tools with version parsing, auth detection, install flows, device code auth, and background process management. Numerous edge cases with spawn vs execFile, ABI mismatches, and timing-sensitive auth flows. The agent has bash access and install/auth skills — it can guide users without platform-level detection.
- **SQLite connector storage** — the `connectors` table in `global.db` requires `better-sqlite3`, which has a recurring Electron/Node ABI mismatch problem. Connector config is a handful of entries, not a use case that benefits from a relational database. Every other tool in the ecosystem (VS Code, Claude Code, Cursor) uses a JSON file.
- **Connector drawer** — a complex UI with config form, tool list, tool toggles, and status banner. Most of this is unnecessary if configuration happens through the agent conversationally and the panel just shows status.

## Scope

### In scope

1. Remove CLI detection entirely (service, UI, IPC, onboarding step, tests)
2. Replace SQLite `connectors` table with `{userData}/mcp.json`
3. Add agent tools for MCP server management
4. Simplify Connectors panel to server list with status and basic controls
5. Add `CONNECTOR_CONNECT` / `CONNECTOR_DISCONNECT` IPC channels

### Out of scope (future)

- Workspace/folder selection
- Reading `.vscode/mcp.json` from workspace (requires folder selection)
- `inputs` array for prompted secrets / variable substitution
- Removing SQLite entirely (still used for conversations, settings, workspaces, permissions)

## Architecture

### Type split

The current `ConnectorConfig` mixes persistence and runtime state. Split into two types:

```typescript
// packages/base/src/common/types.ts

/** Persisted in mcp.json — one entry per server */
interface MCPServerConfig {
  type: 'stdio' | 'http';
  command?: string;                    // stdio
  args?: string[];                     // stdio
  env?: Record<string, string>;        // stdio
  cwd?: string;                        // stdio
  url?: string;                        // http
  headers?: Record<string, string>;    // http
}

/** Runtime state — held in memory only */
interface MCPServerState {
  name: string;
  config: MCPServerConfig;
  status: 'connected' | 'disconnected' | 'error' | 'initializing';
  error?: string;
}
```

The server name is the key in the JSON object, not a field in the config. `MCPServerConfig` is VS Code-compatible — a user can copy entries between GHO Work's `mcp.json` and VS Code's `.vscode/mcp.json`.

### JSON config store

**New service**: `ConnectorConfigStore` in `packages/connectors/src/node/`

**File**: `{userData}/mcp.json`

**Format**:
```json
{
  "servers": {
    "google-drive": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@mcp/google-drive"],
      "env": { "GOOGLE_API_KEY": "..." }
    },
    "slack": {
      "type": "http",
      "url": "https://mcp.slack.com/sse",
      "headers": { "Authorization": "Bearer ..." }
    }
  }
}
```

**Behavior**:

- **Read**: parse JSON, cache in memory. On first launch, if file doesn't exist, create with `{"servers": {}}`.
- **Write**: atomic operation — write to `mcp.json.tmp`, then `fs.rename` to `mcp.json`. Updates in-memory cache immediately.
- **File watcher**: watch the *parent directory* (not the file itself) filtered to `mcp.json` changes. Watching the file directly breaks on atomic rename because the inode changes. When a change is detected from an external source, re-read the file and fire `onDidChangeServers`.
- **Corruption handling**: if `JSON.parse` fails on read, log a warning, keep last-known-good config in memory, do not overwrite the broken file. The user can fix their JSON and the watcher will pick up the correction.
- **Race condition**: programmatic writes (via agent tools) temporarily suppress the file watcher callback to avoid double-processing. A short debounce (100ms) on the watcher handles rapid external edits.
- **Event**: `onDidChangeServers` fires with the new server map whenever config changes, from any source.

**Interface**:
```typescript
interface IConnectorConfigStore extends IDisposable {
  readonly onDidChangeServers: Event<Map<string, MCPServerConfig>>;
  getServers(): Map<string, MCPServerConfig>;
  getServer(name: string): MCPServerConfig | undefined;
  addServer(name: string, config: MCPServerConfig): Promise<void>;
  updateServer(name: string, config: MCPServerConfig): Promise<void>;
  removeServer(name: string): Promise<void>;
  getFilePath(): string;
}
```

### Server reconciliation

When `onDidChangeServers` fires (from file watcher or programmatic write), `MCPClientManagerImpl` must reconcile:

1. **Added servers** (in new config, not in current connections) → connect automatically
2. **Removed servers** (in current connections, not in new config) → disconnect and clean up
3. **Changed servers** (config differs) → disconnect old, connect with new config
4. **Unchanged servers** → no action

This replaces the current model where connect/disconnect is always explicitly triggered. The reconciliation logic lives in a new method `MCPClientManagerImpl.reconcile(servers: Map<string, MCPServerConfig>)`.

The `MCPClientManagerImpl` constructor takes the config store as a dependency (replacing `IConnectorRegistry`). On construction, it subscribes to `onDidChangeServers`.

### Agent tools

Three tools registered with the Copilot SDK session:

| Tool | Parameters | Behavior |
|------|-----------|----------|
| `add_mcp_server` | `name`, `type`, transport-specific fields | Validates, writes to `mcp.json` via config store. Reconciliation auto-connects. Returns success or error message. |
| `remove_mcp_server` | `name` | Removes from `mcp.json`. Reconciliation auto-disconnects. Returns confirmation. |
| `list_mcp_servers` | (none) | Returns server names, types, and current status from `MCPClientManagerImpl`. |

**Layer**: tool handler functions are defined in `packages/connectors/src/node/agentTools.ts` as pure functions that take `IConnectorConfigStore` and `IMCPClientManager` as parameters. This keeps them unit-testable without Electron. They are registered with the SDK session in `packages/electron/src/main/mainProcess.ts` (the wiring layer).

**Setup skill update**: `skills/connectors/setup.md` is updated to instruct the agent to use `add_mcp_server` instead of describing IPC flows. The agent guides the user conversationally, collects the necessary config, and calls the tool.

### Simplified Connectors panel

**Sidebar** (`ConnectorSidebarWidget`):
- Header: "Connectors"
- List of configured MCP servers, each showing:
  - Server name
  - Transport type indicator (stdio/http)
  - Status dot (green = connected, grey = disconnected, red = error)
- Click server → inline action buttons: Connect, Disconnect, Remove
- "Add Connector" button → opens setup conversation (unchanged)

**Removed from sidebar**:
- CLI Tools section entirely
- All `CLIToolListItemWidget` instances

**Kept but refactored**:
- `ConnectorListItemWidget` — updated to use `MCPServerState` instead of `ConnectorConfig`, adds transport badge

**Removed from UI entirely**:
- `ConnectorDrawerWidget` (config form, tool list, tool toggles, status banner)
- `ConnectorConfigFormWidget`
- `ToolListSectionWidget`
- `StatusBannerWidget`

### IPC channels

**Keep** (updated):
- `CONNECTOR_LIST` → returns `MCPServerState[]` (merged from config store + client manager)
- `CONNECTOR_REMOVE` → removes from JSON, reconciliation disconnects
- `CONNECTOR_STATUS_CHANGED` → push event for status dot updates
- `CONNECTOR_LIST_CHANGED` → push event when config changes (from any source including file watcher)
- `CONNECTOR_SETUP_CONVERSATION` → opens setup chat

**Add**:
- `CONNECTOR_CONNECT` → explicitly connect a server by name
- `CONNECTOR_DISCONNECT` → explicitly disconnect a server by name

**Remove**:
- `CONNECTOR_ADD` → agent uses tool instead
- `CONNECTOR_UPDATE` → no config editing through UI
- `CONNECTOR_TEST` → no test connection button
- `CONNECTOR_GET_TOOLS` → no tool list in drawer
- `CONNECTOR_TOOLS_CHANGED` → no tool list to update
- `CLI_DETECT_ALL` → CLI detection removed
- `CLI_REFRESH` → CLI detection removed
- `CLI_INSTALL` → CLI detection removed
- `CLI_AUTHENTICATE` → CLI detection removed
- `CLI_CREATE_AUTH_CONVERSATION` → CLI detection removed
- `CLI_GET_PLATFORM_CONTEXT` → CLI detection removed
- `CLI_TOOLS_CHANGED` → CLI detection removed
- `ONBOARDING_DETECT_TOOLS` → CLI detection removed from onboarding

**Preload whitelist**: updated to match — remove all deleted channels, add `CONNECTOR_CONNECT` and `CONNECTOR_DISCONNECT`.

### Transport type mapping

VS Code uses `type: 'http'` which auto-negotiates between Streamable HTTP and SSE. Our existing `MCPConnection` uses `transport: 'streamable_http'`. The new `MCPServerConfig.type` field uses `'http'` (VS Code-compatible). `MCPConnection` is updated to accept `MCPServerConfig` directly and map `'http'` → Streamable HTTP transport internally.

### Startup behavior

On app startup, `MCPClientManagerImpl` reads the initial server list from `ConnectorConfigStore.getServers()` and calls `reconcile()` to auto-connect all configured servers. This is the same code path as file-watcher-driven changes — no special startup logic needed.

### Error recovery

When reconciliation auto-connects a server and it fails (status = `'error'`), there is no automatic retry. The user can manually click "Connect" in the panel to retry. Future: file watcher will detect if the user fixes a config issue and re-reconciles.

## What gets removed

### Files to delete

**CLI detection core**:
- `packages/connectors/src/common/cliDetection.ts`
- `packages/connectors/src/node/cliDetectionImpl.ts`
- `packages/connectors/src/node/mockCLIDetection.ts`
- `packages/connectors/src/common/platformDetection.ts`
- `packages/connectors/src/node/platformDetectionImpl.ts`
- `packages/base/src/common/platformContext.ts`

**CLI UI**:
- `packages/ui/src/browser/connectors/cliToolListItem.ts`
- `packages/ui/src/browser/onboarding/cliDetectionStep.ts`

**Connector drawer**:
- `packages/ui/src/browser/connectors/connectorDrawer.ts`
- `packages/ui/src/browser/connectors/connectorConfigForm.ts`
- `packages/ui/src/browser/connectors/toolListSection.ts`
- `packages/ui/src/browser/connectors/connectorStatusBanner.ts`

**SQLite connector registry**:
- `packages/connectors/src/node/connectorRegistryImpl.ts`

**Connector mapping** (no longer needed — JSON config is already close to SDK format):
- `packages/electron/src/main/connectorMapping.ts`

**Tests** (all tests for deleted files):
- `packages/connectors/src/__tests__/cliDetection.test.ts`
- `packages/connectors/src/node/__tests__/cliDetectionImpl.test.ts`
- `packages/connectors/src/__tests__/platformDetection.test.ts`
- `packages/connectors/src/__tests__/connectorRegistry.test.ts`
- `packages/ui/src/browser/connectors/cliToolListItem.test.ts`
- `packages/ui/src/browser/connectors/connectorDrawer.test.ts`
- `packages/ui/src/browser/connectors/connectorConfigForm.test.ts`
- `packages/ui/src/browser/connectors/connectorStatusBanner.test.ts`
- `packages/electron/src/__tests__/connectorMapping.test.ts`
- `tests/integration/cli-install.test.ts`
- `tests/e2e/cli-install.spec.ts`
- `tests/e2e/cli-tool-install.spec.ts`

### Files to modify

- `packages/base/src/common/types.ts` — replace `ConnectorConfig` with `MCPServerConfig` + `MCPServerState`, remove `Workspace.connectorOverrides`
- `packages/base/src/__tests__/types.test.ts` — update for new types
- `packages/connectors/src/index.ts` — update exports
- `packages/connectors/src/common/connectorRegistry.ts` — rename to `connectorConfigStore.ts`, define `IConnectorConfigStore` interface
- `packages/connectors/src/node/mcpClientManagerImpl.ts` — depend on config store, add reconciliation
- `packages/connectors/src/common/mcpClientManager.ts` — update interface
- `packages/connectors/src/__tests__/mcpClientManager.test.ts` — update for reconciliation, new constructor dependency
- `packages/connectors/src/node/mcpConnection.ts` — accept `MCPServerConfig` + server name instead of `ConnectorConfig`, map `'http'` to streamable HTTP transport
- `packages/connectors/src/__tests__/mcpConnection.test.ts` — update for new constructor signature
- `packages/platform/src/ipc/common/ipc.ts` — remove CLI channels and schemas, add CONNECT/DISCONNECT channels and schemas, update CONNECTOR_LIST response schema
- `packages/platform/src/storage/node/globalSchema.ts` — keep `connectors` migration (harmless, avoids upgrade issues) but stop using it
- `packages/electron/src/main/mainProcess.ts` — rewire services, remove CLI handlers, add new IPC handlers, register agent tools
- `apps/desktop/src/preload/index.ts` — update whitelist
- `packages/ui/src/browser/connectors/connectorSidebar.ts` — remove CLI section, simplify to server list
- `packages/ui/src/browser/connectors/connectorListItem.ts` — update to use `MCPServerState`
- `packages/ui/src/browser/connectors/connectorListItem.test.ts` — update for new type
- `packages/ui/src/browser/workbench.ts` — remove drawer wiring, CLI install/auth handlers
- `packages/ui/src/browser/onboarding/onboardingFlow.ts` — remove CLI detection step reference
- `packages/ui/src/index.ts` — remove CLI/drawer exports
- `skills/connectors/setup.md` — reference agent tools instead of IPC

### Files to create

- `packages/connectors/src/common/connectorConfigStore.ts` — `IConnectorConfigStore` interface + `createServiceIdentifier`
- `packages/connectors/src/node/connectorConfigStore.ts` — JSON config store implementation
- `packages/connectors/src/node/agentTools.ts` — agent tool handler functions (pure, testable)
- `packages/connectors/src/__tests__/connectorConfigStore.test.ts` — unit tests
- `packages/connectors/src/__tests__/agentTools.test.ts` — unit tests

## What stays unchanged

- `skills/install/*.md` (8 files) — agent knowledge for CLI tool installation
- `skills/auth/*.md` (6 files) — agent knowledge for CLI tool authentication
- `tests/fixtures/test-mcp-server.mjs` — E2E test fixture
- `tests/fixtures/test-mcp-server.ts` — integration test fixture
- SQLite for conversations, settings, workspaces, permissions

## Testing strategy

### Unit tests

- `ConnectorConfigStore` — read/write `mcp.json`, atomic writes, file watcher picks up external edits, malformed JSON keeps last-known-good, missing file creates default, `onDidChangeServers` fires correctly, watcher suppression during programmatic writes, concurrent rapid writes don't corrupt
- Agent tools — `add_mcp_server`/`remove_mcp_server`/`list_mcp_servers` with mock config store and mock client manager. Negative cases: empty name, duplicate name, non-existent server removal, invalid transport fields.
- `MCPClientManagerImpl.reconcile()` — added/removed/changed/unchanged servers handled correctly

### Integration test (blocking deliverable)

Full lifecycle with real MCP fixture server:
1. Add server via `add_mcp_server` agent tool handler → writes to config store → reconciliation auto-connects
2. Verify tools available via `MCPClientManagerImpl.getTools()`
3. `list_mcp_servers` returns correct status
4. `remove_mcp_server` → auto-disconnects
5. Add server with bad command → error status, no crash
6. External edit to `mcp.json` → file watcher picks up, reconciliation runs
7. Write invalid JSON → app doesn't crash, last-known-good preserved

### E2E tests (Playwright)

- App launches, Connectors panel shows configured servers with correct status
- Click "Add Connector" → setup conversation opens in chat
- Connect/Disconnect buttons → status dot updates
- Remove server → disappears from panel
- No CLI Tools section visible
- No drawer opens on server click

### Tests to delete

All CLI detection tests (unit, integration, E2E), connector registry SQLite tests, drawer-related test assertions.

## Migration

No data migration needed. Existing SQLite connector configs are abandoned — users re-add their MCP servers via the new flow. This is acceptable because:

- The app is in early development (pre-release)
- Most test users have 0-2 connectors configured
- The setup conversation makes re-adding fast

## Future extensions

- **Workspace folder selection** → enables reading `.vscode/mcp.json` and merging with user-level config (workspace wins on name collision)
- **`inputs` array** → prompted secrets with `${inputs:id}` variable substitution
- **Server gallery** → browse and install MCP servers from a registry
