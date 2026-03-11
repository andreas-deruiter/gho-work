# Phase 2: Agent Integration — Design Spec

**Date:** 2026-03-11
**Phase:** 2 of 6
**Status:** Approved
**Based on:** PRD v0.2, Implementation Plan v0.1

---

## 1. Overview

Phase 2 connects the Copilot SDK to the existing multi-process architecture, builds the chat UI for streaming output, and persists conversations to SQLite.

**End state:** A user types a prompt, the Copilot SDK processes it in the Agent Host, tools execute natively through the SDK, and streaming output appears in the chat UI. Conversations persist across restarts.

---

## 2. Key Design Decisions

### 2.1 Native SDK Tool Execution

The SDK handles all tool execution natively. We do not wrap, intercept, or re-register tools. The SDK's built-in tools (file read/write, bash, git, web, etc.) execute as-is. Permission handling is deferred to a later phase.

### 2.2 MCP Servers via SDK's mcpServers Config

MCP servers are passed directly to the SDK session via the `mcpServers` config option. The SDK manages MCP server connections, tool discovery, and tool execution. Our `IMCPClientManager` (Phase 3) provides the server configs; the SDK handles the protocol.

### 2.3 No Built-in Tool Re-wrapping

SDK built-in tools execute through the SDK's native handlers. We do not use `excludedTools` or `defineTool()` to intercept them. This keeps Phase 2 lean and avoids reimplementing behavior the SDK already handles.

---

## 3. Architecture

### 3.1 Process Topology

```
Agent Host (utility process)
├── CopilotClient          — manages CLI server lifecycle (JSON-RPC over stdio)
└── AgentServiceImpl       — creates sessions, streams events to renderer
```

### 3.2 Data Flow: User Message to Response

```
Renderer                          Agent Host                    Copilot CLI Server
   │                                  │                              │
   │── agent:send-message ──────────► │                              │
   │   {conversationId, content,      │                              │
   │    model}                        │                              │
   │                                  │── createSession() ─────────► │
   │                                  │   {model, mcpServers,        │
   │                                  │    systemMessage, streaming}  │
   │                                  │                              │
   │                                  │── session.send({prompt}) ──► │
   │                                  │                              │
   │                                  │◄── assistant.message_delta ──│
   │◄── agent:event {text_delta} ─────│                              │
   │                                  │                              │
   │                                  │◄── tool call (SDK native) ───│
   │◄── agent:event {tool_call_start}─│                              │
   │                                  │                              │
   │                                  │   (SDK executes tool natively)│
   │                                  │                              │
   │◄── agent:event {tool_call_result}│                              │
   │                                  │◄── session.idle ─────────────│
   │◄── agent:event {done} ──────────│                              │
```

---

## 4. Migration from Phase 1

Phase 2 introduces breaking changes to existing interfaces and restructures the `packages/agent` file layout. This section documents the delta.

### 4.1 Interface Changes

| Interface | Phase 1 (current) | Phase 2 (new) | Nature of change |
|-----------|-------------------|---------------|-----------------|
| `ICopilotSDK` | `createSession(context: AgentContext): Promise<string>`, `sendMessage(sessionId, content): AsyncIterable<AgentEvent>`, `cancelSession()`, `dispose()` | `start()`, `stop()`, `createSession(config: SessionConfig): Promise<ISDKSession>`, `resumeSession()`, `listSessions()`, `deleteSession()`, `ping()` | **Breaking rewrite.** The flat API (session ID strings, SDK manages messaging) is replaced with an `ISDKSession` object model that matches the real `@github/copilot-sdk` API. |
| `IAgentService` | `executeTask(prompt, context): AsyncIterable<AgentEvent>`, `cancelTask(taskId)` | Same + `getActiveTaskId(): string \| null` | **Additive.** New method. |
| `IMCPManager` | Defined in `interfaces.ts` | Unchanged for Phase 2 (Phase 3 will expand) | No change. |

### 4.2 File Layout Migration

| Phase 1 (current) | Phase 2 (new) | Action |
|-------------------|---------------|--------|
| `packages/agent/src/interfaces.ts` | Split into `common/agent.ts`, `common/copilotSDK.ts`, `common/conversation.ts`, `common/types.ts` | Delete `interfaces.ts`. The `IMCPManager` interface moves to `common/types.ts` temporarily (Phase 3 moves it to `packages/connectors`). |
| `packages/agent/src/mock-agent.ts` | `node/mockCopilotSDK.ts` | Rewrite to implement the new `ICopilotSDK` + `ISDKSession` interfaces. Used for testing and offline development. |
| `packages/agent/src/index.ts` | Updated barrel re-exporting `common/*` and `node/*` | Rewrite to match new structure. |

### 4.3 Schema Alignment

The spec's Section 7.1 schema descriptions must match the actual DDL in `workspaceSchema.ts`. Corrected mapping:

| Spec description | Actual DDL | Resolution |
|-----------------|-----------|------------|
| `conversations.workspace_id` | Not in DDL (workspace is implicit — per-workspace DB) | Remove from spec |
| `tool_calls.permission` | `permission_rule_id TEXT` | Not used in Phase 2 (permission deferred). Column remains for future use. |
| `tool_calls.timestamp` | `created_at INTEGER`, `completed_at INTEGER` | Use existing column names |
| `messages.timestamp` | `created_at INTEGER` | Use existing column name |
| `messages.tool_calls` (in TS type) | `tool_call_id TEXT` (FK in messages table) | Messages reference tool calls via `tool_call_id`, not embedded array |

**No migration needed for Phase 2.** The existing schema is sufficient. Permission-related columns will be utilized in a later phase when the permission system is implemented.

---

## 5. Service Interfaces

### 5.1 ICopilotSDK

Thin wrapper around `CopilotClient` from `@github/copilot-sdk`. **Breaking rewrite of Phase 1 interface** (see Section 4.1).

```typescript
// common/copilotSDK.ts — interface definition
interface ICopilotSDK {
  start(): Promise<void>;
  stop(): Promise<void>;
  createSession(config: SessionConfig): Promise<ISDKSession>;
  resumeSession(sessionId: string): Promise<ISDKSession>;
  listSessions(): Promise<SessionMetadata[]>;
  deleteSession(sessionId: string): Promise<void>;
  ping(): Promise<string>;
}

interface ISDKSession {
  readonly sessionId: string;
  send(options: SendOptions): Promise<string>;
  sendAndWait(options: SendOptions, timeout?: number): Promise<SDKMessage>;
  abort(): Promise<void>;
  on(event: string, handler: (event: SessionEvent) => void): () => void;
  on(handler: (event: SessionEvent) => void): () => void;
  getMessages(): Promise<SDKMessage[]>;
  disconnect(): Promise<void>;
}

interface SessionConfig {
  model: string;
  sessionId?: string;
  systemMessage?: { content: string };
  mcpServers?: MCPServerConfig[];
  streaming?: boolean;
}

interface SendOptions {
  prompt: string;
  attachments?: Array<{ type: 'file'; path: string; displayName?: string }>;
  mode?: 'enqueue' | 'immediate';
}
```

### 5.2 IAgentService

Orchestrates task execution, context injection, and event bridging. **Additive change** — adds `getActiveTaskId()`.

```typescript
// common/agent.ts
interface IAgentService {
  executeTask(prompt: string, context: AgentContext): AsyncIterable<AgentEvent>;
  cancelTask(taskId: string): void;
  getActiveTaskId(): string | null;
}
```

### 5.3 IConversationService (new)

Encapsulates conversation persistence to avoid scattering SQLite calls across services.

```typescript
// common/conversation.ts
interface IConversationService {
  listConversations(): Conversation[];
  getConversation(id: string): Conversation | undefined;
  createConversation(model: string): Conversation;
  renameConversation(id: string, title: string): void;
  deleteConversation(id: string): void;
  archiveConversation(id: string): void;
  addMessage(conversationId: string, message: Omit<Message, 'id'>): Message;
  getMessages(conversationId: string): Message[];
  addToolCall(messageId: string, conversationId: string, toolCall: Omit<ToolCall, 'id'>): ToolCall;
  updateToolCall(id: string, update: Partial<Pick<ToolCall, 'result' | 'status' | 'durationMs' | 'permission'>>): void;
  getToolCalls(conversationId: string): ToolCall[];
}
```

### 5.4 Context Injection (Phase 2 — without IMemoryService)

`IMemoryService` is a Phase 4 deliverable. In Phase 2, context injection is handled directly by `AgentServiceImpl`:

1. Read `CLAUDE.md` from workspace root (if exists) via `fs.readFile()`
2. Read `.github/copilot-instructions.md` from workspace root (if exists)
3. Concatenate into `systemMessage.content` for the SDK session

When Phase 4 introduces `IMemoryService`, it will replace this direct read with a proper service that also handles global memory, auto-compaction, and cross-workspace context.

---

## 6. Event Mapping

SDK events to our AgentEvent discriminated union:

| SDK Event | AgentEvent type | Data |
|-----------|----------------|------|
| `assistant.message_delta` | `text_delta` | `{ content: string }` |
| `assistant.message` | `text` | `{ content: string }` |
| `assistant.reasoning_delta` | `thinking` | `{ content: string }` |
| `tool.execution_start` | `tool_call_start` | `{ toolCall: ToolCallPartial }` |
| `tool.execution_complete` | `tool_call_result` | `{ toolCallId, result }` |
| `session.idle` | `done` | `{ messageId: string }` |
| `session.error` | `error` | `{ error: string }` |

---

## 7. IPC Channel Additions

Existing channels (Phase 1): `AGENT_SEND_MESSAGE`, `AGENT_CANCEL`, `AGENT_EVENT`, `CONVERSATION_LIST`, `CONVERSATION_CREATE`, `AUTH_LOGIN`, `AUTH_LOGOUT`, `AUTH_STATE`, `AUTH_STATE_CHANGED`, `STORAGE_GET`, `STORAGE_SET`, `PORT_AGENT_HOST`.

New channels for Phase 2 (added to `packages/platform/src/ipc/common/ipc.ts`):

```typescript
// Add to IPC_CHANNELS:
CONVERSATION_GET: 'conversation:get',        // Renderer -> Main
CONVERSATION_DELETE: 'conversation:delete',   // Renderer -> Main
CONVERSATION_RENAME: 'conversation:rename',   // Renderer -> Main
MODEL_LIST: 'model:list',                    // Renderer -> Agent Host
MODEL_SELECT: 'model:select',               // Renderer -> Agent Host
```

Add `CONVERSATION_GET`, `CONVERSATION_DELETE`, `CONVERSATION_RENAME`, `MODEL_LIST`, `MODEL_SELECT` to preload `ALLOWED_INVOKE_CHANNELS`.

---

## 8. Conversation Persistence

### 8.1 Schema (workspace SQLite)

Tables already defined in `workspaceSchema.ts` (Phase 1 migration 0). Existing DDL:

- `conversations`: id, title, model, status, metadata, created_at, updated_at (no workspace_id — implicit in per-workspace DB)
- `messages`: id, conversation_id, role, content, tool_call_id, tokens_in, tokens_out, created_at
- `tool_calls`: id, message_id, conversation_id, tool_name, server_name, arguments, result, error, status, permission_rule_id, duration_ms, created_at, completed_at

### 8.2 Persistence Points

| Event | DB Action |
|-------|-----------|
| User sends message | INSERT message (role='user', created_at) |
| Assistant message complete | INSERT message (role='assistant', created_at) |
| Tool execution starts | INSERT tool_call (status='pending', created_at) |
| Tool execution completes | UPDATE tool_call (result, status='completed'/'failed', duration_ms, completed_at) |
| First assistant response | UPDATE conversation.title (auto-generated) |

### 8.3 Session Restore

On selecting a conversation from the list:
1. Load messages + tool calls from SQLite via `IConversationService`
2. Render in ChatPanel
3. Create new SDK session via `client.resumeSession(conversationId)`
4. If resume fails (session expired), create fresh session — history is display-only

---

## 9. Chat UI Enhancements

### 8.1 New Widgets

| Widget | File | Purpose |
|--------|------|---------|
| `ConversationListPanel` | `conversationList.ts` | Sidebar panel with conversation history |
| `ModelSelector` | `modelSelector.ts` | Dropdown in header for model switching |
| `SlashCommandAutocomplete` | `slashCommandAutocomplete.ts` | Popup on `/` keypress |
| `FileDropHandler` | `fileDrop.ts` | Drag-and-drop file attachment |

### 8.2 ChatPanel Enhancements

- **Markdown rendering**: Replace basic regex with `marked` library + `DOMPurify` for XSS sanitization (marked's built-in `sanitize` was removed in v2+). Direct DOM insertion via `h()` helper. Syntax highlighting for code blocks via lightweight library.
- **Cancel button**: "Stop generating" appears during agent work. Calls `session.abort()` via IPC.
- **Conversation switching**: Wire to ConversationListPanel selection events.

---

## 10. File Layout

```
packages/agent/src/
├── common/
│   ├── agent.ts                    # IAgentService interface + service identifier
│   ├── copilotSDK.ts               # ICopilotSDK, ISDKSession interfaces + service identifier
│   ├── conversation.ts             # IConversationService interface
│   └── types.ts                    # SessionConfig, SendOptions, IMCPManager (temp, moves Phase 3)
├── node/
│   ├── copilotSDKImpl.ts           # CopilotClient wrapper implementation
│   ├── mockCopilotSDK.ts           # Mock implementation (rewritten from Phase 1 mock-agent.ts)
│   ├── agentServiceImpl.ts         # AgentService: session creation, event bridging
│   ├── conversationServiceImpl.ts  # ConversationService: SQLite persistence
│   └── asyncQueue.ts               # AsyncIterable queue for event bridging
├── __tests__/
│   ├── agentService.test.ts
│   └── conversationService.test.ts
└── index.ts                        # Barrel: re-exports common/* and node/*

# Deleted files (Phase 1 → Phase 2 migration):
# - packages/agent/src/interfaces.ts → split into common/*.ts
# - packages/agent/src/mock-agent.ts → rewritten as node/mockCopilotSDK.ts

packages/ui/src/browser/
├── chatPanel.ts                    # Enhanced: markdown, cancel, conversation switching
├── conversationList.ts             # NEW: sidebar conversation list
├── slashCommandAutocomplete.ts     # NEW: autocomplete popup
├── modelSelector.ts                # NEW: model dropdown
└── fileDrop.ts                     # NEW: drag-and-drop file attachment

packages/platform/src/
├── ipc/common/ipc.ts               # Add conversation + model channels
└── storage/node/workspaceSchema.ts  # Verify/update conversation/message/toolcall tables

packages/electron/src/
├── agentHost/agentHostMain.ts       # Wire real SDK + services (replace mock)
└── main/mainProcess.ts              # Update IPC handlers for new channels
```

---

## 11. Dependencies

### 10.1 New npm Packages

| Package | Purpose | Size |
|---------|---------|------|
| `@github/copilot-sdk` | Copilot SDK client | TBD |
| `marked` | Markdown to HTML rendering | ~40KB |
| `dompurify` | HTML sanitization (XSS prevention for rendered markdown) | ~15KB |

### 10.2 Phase 1 Foundations Used

- DI system (ServiceCollection, InstantiationService)
- IPC infrastructure (IPC_CHANNELS, MessagePortProtocol, preload bridge)
- Event system (Emitter, Event)
- Disposable pattern
- SQLite storage (SqliteStorageService, migrations)
- Auth service (token for SDK authentication)
- Workbench shell (ActivityBar, Sidebar, StatusBar, ChatPanel)
- Widget base class + h() helper

---

## 12. Testing Strategy

### 11.1 Unit Tests

- **Conversation persistence**: save/load messages, save/load tool calls, auto-title generation
- **Event mapping**: each SDK event type maps correctly to AgentEvent

### 11.2 Integration Tests

- **Agent service end-to-end**: mock CopilotClient -> session creation -> tool call events -> response streamed

### 11.3 E2E Tests (Playwright)

- Full chat interaction: send message -> streaming response -> thinking indicator clears -> tool call card renders and collapses -> input re-enabled
- Conversation persistence: send message -> close app -> reopen -> conversation visible in list -> select -> messages displayed

---

## 13. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| SDK CLI server crash during tool execution | Lost tool state | SDK's `autoRestart: true`; our Agent Host crash recovery (Phase 1) |
| `marked` library XSS via malicious markdown | Security vulnerability | Use `DOMPurify` to sanitize all HTML output from `marked` before DOM insertion (`marked`'s built-in sanitize was removed in v2+) |
| SDK's native tool execution has no permission layer | Tools execute without user approval | Acceptable for Phase 2; permission system will be added in a later phase |
