# GHO Work -- Implementation Plan

**Version:** 0.1
**Date:** 2026-03-11
**Based on:** PRD v0.1 (2026-03-10)

---

## 1. Phased Approach

The project is divided into six phases. Phases 0 and 1 are strictly sequential. Phases 2 and 3 can overlap once the IPC and DI foundations from Phase 1 are stable. Phase 4 depends on Phases 2 and 3. Phase 5 is ongoing from Phase 2 onward.

| Phase | Name | Duration (est.) | Key Outcome |
|-------|------|-----------------|-------------|
| 0 | Project Scaffolding | 1 week | Monorepo, tooling, CI, empty Electron shell boots |
| 1 | Core Shell and Foundations | 3 weeks | Multi-process architecture, DI system, IPC, auth, storage |
| 2 | Agent Integration | 4 weeks | Copilot SDK harness connected, agent loop functional, permissions, chat UI streaming |
| 3 | Connectors and Integrations | 3 weeks (overlaps Phase 2) | MCP Manager, registry integration, remote MCP server support (Streamable HTTP + OAuth), CLI detection, connector settings UI |
| 4 | Office Features and Skills | 3 weeks | Built-in skills, document model, workspace/memory, parallel task queue |
| 5 | Polish, Testing, and Launch Prep | 3 weeks | E2E tests, packaging, code signing, auto-update, onboarding UX, error tracking |

**Total estimated calendar time:** 12-14 weeks with a team of 3-4 engineers, given overlap between Phases 2 and 3.

---

## 2. Per-Phase Deliverables

### Phase 0: Project Scaffolding (Week 1)

**Goal:** A developer can clone the repo, run `pnpm install && pnpm dev`, and see an empty Electron window.

**Deliverables:**

- [ ] 1. **Monorepo initialization**
   - Turborepo with pnpm workspaces
   - Packages: `packages/base`, `packages/platform`, `packages/agent`, `packages/connectors`, `packages/ui`, `packages/electron`
   - App entry: `apps/desktop`
   - Directories: `cli-guides/`, `skills/`, `docs/`, `tests/`

- [ ] 2. **Build tooling**
   - Vite + electron-vite configuration
   - TypeScript 5.x with strict mode, path aliases per package
   - ESLint (flat config) + Prettier
   - Vitest configured for unit tests
   - Playwright configured for E2E (Electron target)

- [ ] 3. **CI pipeline (GitHub Actions)**
   - Lint + type-check + unit test on every PR
   - Build Electron app on macOS and Windows runners
   - Changesets bot for version management

- [ ] 4. **Empty Electron shell**
   - Main process creates a BrowserWindow
   - Preload script with contextBridge stub
   - Renderer loads a minimal HTML page
   - Dev mode with HMR

- [ ] 5. **Development feedback infrastructure**
   - ESLint flat config for TypeScript (`eslint.config.mjs`) with recommended + typescript rules
   - Vitest workspace config (`vitest.workspace.ts`) covering all packages
   - Playwright config (`playwright.config.ts`) targeting Electron binary
   - Smoke test runner (`tests/smoke/helpers.ts`) with step/autoStep helpers
   - Smoke test for Phase 0 acceptance criteria (`tests/smoke/phase0.ts`)

- [ ] 6. **Phase 0 tests**
   - Unit test example per package (verify Vitest resolves cross-package imports)
   - Playwright smoke test: Electron window launches and renders HTML (`tests/e2e/app-launches.spec.ts`)

**Acceptance criteria:**
- [ ] `pnpm dev` launches Electron window on macOS
- [ ] `pnpm build` produces a packaged app
- [ ] CI passes on a clean PR
- [ ] All packages resolve their cross-references
- [ ] `npx vitest run` passes with at least one test per package
- [ ] `npx playwright test` passes the app-launch smoke test

### Phase 1: Core Shell and Foundations (Weeks 2-4)

**Goal:** The architectural skeleton is in place. Multi-process model works. DI container resolves services. Auth flow completes. Storage reads and writes.

**Deliverables:**

- [ ] 1. **Dependency injection system** (`packages/base`)
   - `createServiceIdentifier<T>()` decorator factory
   - `ServiceCollection` for registration
   - `InstantiationService` for resolution (constructor injection)
   - `Disposable` base class and `IDisposable` interface
   - `Event<T>` and `Emitter<T>` for typed events

- [ ] 2. **IPC infrastructure** (`packages/platform`)
   - Typed IPC channel definitions (Main <-> Renderer via contextBridge)
   - MessagePort creation and handoff (Renderer <-> Agent Host, Renderer <-> MCP Manager)
   - `IIPCService` interface and implementation for each process
   - Serialization/deserialization with type safety (zod schemas)

- [ ] 3. **Multi-process bootstrap**
   - Main process: app lifecycle, window management, tray icon, native menus
   - Renderer process: workbench shell (empty layout with sidebar, main panel, status bar)
   - Agent Host: utility process spawned from Main, MessagePort connected to Renderer
   - (MCP Manager deferred -- starts inside Agent Host, separated in Phase 3 if needed)

- [ ] 4. **Authentication** (`packages/platform`)
   - `IAuthService` interface and implementation
   - GitHub OAuth PKCE flow (localhost redirect)
   - Token storage via Electron safeStorage
   - Copilot subscription tier verification (`GET /user/copilot`)
   - Login/logout UI in Renderer
   - Auth state observable via `Event<AuthState>`

- [ ] 5. **Storage layer** (`packages/platform`)
   - `IStorageService` interface
   - Global SQLite database (better-sqlite3): user, preferences, connector configs, permission rules
   - Per-workspace SQLite database: conversations, messages, tool calls
   - `ISecureStorageService` wrapping Electron safeStorage
   - `IFileService` abstraction over Node.js fs

- [ ] 6. **Workbench shell** (`packages/ui`) — see [UX Tutorial Site](tutorial/index.html#workbench) for visual spec
   - VS Code-style layout: activity bar (48px), sidebar (240px, collapsible via Cmd+B), main content area, status bar (24px)
   - Activity bar with icon buttons: Chat, Tool Activity, Connectors, Documents, Settings (bottom)
   - Status bar: workspace path, connector count/status, active model, agent state, Copilot usage meter, user avatar
   - Custom DOM widget base classes: `Widget`, `SplitView`, `ListView`
   - CSS custom properties for theming (light/dark/system)
   - Keyboard navigation foundation (Cmd+B, Cmd+N, Cmd+K, Cmd+L, Cmd+1-4, Cmd+,, Esc)

- [ ] 7. **Test infrastructure and Phase 1 tests**
   - `TestInstantiationService`: mock DI container with `stub()`, `createInstance()`, `get()`, `set()` methods (adapted from VS Code's pattern — see `references/vscode/src/vs/platform/instantiation/test/`)
   - `ensureNoDisposablesAreLeakedInTestSuite()`: Vitest adaptation of VS Code's disposable leak detector — wraps `afterEach` to verify all disposables created during a test are disposed
   - Unit tests: DI resolution (3+ service chain, cycle detection, lazy instantiation via SyncDescriptor)
   - Unit tests: `Event<T>` and `Emitter<T>` (subscribe, fire, dispose, composition: map/filter/debounce), `DisposableStore` (add, dispose, double-dispose safety)
   - Unit tests: IPC message round-trip (serialize, send, receive, deserialize with zod validation)
   - Unit tests: SQLite CRUD operations, schema migration (version 0→1→2), WAL mode verification
   - Unit tests: auth token encrypt/decrypt via safeStorage mock, OAuth state management
   - Integration test: multi-process bootstrap — Main spawns Agent Host, MessagePort handshake, bidirectional message exchange
   - Smoke test (`tests/smoke/phase1.ts`): workbench shell renders activity bar + sidebar + main panel + status bar, theme toggle works, keyboard shortcuts respond

**Acceptance criteria:**
- [ ] Agent Host utility process starts and exchanges messages with Renderer via MessagePort
- [ ] DI container resolves a chain of 3+ services with constructor injection
- [ ] User can sign in with GitHub, token persists across restarts
- [ ] SQLite stores and retrieves a test entity
- [ ] Workbench renders sidebar + main panel with theme switching
- [ ] `TestInstantiationService` can stub services and create instances for tests
- [ ] `ensureNoDisposablesAreLeakedInTestSuite()` detects leaked disposables in a failing test
- [ ] All Phase 1 unit tests pass (`npx vitest run`)

### Phase 2: Agent Integration (Weeks 4-7)

**Goal:** A user can type a prompt, the Copilot SDK processes it, tools execute (with permission approval), and streaming output appears in the chat UI.

**Deliverables:**

- [ ] 1. **Copilot SDK wrapper** (`packages/agent`)
   - `ICopilotSDK` interface: `createSession()`, `configureModel()`, `registerTool()`, `streamEvents()`
   - Implementation wrapping `@github/copilot-cli-sdk`
   - Copilot CLI server lifecycle: detect, start, connect (JSON-RPC over stdio)
   - Session configuration: model selection, max iterations, custom instructions
   - Event streaming: text chunks, tool calls, thinking, completion

- [ ] 2. **Agent service** (`packages/agent`)
   - `IAgentService` interface: `executeTask()`, `cancelTask()`, `getTaskStatus()`
   - Context injection: loads CLAUDE.md / .github/copilot-instructions.md, conversation history
   - MCP tool registration with SDK session (tools from `IToolRegistry`)
   - Subagent spawning for parallel subtasks
   - Task queue: accept new tasks while agent is busy (addresses Claude Cowork parity item)

- [ ] 3. **Tool registry** (`packages/agent`)
   - `IToolRegistry` interface: `registerTool()`, `getTools()`, `getToolsByServer()`
   - Unified registry for SDK built-in tools + MCP tools + Agent Skills
   - Tool metadata: name, description, schema, source, server

- [ ] 4. **Permission service** (`packages/agent`)
   - `IPermissionService` interface: `checkPermission()`, `recordDecision()`, `getRules()`
   - Intercepts tool calls before execution
   - Evaluates persisted rules (glob pattern matching on tool names)
   - Surfaces approval request to Renderer via IPC when no rule matches
   - Stores decisions (allow once, allow always, deny, deny always)
   - Audit log: every tool call and decision written to workspace SQLite

- [ ] 5. **Chat UI** (`packages/ui`) — see [UX Tutorial Site](tutorial/index.html#chat) for visual spec
   - `ChatPanel` widget: message list, auto-growing input area, send button
   - Streaming text rendering (token-by-token with Markdown, cursor blink indicator)
   - Tool call visualization: collapsible cards (collapsed after completion) showing tool name, status icon, duration. Expand for: server, arguments (JSON), result, permission decision.
   - Thinking indicator: animated dots with step label (e.g., "Analyzing spreadsheet data...")
   - Permission prompt: inline in chat flow (not modal) with keyboard shortcuts: Enter=Allow Once, Shift+Enter=Allow Always, Esc=Deny, Shift+Esc=Deny Always. Shell commands shown with warning header and full command text.
   - Model selector dropdown in main panel header (also via `/model` command)
   - Slash command autocomplete: type `/` to show skills + system commands inline
   - File drag-and-drop: drop files onto input area to attach (shown as file pills)
   - Cancel button: "Stop generating" appears during agent work
   - Conversation list in sidebar: search filter, right-click context menu (rename, archive, delete)

- [ ] 6. **Conversation persistence**
   - Save messages and tool calls to workspace SQLite
   - Load conversation history on session restore
   - Auto-title generation (first user message summary)

- [ ] 7. **Phase 2 tests**
   - Unit tests: tool registry CRUD (register, get, getByServer, remove), tool name collision detection
   - Unit tests: permission rule matching — glob patterns on tool names, rule precedence (specific > general), all four decision types (allow once, allow always, deny, deny always)
   - Unit tests: conversation persistence — save/load messages, save/load tool calls, auto-title generation
   - Integration test: agent service end-to-end — mock Copilot SDK → tool call → permission check → response streamed back
   - Smoke test (`tests/smoke/phase2.ts`): send message and receive streaming response, tool call card renders with expand/collapse

**Acceptance criteria:**
- [ ] User types "Hello, what can you do?" and receives a streaming response
- [ ] User types "Read the file at ~/test.txt" -- permission prompt appears, user approves, file content shown
- [ ] User types "List files in ~/Documents" -- bash tool executes with approval, output shown
- [ ] Tool calls appear as expandable cards with arguments and results
- [ ] Conversation persists across app restart
- [ ] Model can be switched mid-session
- [ ] Task can be canceled mid-execution
- [ ] All Phase 2 unit and integration tests pass (`npx vitest run`)

### Phase 3: Connectors and Integrations (Weeks 5-8, overlaps Phase 2)

**Goal:** MCP servers connect and expose tools. CLI tools are detected. The connector settings UI allows configuration.

**Deliverables:**

- [ ] 1. **MCP Manager** (`packages/connectors`)
   - `IMCPClientManager` interface: `connect()`, `disconnect()`, `getServers()`, `getTools()`
   - MCP client using `@modelcontextprotocol/sdk`
   - stdio transport: spawn child process, manage lifecycle, restart on crash
   - Streamable HTTP transport: connect to remote servers
   - Capability negotiation: tools, resources, prompts
   - Dynamic tool list updates (`notifications/tools/list_changed`)
   - Sampling support: route `sampling/complete` through `ICopilotSDK`
   - Elicitation support: surface `elicitation/request` as UI dialog
   - Health monitoring: heartbeat, reconnection logic

- [ ] 2. **Connector registry** (`packages/connectors`)
   - `IConnectorRegistry` interface: `getConnectors()`, `addConnector()`, `removeConnector()`
   - Persist connector configs in global SQLite
   - Connector status tracking (connected/disconnected/error/initializing)

- [ ] 3. **MCP Registry integration** (`packages/connectors`)
   - `IMCPRegistryService` interface: `searchServers()`, `getServerDetails()`, `getInstallConfig()`
   - Integration with MCP Registry API (`registry.modelcontextprotocol.io/v0.1/servers`)
   - Server browser: search, filter by category, view details, community ratings
   - One-click install for npm-based servers (generates stdio config with `npx` command)
   - Configuration templates for popular servers (pre-filled command, args, env vars)

- [ ] 4. **Remote MCP server support** (`packages/connectors`)
   - Streamable HTTP transport: connect to remote MCP servers (same as Claude Integrations)
   - OAuth token management for remote servers (token storage via `ISecureStorageService`)
   - Support for allowlisting/denylisting tools per server
   - Per-tool configuration
   - Multiple remote servers simultaneously

- [ ] 5. **CLI tool detection** (`packages/connectors`)
   - Detect installed CLIs: `gh`, `mgc`, `az`, `gcloud`, `pandoc`
   - Version check and compatibility validation
   - Setup guidance for missing tools (link to install docs)
   - Wrapper utilities for common CLI patterns (JSON output parsing)

- [ ] 6. **Connector settings UI** (`packages/ui`) — see [UX Tutorial Site](tutorial/index.html#connectors) for visual spec
   - `ConnectorPanel` in Settings with 5-tab layout: Installed, Registry, Remote, CLI Tools, Custom
   - Installed tab: MCP servers (status dot, tool count, enable/disable toggle, gear icon) + CLI tools subsection
   - Registry tab: search + filter MCP Registry, server cards with Install/Installed badge
   - Remote tab: Claude-compatible partner servers with OAuth connect buttons
   - CLI Tools tab: detected CLIs with version/auth status, install links for missing
   - Custom tab: form for manual MCP server config (name, transport, command/args/env or URL/headers)
   - Per-connector detail view (gear icon): tools list with per-tool enable/disable toggles, credentials, test connection, disconnect
   - Also accessible as sidebar Connectors view (quick status + enable/disable)

- [ ] 7. **Tool bridge: MCP tools to SDK**
   - When MCP server connects and lists tools, register each as a custom tool with the SDK session via `IToolRegistry`
   - Route SDK tool calls for MCP tools through the MCP Manager
   - Handle MCP tool results and feed back to SDK

- [ ] 8. **Phase 3 tests**
   - Unit tests: MCP client connect/disconnect lifecycle, tool list change handling (debounce, cache invalidation), health check ping timeout
   - Unit tests: connector registry CRUD, connector status transitions (initializing → connected → error → disconnected)
   - Unit tests: CLI detection — mock PATH scanning, version parsing, missing tool handling
   - Integration test: stdio MCP server lifecycle — spawn mock server → connect → list tools → call tool → shutdown (using a minimal test MCP server fixture)
   - Integration test: registry API search — mock HTTP responses, parse server list, generate install config
   - Smoke test (`tests/smoke/phase3.ts`): install a test MCP server from config, verify tools appear in tool registry, call a tool and see result

**Acceptance criteria:**
- [ ] Registry browser displays servers from MCP Registry API, search works
- [ ] A community MCP server (e.g., Google Drive) installed from the registry connects and exposes tools in the tool registry
- [ ] A remote MCP server connected via Streamable HTTP + OAuth authenticates and lists tools
- [ ] `gh` CLI detected, version shown in settings, agent can run `gh issue list`
- [ ] `mgc` CLI detected, agent can query OneDrive files via shell
- [ ] Connector settings UI shows all configured servers with live status
- [ ] Test connection button works for MCP servers (both stdio and HTTP)
- [ ] Adding a custom MCP server via settings UI works end-to-end
- [ ] Tool allowlisting/denylisting works for remote servers
- [ ] All Phase 3 unit and integration tests pass (`npx vitest run`)

### Phase 4: Office Features and Skills (Weeks 8-11)

**Goal:** The office productivity features work. Built-in skills are functional. Memory system is complete. Workspace management is polished.

**Deliverables:**

- [ ] 1. **Memory service** (`packages/agent`)
   - `IMemoryService` interface: `loadContext()`, `getProjectInstructions()`, `getGlobalPreferences()`
   - Read CLAUDE.md and .github/copilot-instructions.md from workspace root
   - Global memory from ~/.claude/
   - Inject loaded context into SDK session at start
   - Auto-compaction: summarize old conversation context when approaching model limits

- [ ] 2. **Workspace management** (`packages/platform`, `packages/ui`)
   - Workspace picker on launch (recent workspaces, open folder)
   - Per-workspace SQLite database creation
   - Workspace-scoped settings and permission rules
   - Multiple windows sharing MCP Manager (if separated from Agent Host)

- [ ] 3. **Document model** (`packages/ui`, `packages/agent`)
   - Markdown preview panel (using `marked` or `remark` with direct DOM insertion)
   - Document export: Markdown to DOCX (via `docx` library or `pandoc` CLI), Markdown to PDF
   - Document import: DOCX to Markdown (via `mammoth`), Excel to structured data (via `exceljs`)
   - CSV/Excel analysis: `papaparse` for CSV, `exceljs` for Excel, agent can query data

- [ ] 4. **Built-in skills** (`skills/`)
   - `/draft-email`: compose email from brief description with context
   - `/summarize-doc`: summarize document or set of documents
   - `/meeting-prep`: pull calendar event, gather docs, draft agenda
   - `/data-analysis`: analyze spreadsheet/CSV with natural language
   - `/weekly-report`: generate summary from multiple sources
   - Each skill: Markdown definition with YAML frontmatter, allowed tools, description

- [ ] 5. **Skill loading** (`packages/agent`)
   - Scan `.claude/skills/`, `.github/skills/`, `~/.claude/skills/` for skill definitions
   - Parse YAML frontmatter for configuration
   - Register skills as slash commands in the chat
   - Dynamic context injection (shell command output in skill body)

- [ ] 6. **Hooks system** (`packages/agent`)
   - Parse hooks from `.claude/settings.json`
   - Execute pre/post tool call hooks
   - Session start/end hooks
   - Timeout enforcement

- [ ] 7. **Tool activity panel** (`packages/ui`)
   - `ToolActivityPanel` showing live and historical tool calls
   - Filter by server, status, time range
   - Expandable detail view per tool call
   - Audit log viewer

- [ ] 8. **Parallel task queue** (`packages/agent`)
   - Task queue in Agent Host: accept new tasks while agent is processing
   - Queue UI: show pending, active, completed tasks
   - Task status transitions and notifications

- [ ] 9. **Phase 4 tests**
   - Unit tests: memory context loading — CLAUDE.md parsing, .github/copilot-instructions.md fallback, global memory merge
   - Unit tests: skill YAML frontmatter parsing — valid/invalid YAML, allowed tools extraction, dynamic context shell commands
   - Unit tests: hook execution — pre/post tool call hooks, timeout enforcement, hook failure isolation
   - Unit tests: task queue state machine — pending → active → completed/failed, cancel mid-execution, queue ordering
   - Integration test: skill invocation end-to-end — load skill definition → inject context → agent executes with skill tools
   - Smoke test (`tests/smoke/phase4.ts`): run `/draft-email` skill, queue two tasks and verify sequential execution

**Acceptance criteria:**
- [ ] `/draft-email` skill drafts an email using context from connected services
- [ ] `/meeting-prep` pulls calendar events (via Google Calendar MCP or `mgc` CLI) and prepares agenda
- [ ] CLAUDE.md content is injected into agent context automatically
- [ ] Document export produces valid DOCX from Markdown
- [ ] User can queue a second task while first is executing
- [ ] Hook executes after a tool call completes
- [ ] Tool activity panel shows full audit trail
- [ ] All Phase 4 unit and integration tests pass (`npx vitest run`)

### Phase 5: Polish, Testing, and Launch Prep (Weeks 11-14)

**Goal:** The app is stable, tested, packaged, signed, and ready for public use.

**Deliverables:**

- [ ] 1. **End-to-end test suite**
   - Playwright tests for critical flows: auth, chat, tool execution, connector setup
   - Mock Copilot SDK for deterministic test scenarios
   - MCP server test fixtures

- [ ] 2. **Error handling and recovery**
   - Agent Host crash recovery (restart without losing UI state)
   - MCP server crash recovery (auto-reconnect)
   - Network error handling (Copilot API, MCP remote servers)
   - Sentry integration for crash reporting (opt-in)

- [ ] 3. **Onboarding flow** — see [UX Tutorial Site](tutorial/index.html#onboarding) for visual spec
   - 5-step first-launch wizard: Welcome screen, GitHub OAuth (browser), Copilot tier verification (shows available models), CLI tool detection (PATH scan for gh/mgc/pandoc/az/gcloud with version + install links), first connector setup (popular MCP servers grid + registry link)
   - On subsequent launches, open directly to workbench with last workspace
   - CLI tool detection with install guidance
   - Telemetry opt-in prompt
   - Sample workspace with example CLAUDE.md

- [ ] 4. **Packaging and distribution**
   - electron-builder config: DMG (macOS), NSIS (Windows)
   - Apple Developer ID code signing and notarization
   - Windows Authenticode signing
   - Auto-update via electron-updater + GitHub Releases

- [ ] 5. **Performance optimization**
   - Renderer startup time target: < 2 seconds to interactive
   - Memory profiling: ensure MCP servers do not leak
   - SQLite query optimization for large conversation histories

- [ ] 6. **Accessibility**
   - ARIA roles on all interactive elements
   - Keyboard navigation for all panels
   - Screen reader testing (VoiceOver on macOS)

- [ ] 7. **Documentation**
   - README with setup instructions
   - Architecture documentation
   - Connector development guide
   - Skill authoring guide
   - CLI integration patterns (cli-guides/)

- [ ] 8. **Phase 5 comprehensive test suite**
   - Full E2E suite (Playwright): auth flow (login → verify tier → land on workbench), chat conversation (send → stream → tool call → permission → result), connector setup (install MCP server → verify tools → call tool), permission rules (create rule → verify auto-decision)
   - Performance benchmarks: renderer startup < 2s to interactive, SQLite query time for 10k messages, MCP server spawn time, memory usage under sustained agent conversation
   - Accessibility audit: `@axe-core/playwright` on all panels (chat, settings, connectors, tool activity), keyboard-only navigation test, VoiceOver smoke test script

**Acceptance criteria:**
- [ ] E2E tests pass on macOS and Windows CI
- [ ] Signed DMG installs and auto-updates on macOS
- [ ] Time-to-value < 10 minutes (install to first productive task)
- [ ] No critical accessibility issues (axe-core reports zero violations)
- [ ] Crash recovery works without data loss
- [ ] Performance benchmarks meet targets and are tracked in CI

---

## 3. Dependencies and Critical Path

```
Phase 0: Scaffolding
    |
    v
Phase 1: Core Shell (DI, IPC, Auth, Storage, Workbench Shell)
    |
    +---> Phase 2: Agent Integration (needs IPC + DI + Auth + Storage)
    |         |
    |         +---> Phase 4: Office Features (needs Agent + Connectors)
    |                   |
    +---> Phase 3: Connectors (needs IPC + DI + Storage)    |
              |                                              |
              +--------------------------------------------->+
                                                             |
                                                             v
                                                    Phase 5: Polish & Launch
```

**Critical path:** Phase 0 -> Phase 1 (DI + IPC) -> Phase 2 (ICopilotSDK + IAgentService) -> Phase 4 (Skills + Memory) -> Phase 5 (E2E + Packaging).

**Parallelizable work:**
- Phase 2 (Agent) and Phase 3 (Connectors) can proceed in parallel once Phase 1 IPC/DI is stable. They converge when MCP tools need to be registered with the SDK session.
- MCP Registry integration (Phase 3) can proceed independently of the MCP Manager implementation once API contract is defined.
- UI work (chat panel, settings panel, tool activity panel) can be stubbed with mock data and refined as backend services mature.
- CLI guides and skill definitions are documentation/content work that can proceed independently.

**Key integration points (where parallelized work converges):**
1. **MCP-to-SDK bridge** (Phase 2 + 3): MCP tools registered as custom tools in SDK session
2. **Permission UI** (Phase 2): Agent Host sends approval request via IPC, Renderer shows dialog, response routes back
3. **Context injection** (Phase 4 into Phase 2): Memory service feeds into Agent service session creation

---

## 4. Architecture-First Tasks (Must Be Right Early)

These are the foundational decisions and implementations that downstream work depends on. Getting them wrong is expensive to fix.

### 4.1 DI System (Phase 1, Week 2)

The entire codebase uses constructor-based dependency injection. This must be implemented first and correctly.

- `createServiceIdentifier<T>()` -- creates a unique symbol + type brand
- `ServiceCollection` -- registers implementations against identifiers
- `InstantiationService` -- resolves dependency graphs, detects cycles
- Every service is an interface + implementation pair
- Follow VS Code's pattern exactly to minimize design risk

### 4.2 IPC and Process Communication (Phase 1, Week 2-3)

All cross-process communication flows through typed IPC channels. This is the backbone of the multi-process architecture.

- Define all IPC channel types as TypeScript interfaces in `packages/platform`
- Main <-> Renderer: Electron ipcMain/ipcRenderer via contextBridge (preload script exposes typed API)
- Renderer <-> Agent Host: MessagePort (created by Main, handed to both processes)
- Renderer <-> MCP Manager: MessagePort (same pattern)
- All messages must be serializable (no functions, no class instances)
- Use zod for runtime validation of IPC messages

### 4.3 Service Interfaces (Phase 1, Week 2)

Define the core service interfaces before writing implementations. These are the contracts between layers.

```typescript
// packages/platform/src/auth/IAuthService.ts
interface IAuthService {
  readonly onDidChangeAuth: Event<AuthState>;
  login(): Promise<void>;
  logout(): Promise<void>;
  getToken(): Promise<string | null>;
  getUser(): Promise<User | null>;
  getCopilotTier(): Promise<CopilotTier | null>;
}

// packages/platform/src/storage/IStorageService.ts
interface IStorageService {
  getGlobalDatabase(): Database;
  getWorkspaceDatabase(workspaceId: string): Database;
}

// packages/platform/src/storage/ISecureStorageService.ts
interface ISecureStorageService {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

// packages/platform/src/files/IFileService.ts
interface IFileService {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, content: Uint8Array): Promise<void>;
  stat(path: string): Promise<FileStat>;
  readdir(path: string): Promise<string[]>;
  exists(path: string): Promise<boolean>;
}

// packages/agent/src/sdk/ICopilotSDK.ts
interface ICopilotSDK {
  readonly onDidChangeStatus: Event<SDKStatus>;
  initialize(token: string): Promise<void>;
  createSession(config: SessionConfig): Promise<IAgentSession>;
  getAvailableModels(): Promise<ModelInfo[]>;
}

interface IAgentSession {
  readonly onEvent: Event<AgentEvent>;
  registerTool(tool: ToolDefinition): void;
  sendMessage(content: string): Promise<void>;
  cancel(): void;
  dispose(): void;
}

// packages/agent/src/agent/IAgentService.ts
interface IAgentService {
  readonly onDidChangeTask: Event<TaskEvent>;
  executeTask(prompt: string, context: AgentContext): Promise<string>;
  cancelTask(taskId: string): void;
  getTaskQueue(): TaskInfo[];
}

// packages/agent/src/tools/IToolRegistry.ts
interface IToolRegistry {
  readonly onDidChangeTools: Event<void>;
  registerTool(tool: ToolDefinition): IDisposable;
  getTools(): ToolDefinition[];
  getToolsByServer(serverName: string): ToolDefinition[];
}

// packages/agent/src/permissions/IPermissionService.ts
interface IPermissionService {
  checkPermission(toolCall: ToolCallRequest): Promise<PermissionDecision>;
  recordDecision(toolCall: ToolCallRequest, decision: PermissionDecision): Promise<void>;
  getRules(scope: 'global' | 'workspace'): Promise<PermissionRule[]>;
  addRule(rule: PermissionRule): Promise<void>;
  removeRule(ruleId: string): Promise<void>;
}

// packages/agent/src/memory/IMemoryService.ts
interface IMemoryService {
  loadProjectContext(workspacePath: string): Promise<string>;
  loadGlobalContext(): Promise<string>;
  getConversationHistory(conversationId: string, maxTokens: number): Promise<Message[]>;
  compactHistory(conversationId: string): Promise<void>;
}

// packages/connectors/src/mcp/IMCPClientManager.ts
interface IMCPClientManager {
  readonly onDidChangeServers: Event<void>;
  readonly onDidChangeTools: Event<void>;
  connect(config: ConnectorConfig): Promise<void>;
  disconnect(serverId: string): Promise<void>;
  getServers(): ConnectorStatus[];
  getTools(serverId?: string): ToolDefinition[];
  callTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<ToolResult>;
  testConnection(config: ConnectorConfig): Promise<TestResult>;
}

// packages/connectors/src/registry/IConnectorRegistry.ts
interface IConnectorRegistry {
  readonly onDidChangeConnectors: Event<void>;
  getConnectors(): ConnectorConfig[];
  addConnector(config: ConnectorConfig): Promise<void>;
  updateConnector(id: string, updates: Partial<ConnectorConfig>): Promise<void>;
  removeConnector(id: string): Promise<void>;
}
```

### 4.4 Process Bootstrap Sequence (Phase 1, Week 3)

The order in which processes start and connect matters.

1. Main process starts
2. Main creates Renderer (BrowserWindow)
3. Main spawns Agent Host (utility process)
4. Main creates MessagePort pair, sends one port to Renderer (via preload), one to Agent Host
5. Agent Host initializes DI container with its own services (ICopilotSDK, IAgentService, IToolRegistry, IPermissionService, IMemoryService)
6. Renderer initializes DI container with its own services (UI services, proxies to Agent Host services via MessagePort)
7. Renderer sends "ready" signal
8. Agent Host initializes Copilot SDK connection

### 4.5 Event/Disposable Lifecycle (Phase 1, Week 2)

Every service, widget, and subscription must follow the Disposable pattern.

- `IDisposable` interface with `dispose()` method
- `Disposable` base class with `_register()` helper for tracking child disposables
- `DisposableStore` for managing groups of disposables
- `Event<T>` / `Emitter<T>` for typed pub/sub (following VS Code exactly)
- All event listeners returned as `IDisposable`

---

## 5. Risk Items

### Phase 0-1 Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Electron version incompatibility with better-sqlite3 native module | Medium | Medium | Pin Electron + better-sqlite3 versions. Use electron-rebuild. Test native module loading early in Phase 0. |
| DI system complexity slows development | Low | Medium | Keep DI simple -- no lazy loading or async resolution in v1. Copy VS Code's pattern closely. |
| electron-vite HMR issues with multi-process | Medium | Low | Fall back to manual restart for Agent Host. HMR primarily for Renderer. |

### Phase 2 Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Copilot SDK API instability** (Technical Preview) | High | High | Abstract behind ICopilotSDK. Write integration tests against SDK. Pin SDK version. Maintain changelog watch. Build a mock SDK implementation for development/testing. |
| Copilot CLI server startup reliability | Medium | High | Implement retry logic with exponential backoff. Clear error messaging to user. Guided setup wizard. |
| Streaming event format changes in SDK | Medium | Medium | Normalize SDK events into internal AgentEvent type. Only the ICopilotSDK adapter touches raw SDK types. |
| Permission interception may not be supported cleanly by SDK | Medium | High | Investigate SDK's tool execution hooks early (Week 4). If SDK does not support pre-execution hooks, wrap each tool registration with a permission-checking proxy. |

### Phase 3 Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Dependency on MCP ecosystem quality** — community servers may be unmaintained, buggy, or have breaking changes | High | Medium | Surface community ratings and last-updated dates in the registry browser. Provide clear error messaging when servers fail. Document recommended servers for key use cases. CLI tools (`mgc`, `gh`) serve as reliable fallback for critical services. |
| MCP Registry API stability or availability | Medium | Medium | Cache registry data locally. Graceful fallback to manual configuration if registry is unavailable. |
| Remote MCP server OAuth complexity across partners | Medium | Medium | Implement OAuth flow incrementally, starting with one partner. Reuse token management from `ISecureStorageService`. |
| MCP protocol edge cases (sampling, elicitation, dynamic tool updates) | Medium | Medium | Implement core protocol first (tools only). Add sampling, elicitation, resources incrementally. |
| MCP server credential management complexity | Medium | Medium | Start with env var injection for stdio. Add OAuth flow for HTTP servers incrementally. |
| CLI tool detection unreliable across platforms | Medium | Low | Use `which`/`where` commands. Fallback to common install paths. Let user manually specify path. |

### Phase 4 Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Document export quality (Markdown to DOCX) | Medium | Medium | Use pandoc CLI (superior quality) with fallback to docx library. Test with representative documents early. |
| Context window management for long conversations | Medium | High | Implement auto-compaction early. Track token counts. Use summarization to compress old context. |
| Skill format compatibility (Claude vs GH Copilot conventions) | Low | Low | Support both directory conventions. Normalize internally. |

### Phase 5 Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| macOS notarization failures | Medium | Medium | Test signing early (Phase 0). Use CI for signing. Keep entitlements minimal. |
| Auto-update reliability | Medium | Medium | Test update flow with staging channel before public release. |
| Performance with many MCP servers connected | Medium | Medium | Lazy-connect servers (only when tools are needed). Resource limits per server process. |

---

## 6. Estimated Team Structure

### Core Team (3-4 engineers)

| Role | Count | Responsibilities | Phase Focus |
|------|-------|------------------|-------------|
| **Platform/Infra Engineer** | 1 | DI system, IPC, multi-process architecture, storage, auth, packaging, CI/CD, auto-update | Phases 0-1 lead, Phase 5 |
| **Agent/AI Engineer** | 1 | Copilot SDK integration, agent service, permission service, memory service, tool registry, skills, hooks | Phase 2 lead, Phase 4 |
| **Connectors Engineer** | 1 | MCP Manager, MCP client implementation, registry integration, remote MCP server support (Streamable HTTP + OAuth), CLI detection, connector registry | Phase 3 lead |
| **UI/UX Engineer** | 1 | Workbench shell, chat panel, settings panel, tool activity panel, permission dialogs, onboarding, accessibility | Phases 1-5 (continuous) |

### Supporting Roles (part-time or shared)

| Role | Involvement | Responsibilities |
|------|-------------|------------------|
| **Product/Design** | Part-time | UX design for chat, settings, onboarding, permission prompts. Interaction design for tool call visualization. |
| **QA** | Phase 4-5 | E2E test authoring, cross-platform testing, accessibility audit |
| **DevOps** | Phase 0, 5 | CI/CD setup, code signing infrastructure, release automation |

### Work Distribution by Phase

- **Phase 0:** Platform Engineer (lead) + UI Engineer (assist)
- **Phase 1:** Platform Engineer (DI, IPC, auth, storage) + UI Engineer (workbench shell, theming)
- **Phase 2:** Agent Engineer (SDK, agent service, permissions) + UI Engineer (chat panel, permission UI)
- **Phase 3:** Connectors Engineer (MCP Manager, registry integration, remote MCP support) + UI Engineer (connector settings)
- **Phase 4:** Agent Engineer (memory, skills, hooks) + Connectors Engineer (CLI guides, tool bridge polish) + UI Engineer (document preview, tool activity)
- **Phase 5:** All engineers (testing, polish, packaging)

---

## 7. Tech Stack Setup

### Step-by-step monorepo scaffolding

```bash
# 1. Initialize monorepo
mkdir gho-work && cd gho-work
pnpm init
# Add pnpm-workspace.yaml with packages/* and apps/*

# 2. Add Turborepo
pnpm add -Dw turbo
# Create turbo.json with build, dev, test, lint pipelines

# 3. Create packages
mkdir -p packages/{base,platform,agent,connectors,ui,electron}
mkdir -p apps/desktop
mkdir -p cli-guides/{mgc,work-iq,gh,pandoc}
mkdir -p skills/{draft-email,summarize-doc,meeting-prep}
mkdir -p tests/{unit,integration,e2e}
mkdir -p docs

# 4. Initialize each package with package.json and tsconfig.json
# Each package has:
#   - package.json (name: @gho-work/<name>, main, types, scripts)
#   - tsconfig.json (extends root, references peer packages)
#   - src/index.ts (barrel export)

# 5. Root configuration
# tsconfig.base.json - shared compiler options (strict, ES2022, moduleResolution: bundler)
# .eslintrc.cjs - flat config with TypeScript rules
# .prettierrc - consistent formatting
# vitest.config.ts - workspace-level test config
# playwright.config.ts - E2E targeting Electron

# 6. Electron + Vite setup
# apps/desktop/electron-vite.config.ts
# apps/desktop/src/main/index.ts (Main process)
# apps/desktop/src/preload/index.ts (Preload script)
# apps/desktop/src/renderer/index.html + index.ts (Renderer)

# 7. electron-builder configuration
# apps/desktop/electron-builder.yml
# - macOS: dmg, target: [dmg, zip], signing identity
# - Windows: nsis, signing
# - Linux: AppImage (stretch)

# 8. GitHub Actions
# .github/workflows/ci.yml - lint, typecheck, test on PR
# .github/workflows/build.yml - build + package on main push
# .github/workflows/release.yml - build, sign, publish to GH Releases
```

### Key package.json dependencies

```
Root devDependencies:
  turbo, typescript, eslint, prettier, vitest, playwright,
  changesets/cli, changesets/changelog-github

packages/base: (no runtime deps)

packages/platform:
  better-sqlite3, zod, electron (devDep - types only)

packages/agent:
  @github/copilot-cli-sdk, zod

packages/connectors:
  @modelcontextprotocol/sdk, zod

packages/ui:
  marked (or remark), monaco-editor, xterm.js

apps/desktop:
  electron, electron-vite, electron-builder,
  mammoth, docx, exceljs, papaparse, date-fns
```

### CI/CD Pipeline

**PR checks (ci.yml):**
1. `pnpm install --frozen-lockfile`
2. `turbo lint` (ESLint)
3. `turbo typecheck` (tsc --noEmit)
4. `turbo test` (Vitest unit tests)
5. `turbo build` (verify all packages build)

**Build (build.yml, on main push):**
1. All PR checks
2. `electron-vite build`
3. `electron-builder --mac --win` (unsigned, for CI verification)
4. Upload artifacts

**Release (release.yml, on tag push):**
1. All PR checks
2. `electron-vite build`
3. `electron-builder --mac --win` (signed, notarized)
4. Publish to GitHub Releases
5. Changesets publish

---

## 8. Testing Strategy

### Unit Tests (Vitest, from Phase 1)

| Package | What to Test | Approach |
|---------|-------------|----------|
| `base` | Utilities, data structures, Event/Emitter, Disposable, DI container | Pure unit tests, no mocks needed |
| `platform` | Storage service (SQLite queries), auth service (token handling), file service | In-memory SQLite for storage tests. Mock Electron APIs. |
| `agent` | Permission rule matching, tool registry CRUD, memory file parsing, context injection, task queue logic | Mock ICopilotSDK. Test permission glob matching extensively. |
| `connectors` | Connector config validation, MCP message serialization, CLI detection logic | Mock child_process. Test MCP protocol messages with fixtures. |
| `ui` | Widget rendering, event handling, theme application | jsdom or happy-dom for DOM tests. Test widget lifecycle (create, update, dispose). |

**Coverage target:** 80% line coverage for `base`, `platform`, `agent`, `connectors`. 60% for `ui` (DOM testing has diminishing returns).

### Integration Tests (Vitest + real dependencies, from Phase 2)

| Test Scope | What It Validates |
|-----------|-------------------|
| DI + IPC round-trip | Service in Agent Host process responds to Renderer proxy call |
| Auth flow | OAuth PKCE flow with mock GitHub server (local HTTP) |
| SDK session lifecycle | Create session, register tool, send message, receive events (requires mock or real Copilot CLI) |
| MCP client <-> server | Connect to a test MCP server (stdio), list tools, call tool, get result |
| Storage round-trip | Write conversation to SQLite, read back, verify integrity |
| Permission enforcement | Tool call intercepted, rule evaluated, decision recorded |

**Mock Copilot SDK:** Build a `MockCopilotSDK` implementing `ICopilotSDK` that returns deterministic responses. Used for all tests that do not specifically test real SDK behavior.

### E2E Tests (Playwright, Phase 4-5)

| Test Scenario | Steps |
|--------------|-------|
| **Auth flow** | Launch app -> click sign in -> complete OAuth (mock server) -> verify user shown -> verify token persisted |
| **Basic chat** | Sign in -> type prompt -> verify streaming response -> verify message persisted |
| **Tool execution with approval** | Sign in -> request file read -> verify permission dialog -> approve -> verify result shown |
| **Tool execution denied** | Sign in -> request shell command -> deny -> verify denial shown |
| **Connector setup** | Settings -> add custom MCP server -> test connection -> verify tools listed |
| **Skill execution** | Type /draft-email -> verify skill loaded -> verify agent uses email context |
| **App restart** | Sign in -> create conversation -> quit app -> relaunch -> verify conversation restored |
| **Model switching** | Mid-conversation -> switch model -> verify next response uses new model |

**E2E infrastructure:**
- Playwright's Electron support (`_electron.launch()`)
- Test MCP server (simple stdio server with 2-3 tools)
- Mock Copilot CLI server (returns canned responses)
- Fixture workspace with CLAUDE.md and test files

### Testing Pyramid

```
         /\
        /  \     E2E (Playwright): 15-20 tests
       /    \    Critical user journeys only
      /------\
     /        \   Integration: 30-50 tests
    /          \  Cross-boundary (IPC, SDK, MCP, SQLite)
   /------------\
  /              \ Unit: 200+ tests
 /                \ Pure logic, fast, isolated
/------------------\
```

---

## 9. Key Interfaces to Define First

The interfaces below form the contract between layers. They should be defined in Phase 1 (Week 2) before any implementation begins. Each interface lives in its own file within the appropriate package.

**Priority order (define in this sequence):**

1. **`IDisposable` + `Event<T>` + `Emitter<T>`** (`packages/base/src/lifecycle.ts`)
   - Everything depends on these. Define first.

2. **DI primitives** (`packages/base/src/di/`)
   - `createServiceIdentifier<T>()`, `ServiceCollection`, `InstantiationService`

3. **`IIPCService`** (`packages/platform/src/ipc/IIPCService.ts`)
   - Typed channel definitions for all cross-process messages
   - Includes: AgentRequest, AgentEvent, PermissionRequest, PermissionResponse, ConnectorStatus, ToolCallEvent

4. **`IAuthService`** (`packages/platform/src/auth/IAuthService.ts`)
   - Phase 2 depends on auth for SDK initialization

5. **`IStorageService` + `ISecureStorageService`** (`packages/platform/src/storage/`)
   - Phase 2+ depends on persistence

6. **`IFileService`** (`packages/platform/src/files/IFileService.ts`)
   - Memory service and workspace management depend on this

7. **`ICopilotSDK` + `IAgentSession`** (`packages/agent/src/sdk/ICopilotSDK.ts`)
   - The central abstraction over the GH Copilot SDK. Must be defined before any agent work.

8. **`IToolRegistry`** (`packages/agent/src/tools/IToolRegistry.ts`)
   - Bridge between connectors and agent. Both sides code against this interface.

9. **`IPermissionService`** (`packages/agent/src/permissions/IPermissionService.ts`)
   - Intercepts all tool calls. Must be defined before agent loop implementation.

10. **`IAgentService`** (`packages/agent/src/agent/IAgentService.ts`)
    - The top-level orchestration service. Depends on all of the above.

11. **`IMCPClientManager`** (`packages/connectors/src/mcp/IMCPClientManager.ts`)
    - MCP server lifecycle and tool routing.

12. **`IConnectorRegistry`** (`packages/connectors/src/registry/IConnectorRegistry.ts`)
    - Persistence and configuration of connectors.

13. **`IMemoryService`** (`packages/agent/src/memory/IMemoryService.ts`)
    - Context loading for agent sessions.

---

## Appendix: File Layout Reference

```
gho-work/
  pnpm-workspace.yaml
  turbo.json
  tsconfig.base.json
  package.json
  .eslintrc.cjs
  .prettierrc
  vitest.config.ts
  playwright.config.ts
  .github/
    workflows/
      ci.yml
      build.yml
      release.yml
  packages/
    base/
      src/
        lifecycle.ts          # IDisposable, Event<T>, Emitter<T>, DisposableStore
        di/
          serviceIdentifier.ts
          serviceCollection.ts
          instantiationService.ts
        types/                # Shared type definitions (data models from PRD section 7)
        utils/                # Utility functions
    platform/
      src/
        ipc/
          IIPCService.ts
          channels.ts         # Typed channel definitions
          mainIPC.ts          # Main process implementation
          rendererIPC.ts      # Renderer proxy implementation
        auth/
          IAuthService.ts
          authService.ts      # GitHub OAuth PKCE implementation
        storage/
          IStorageService.ts
          ISecureStorageService.ts
          sqliteService.ts
          secureStorageService.ts
        files/
          IFileService.ts
          fileService.ts
    agent/
      src/
        sdk/
          ICopilotSDK.ts
          copilotSDK.ts       # Wraps @github/copilot-cli-sdk
          mockCopilotSDK.ts   # For testing
        agent/
          IAgentService.ts
          agentService.ts
        tools/
          IToolRegistry.ts
          toolRegistry.ts
        permissions/
          IPermissionService.ts
          permissionService.ts
        memory/
          IMemoryService.ts
          memoryService.ts
        skills/
          skillLoader.ts
          hookRunner.ts
    connectors/
      src/
        mcp/
          IMCPClientManager.ts
          mcpClientManager.ts
          mcpClient.ts        # Single MCP server connection
        registry/
          IConnectorRegistry.ts
          connectorRegistry.ts
        cli/
          cliDetector.ts      # Detect installed CLI tools
    ui/
      src/
        base/
          widget.ts           # Base Widget class
          splitView.ts
          listView.ts
        workbench/
          workbench.ts        # Top-level layout
          sidebar.ts
          statusBar.ts
        chat/
          chatPanel.ts
          messageRenderer.ts
          toolCallCard.ts
          permissionDialog.ts
        settings/
          settingsPanel.ts
          connectorPanel.ts
        activity/
          toolActivityPanel.ts
        theme/
          tokens.css          # CSS custom properties
          light.css
          dark.css
    electron/
      src/
        main.ts               # Electron Main process entry
        preload.ts            # contextBridge
        windowManager.ts
        tray.ts
        autoUpdate.ts
  apps/
    desktop/
      electron-vite.config.ts
      electron-builder.yml
      src/
        main/index.ts        # Imports from packages/electron
        preload/index.ts
        renderer/
          index.html
          index.ts            # Bootstraps packages/ui workbench
  cli-guides/
    mgc/README.md
    work-iq/README.md
    gh/README.md
    pandoc/README.md
  skills/
    draft-email/SKILL.md
    summarize-doc/SKILL.md
    meeting-prep/SKILL.md
  docs/
    PRD.md
    IMPLEMENTATION_PLAN.md
    ARCHITECTURE.md
  tests/
    e2e/
      auth.spec.ts
      chat.spec.ts
      connectors.spec.ts
    fixtures/
      mock-mcp-server/
      mock-copilot-server/
      test-workspace/
```
