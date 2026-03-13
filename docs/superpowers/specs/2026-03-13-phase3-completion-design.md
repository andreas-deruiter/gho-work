# Phase 3 Completion — Conversational Connector Setup

**Version:** 1.0
**Date:** 2026-03-13
**Based on:** PRD v0.2, Implementation Plan v0.1, Phase 3A/3B specs

---

## 1. Overview

Phase 3A/3B built the connector management backbone: MCP client with stdio + HTTP transports, SQLite-backed registry, CLI detection, connector sidebar/drawer UI, and agent-assisted CLI install flows. What remains is:

1. **Conversational MCP server setup** — agent-guided install for any MCP server
2. **Unified "Add Connector" flow** — one entry point for both MCP servers and CLI tools
3. **Phase 3 tests** — hardening what's already built

### Design Decisions

- **No registry browser UI.** Discovery is handled conversationally — the agent queries the MCP Registry API or uses web search. VS Code is building native MCP Gallery support; we don't duplicate it.
- **No MCP gateway.** We keep dual connections (our MCPClientManager for UI state, SDK connects independently). The gateway is an optimization for later — the cost of two connections per server is negligible for typical usage (5-10 servers).
- **No tool caching.** Showing tools from last connection before server starts is a nice-to-have, deferred.
- **No trust prompts.** Server trust management is deferred to a future phase.
- **No remote MCP OAuth.** Token management for remote servers via ISecureStorageService is separate future work.

### Rationale: Conversational over Browse UI

The MCP Registry API (`registry.modelcontextprotocol.io`) supports only free-text `search` — no category filtering, no sorting, no faceted browsing. A browse UI would just be a search box with cards, which the agent can do better conversationally:

- Agent can search the registry, web search as fallback, and cross-reference multiple sources
- Agent handles edge cases (wrong package, auth setup, env vars, troubleshooting)
- Agent can auto-configure zero-config servers without creating a conversation at all
- Consistent with our CLI install pattern (already conversational)
- Much less code (~300 lines vs ~800+ for a registry browser)

---

## 2. Conversational MCP Server Setup

### Entry Points

1. **"Add Connector" button** in the connector sidebar — opens a conversation with the setup skill. No query pre-filled; agent asks what to connect.
2. **CLI tool "Install" button** — opens a conversation with the setup skill, pre-filled with the tool name (e.g., `query: "gh CLI"`).
3. **Direct chat** — user types "set up Google Drive MCP" in any conversation. The agent recognizes the intent and handles it inline (no separate conversation needed).

### Conversation Flow

```
User clicks "Add Connector"
         ↓
New conversation created with:
  - Setup skill (`skills/connectors/setup.md`) as system context
  - Platform context (OS, arch, package managers) injected
  - Optional query pre-filled (e.g., "gh CLI" from Install button)
         ↓
Agent asks what to connect (if no query)
         ↓
Agent searches MCP Registry API or web
         ↓
Agent determines install method:
  - npm → npx -y <package>
  - pypi → uvx <package>
  - Docker → docker run <image>
  - CLI tool → loads tool-specific install skill as additional context
         ↓
Env vars needed?
  ├─ No → auto-configure via CONNECTOR_ADD IPC, test connection, report result
  └─ Yes → guide user through obtaining credentials, then configure
         ↓
Connector appears in sidebar with status dot
```

### Zero-Config Fast Path

When the user requests a server setup from within an existing conversation (entry point 3: "Direct chat"), and the server needs no environment variables, the agent auto-configures inline without creating a separate conversation:

1. Agent determines no env vars needed from registry metadata
2. Agent calls `CONNECTOR_ADD` with generated config
3. Agent reports success/failure in the current conversation

This fast path only applies to the "Direct chat" entry point. When the user clicks "Add Connector" or "Install" buttons, a dedicated conversation is always created (since those entry points create a new conversation by design).

### Setup Skill

New file: `skills/connectors/setup.md`

The skill is an agent directive (not user documentation) that instructs the agent how to:

- Query the MCP Registry API: `curl -s "https://registry.modelcontextprotocol.io/v2025-07-09/servers?search=<query>&limit=5&version=latest"` — response has `{ servers: [...], metadata: { count, nextCursor? } }`
- Parse the registry response: each server has `name`, `description`, `packages[]` (with `registryType`, `identifier`, `environmentVariables[]`), `remotes[]`
- Map registry packages to ConnectorConfig:
  - npm: `{ transport: 'stdio', command: 'npx', args: ['-y', identifier] }`
  - pypi: `{ transport: 'stdio', command: 'uvx', args: [identifier] }`
  - docker-hub: `{ transport: 'stdio', command: 'docker', args: ['run', '-i', '--rm', identifier] }`
  - streamable-http remote: `{ transport: 'streamable_http', url: remote.url }`
- Handle environment variables: if `environmentVariables` is non-empty, ask user for values before configuring
- For CLI tools: the `createSetupConversation()` service method pre-loads the tool-specific install skill from `skills/install/<toolId>.md` into the system message as additional context (the agent doesn't load files from disk itself)
- Test the connection after adding: use `CONNECTOR_TEST` IPC
- Fallback: if registry search returns no results, use web search to find the right package
- Error handling: if `curl` fails (timeout, DNS, rate limit), fall back to web search. The Copilot SDK sessions have bash tool access enabled by default; the skill should instruct the agent to handle `curl` failures gracefully

### IPC Addition

One new channel in `packages/platform/src/ipc/common/ipc.ts`:

```typescript
// Channel definition
CONNECTOR_SETUP_CONVERSATION: {
  request: { query?: string }    // optional pre-filled search query
  response: { conversationId: string }
}

// Zod schemas (following existing pattern)
const ConnectorSetupRequestSchema = z.object({
  query: z.string().optional(),
});
const ConnectorSetupResponseSchema = z.object({
  conversationId: z.string(),
});
```

The preload whitelist (`apps/desktop/src/preload/index.ts`) must also be updated to include `IPC_CHANNELS.CONNECTOR_SETUP_CONVERSATION` in `ALLOWED_INVOKE_CHANNELS`.

---

## 3. Unified "Add Connector" Flow

### Current State

- "Add Connector" button → opens connector drawer in add-new mode (manual config form)
- Per-CLI-tool "Install" buttons → `CLI_CREATE_INSTALL_CONVERSATION` → conversation with tool-specific skill
- Per-CLI-tool "Authenticate" buttons → `CLI_CREATE_AUTH_CONVERSATION` → conversation with auth skill + device code
- These are separate code paths doing similar things

### Changes

**Sidebar UI:**
- "Add Connector" button → opens a setup conversation (via `CONNECTOR_SETUP_CONVERSATION` IPC). The drawer's manual add-new mode remains accessible from within the conversation ("I want to configure it manually" → agent provides the config form link) or via a secondary UI path.
- CLI tool "Install" buttons → use `CONNECTOR_SETUP_CONVERSATION` with `query` set to the tool name (e.g., `"gh CLI"`). Replaces `CLI_CREATE_INSTALL_CONVERSATION`.
- CLI tool "Authenticate" buttons → stay as-is. Auth is a distinct flow (device code, no discovery needed).

**Skill consolidation:**
- `skills/install/*.md` (gh, pandoc, git, mgc, az, gcloud, workiq) → become **reference knowledge**. The setup skill loads them when it identifies which CLI tool the user needs. They are no longer separate conversation entry points. Note: m365 is excluded from CLI detection (broken device code flow in v11) so its install skill is not referenced.
- `skills/auth/*.md` → stay as-is (used by auth conversation flow).
- New: `skills/connectors/setup.md` → the unified skill.

**IPC changes:**
- Add: `CONNECTOR_SETUP_CONVERSATION`
- Remove: `CLI_CREATE_INSTALL_CONVERSATION` (replaced by `CONNECTOR_SETUP_CONVERSATION` with query)
- Keep: `CLI_CREATE_AUTH_CONVERSATION`, `CLI_INSTALL`, `CLI_AUTHENTICATE`

**Agent service changes:**
- Add to `IAgentService` interface (`packages/agent/src/common/agent.ts`):
  ```typescript
  createSetupConversation(query?: string, platformContext?: PlatformContext): Promise<string>;
  ```
  Implementation (`AgentServiceImpl`): loads setup skill from `skills/connectors/setup.md`, injects platform context into system message, optionally pre-fills query as the first user message. If query matches a known CLI tool ID (gh, git, pandoc, mgc, az, gcloud, workiq), also appends that tool's install skill content (`skills/install/<toolId>.md`) to the system message as additional context. Returns the conversation ID.
- Remove: `createInstallConversation(toolId, platformContext)` — fully replaced by `createSetupConversation()`. The `CLI_CREATE_INSTALL_CONVERSATION` IPC channel is also removed (not deprecated — removed). The workbench wiring in `packages/ui/src/browser/workbench.ts` must be updated to use `CONNECTOR_SETUP_CONVERSATION` instead.

**Error handling:** If `_conversationService` is null (SQLite storage failed to load), `createSetupConversation()` throws a descriptive error. The IPC handler in `mainProcess.ts` catches this and returns `{ conversationId: '', error: 'Storage unavailable' }`. The sidebar UI shows a toast notification with the error instead of navigating to a broken conversation.

---

## 4. Phase 3 Tests

### Test MCP Server Fixture

New file: `tests/fixtures/test-mcp-server.mjs`

Minimal stdio MCP server using `@modelcontextprotocol/sdk/server`. Written as plain ESM JavaScript (`.mjs`) so it can be spawned directly with `node tests/fixtures/test-mcp-server.mjs` — no build step or `tsx` needed:
- Exposes 3 tools: `echo` (returns input), `add` (adds two numbers), `timestamp` (returns current time)
- Speaks MCP protocol over stdio
- Can be spawned as a child process from tests
- Clean shutdown on SIGTERM

### Unit Tests

`packages/connectors/src/__tests__/mcpConnection.test.ts`:
- Connect to mock MCP server → status transitions to 'connected'
- Disconnect → status transitions to 'disconnected'
- Tool list refresh on `tools/list_changed` notification
- Heartbeat timeout → status transitions to 'error'
- Tool enable/disable via toolsConfig

`packages/connectors/src/__tests__/mcpClientManager.test.ts`:
- Multi-server connect/disconnect management
- Auto-connect enabled servers on startup
- Status and tools event forwarding to registry
- Disconnect all on dispose

`packages/connectors/src/__tests__/connectorRegistry.test.ts` (extend existing):
- Status transitions: initializing → connected → error → disconnected
- Enabled/disabled filtering
- Concurrent update safety

`packages/connectors/src/__tests__/cliDetection.test.ts`:
- PATH scanning with mock execFile
- Version parsing for each CLI tool
- Device code auth flow: capture URL/code from process output
- Background process timeout (3-minute limit)

### Integration Tests

`tests/integration/mcpServer.test.ts`:
- Spawn test fixture MCP server → connect via MCPConnection → list tools → verify 3 tools returned → call echo tool → verify result → shutdown → verify clean disconnect

`tests/integration/connectorSetup.test.ts`:
- `createSetupConversation()` creates conversation with setup skill as system message
- `createSetupConversation('gh CLI')` loads both setup skill and gh install skill
- Platform context (OS, arch, package managers) is injected into system message

### E2E Tests (Playwright)

`tests/e2e/connector-add-manual.spec.ts` — Add connector via config form:
1. Click "Add Connector" in sidebar (or access manual config path)
2. Open drawer in add-new mode
3. Fill in name, select stdio transport, enter command (`node tests/fixtures/test-mcp-server.mjs`)
4. Click Save
5. Wait for status dot to turn green (connected)
6. Click connector to open drawer → verify tools are listed (echo, add, timestamp)
7. Toggle echo tool off → verify it's disabled
8. Disconnect → verify status dot turns grey
9. Remove connector → verify it's gone from sidebar

`tests/e2e/connector-add-conversational.spec.ts` — Add connector via agent:
1. Click "Add Connector" in sidebar
2. Conversation opens with setup skill context
3. Type "set up the test echo server" (or verify mock agent response configures the test fixture)
4. Wait for connector to appear in sidebar with green status dot
5. Open drawer → verify tools from test fixture are listed
6. Send a chat message that triggers an MCP tool → verify tool call card appears with result

`tests/e2e/cli-tool-install.spec.ts` — CLI tool install via unified flow:
1. Find a CLI tool with "Install" button in sidebar (use mock mode)
2. Click "Install" button
3. Conversation opens — verify setup skill is loaded as system context
4. Verify platform info (OS, arch, package managers) is in system message
5. Verify the tool-specific install skill content is loaded as additional context
6. Mock agent completes install → CLI tools list refreshes → tool shows as installed with checkmark

`tests/e2e/connector-reconnect.spec.ts` — Connection recovery:
1. Add test fixture server via config, wait for green status dot
2. Kill the fixture server process
3. Wait for status dot to turn red (error) — triggered by heartbeat timeout in `MCPConnection` (existing: 30s ping, 3 missed = error)
4. Click "Reconnect" button in the connector status banner (existing: `ConnectorStatusBannerWidget` shows reconnect action on error)
5. Verify status dot returns to green after reconnect
6. Verify tools are still listed correctly

Note: `MCPConnection` already implements heartbeat-based error detection. The `MCPClientManager.connectServer()` method can be called again to reconnect (it disposes the old connection and creates a new one). The "Reconnect" button in the status banner triggers this via `CONNECTOR_TEST` or a re-connect IPC call. This E2E test verifies the existing reconnection path works end-to-end.

---

## 5. File Changes Summary

| Type | File | Change |
|------|------|--------|
| New | `skills/connectors/setup.md` | Unified setup skill (agent directive) |
| New | `tests/fixtures/test-mcp-server.mjs` | Test MCP server fixture (plain ESM JS) |
| New | `tests/e2e/connector-add-manual.spec.ts` | E2E: manual connector add |
| New | `tests/e2e/connector-add-conversational.spec.ts` | E2E: conversational connector add |
| New | `tests/e2e/cli-tool-install.spec.ts` | E2E: CLI install via unified flow |
| New | `tests/e2e/connector-reconnect.spec.ts` | E2E: connection recovery |
| New | `tests/integration/mcpServer.test.ts` | Integration: real MCP server lifecycle |
| New | `tests/integration/connectorSetup.test.ts` | Integration: setup conversation creation |
| New | `packages/connectors/src/__tests__/mcpConnection.test.ts` | Unit: MCP connection lifecycle |
| New | `packages/connectors/src/__tests__/mcpClientManager.test.ts` | Unit: multi-server management |
| New | `packages/connectors/src/__tests__/cliDetection.test.ts` | Unit: CLI detection + auth |
| Modified | `packages/connectors/src/__tests__/connectorRegistry.test.ts` | Extend: status transitions, filtering |
| Modified | `packages/platform/src/ipc/common/ipc.ts` | Add `CONNECTOR_SETUP_CONVERSATION` channel + zod schemas |
| Modified | `apps/desktop/src/preload/index.ts` | Add `CONNECTOR_SETUP_CONVERSATION` to `ALLOWED_INVOKE_CHANNELS` |
| Modified | `packages/agent/src/common/agent.ts` | Add `createSetupConversation()` to `IAgentService` interface |
| Modified | `packages/agent/src/node/agentServiceImpl.ts` | Implement `createSetupConversation()`, remove `createInstallConversation()` |
| Modified | `packages/ui/src/browser/connectors/connectorSidebar.ts` | Wire "Add Connector" button to setup conversation |
| Modified | `packages/ui/src/browser/connectorsPanel.ts` | Update "Install" button IPC from `CLI_CREATE_INSTALL_CONVERSATION` to `CONNECTOR_SETUP_CONVERSATION` |
| Modified | `packages/ui/src/browser/workbench.ts` | Update IPC call from `CLI_CREATE_INSTALL_CONVERSATION` to `CONNECTOR_SETUP_CONVERSATION` |
| Modified | `packages/electron/src/main/mainProcess.ts` | Wire `CONNECTOR_SETUP_CONVERSATION` handler, remove `CLI_CREATE_INSTALL_CONVERSATION` handler |

## 6. What's NOT in Scope

- MCP Registry browser UI (discovery is conversational)
- Registry service / API client (agent queries the API directly via bash)
- MCP gateway / HTTP proxy (keep dual connections for now)
- Tool caching (show tools before server starts — defer)
- Trust prompts (server trust management — defer)
- Remote MCP OAuth token management (separate future work)
- Sampling support (MCP server → client LLM requests — defer)
- Elicitation support (MCP server UI dialogs — defer)

---

## 7. Relationship to Implementation Plan

This spec covers the remaining Phase 3 deliverables:

- **Deliverable 3 (MCP Registry integration)** — replaced by conversational setup. The agent queries the registry API directly; no custom registry service needed.
- **Deliverable 5 (CLI tool detection)** — already implemented. This spec unifies the install entry point.
- **Deliverable 6 (Connector settings UI)** — the 5-tab layout is deferred. The sidebar + drawer + conversational setup covers the core UX.
- **Deliverable 7 (Tool bridge)** — already implemented via `connectorMapping.ts`.
- **Deliverable 8 (Phase 3 tests)** — fully specified in Section 4.

Deliverables 1 (MCP Manager), 2 (Connector registry), and 4 (Remote MCP) are partially complete:
- MCP Manager and Connector Registry are fully implemented
- Remote MCP (Streamable HTTP transport) is implemented in MCPConnection but OAuth token management is deferred
