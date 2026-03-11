# GHO Work - Product Requirements Document

**Version:** 0.2
**Status:** Draft for review
**Date:** 2026-03-11

---

## Table of Contents

1. [Executive Summary and Vision](#1-executive-summary-and-vision)
2. [Problem Statement](#2-problem-statement)
3. [Target Users and Personas](#3-target-users-and-personas)
4. [Scope](#4-scope)
5. [Product Capabilities](#5-product-capabilities)
6. [UX Design](#6-ux-design)
7. [Architecture and Technical Design](#7-architecture-and-technical-design)
8. [Data Models](#8-data-models)
9. [Authentication and Authorization Flows](#9-authentication-and-authorization-flows)
10. [Connector Strategy](#10-connector-strategy)
11. [Development Stack and Desired Skills](#11-development-stack-and-desired-skills)
12. [Key Design Decisions](#12-key-design-decisions)
13. [Open Questions](#13-open-questions)
14. [Competitive Analysis](#14-competitive-analysis)

---

## 1. Executive Summary and Vision

### 1.1 What is GHO Work?

GHO Work is an Electron-based desktop application that delivers agentic AI capabilities for office productivity, powered by the GitHub Copilot SDK's agent harness. It brings the autonomous, tool-using agent model (pioneered by tools like Claude Code and the Copilot CLI) to everyday office tasks: drafting documents, analyzing spreadsheets, managing email, preparing meetings, and orchestrating multi-step workflows across services.

### 1.2 Why GHO Work?

**The core thesis:** Microsoft 365 Copilot Wave 3 will dominate enterprise AI-assisted productivity, but its design is optimized for security, compliance, and IT governance -- creating friction that reduces productivity for individual users and smaller teams. GHO Work takes the opposite approach.

**Strategic positioning:**

- **M365 Copilot Wave 3** is enterprise-first: IT admins control which agents are available, which models are used, what data the AI can access. DLP policies, sensitivity labels, and audit requirements add latency to every AI interaction. Pricing starts at $15/user/month (Agent 365) and goes up to $99/user (Frontier Suite E7) -- on top of existing M365 licensing.

- **GHO Work** is client-centric: it runs on your machine, you control the permissions, and there is minimal overhead between you and the AI. It requires nothing beyond an existing GitHub Copilot subscription ($0-39/month, which millions of users already have).

**Key advantages:**
- **Zero incremental cost** for existing GH Copilot subscribers
- **No IT admin required** -- install and go
- **Multi-model access** (Claude, GPT, Gemini) through a single subscription
- **Local-first architecture** -- no GHO Work backend, no data leaves your machine except to LLM APIs and MCP servers you explicitly configure
- **Open extensibility** via MCP (Model Context Protocol) -- hundreds of community connectors already exist
- **Familiar to the large GH Copilot user base** (developers who also do office work)

### 1.3 Vision Statement

> The AI-powered office that runs on your machine, not in the cloud admin console.

### 1.4 Success Metrics

| Metric | Target (6 months post-launch) |
|--------|-------------------------------|
| Monthly active users | TBD |
| Tasks completed per session | > 3 |
| Time-to-value (install to first productive task) | < 10 minutes |
| Connector adoption (avg MCP servers per user) | > 2 |
| User retention (30-day) | > 40% |

---

## 2. Problem Statement

### 2.1 The Friction Problem with M365 Copilot Wave 3

M365 Copilot Wave 3 introduces "Copilot Cowork" -- multi-step, orchestrated AI workflows across Word, Excel, PowerPoint, and Outlook. While powerful, it is designed top-down for enterprise deployment:

1. **Enterprise-gated deployment**: IT admins control which agents are available, which models are used, and what data the AI can access
2. **Pricing barrier**: $15/user/month (Agent 365) to $99/user (Frontier Suite E7), on top of existing M365 licensing
3. **Compliance overhead**: DLP policies, sensitivity labels, and audit requirements add latency and friction to every AI interaction
4. **Vendor lock-in**: deeply tied to the Microsoft ecosystem; users who mix Google Workspace, Slack, Notion, Linear, etc. are underserved
5. **Limited model choice in practice**: while M365 Copilot supports multiple models, the enterprise admin controls availability

### 2.2 The Opportunity

- **Millions of users** already have GitHub Copilot subscriptions (Free through Enterprise tiers)
- Many of these users also do office-type work (documents, spreadsheets, project management, communication)
- Claude Code has proven that a client-centric, agentic approach with tool use delivers superior productivity for individuals
- **MCP (Model Context Protocol)** has created a universal standard for connecting AI to external systems -- hundreds of community-built MCP servers already exist
- **No desktop app** currently brings the "agentic AI assistant" model to general office tasks using the GH Copilot infrastructure

### 2.3 Core Insight

The same agentic architecture that makes Claude Code powerful for developers can make office work dramatically more productive -- and the GitHub Copilot SDK provides the agent harness (orchestration, built-in tools, shell execution), multi-model routing, and infrastructure to build it without managing separate API keys or billing.

---

## 3. Target Users and Personas

### 3.1 Primary: "The Developer Who Also Manages"

- Software engineer, tech lead, or engineering manager
- Already uses GitHub Copilot for code
- Also writes docs, manages projects, handles email, prepares reports
- Wants the same AI-powered workflow for non-code tasks
- Comfortable with agentic tools and permission models

### 3.2 Secondary: "The Power Knowledge Worker"

- Has a GitHub Copilot subscription (likely via organization)
- Works across multiple tools: Google Docs, Word Online, Slack, Teams, Jira, Notion, spreadsheets, email
- Tech-savvy but not necessarily a developer
- Frustrated by tool-switching overhead and repetitive tasks
- Values autonomy over IT-managed solutions

### 3.3 Tertiary: "The Startup Team"

- Small team (5-50 people) without enterprise M365 licensing
- Uses a mix of SaaS tools (Google Workspace, Microsoft 365, Slack, Teams, Linear, Notion)
- Needs AI assistance but cannot justify $15-99/user/month for M365 Copilot
- Already has GitHub org with Copilot Business ($19/user) for their developers

### 3.4 Anti-Personas (Out of Scope for v1)

- Large enterprise with strict compliance requirements (they need M365 Copilot)
- Users with no GitHub account or Copilot subscription
- Users who work exclusively within the Microsoft Office ecosystem and are satisfied with native Copilot

---

## 4. Scope

### 4.1 In Scope (v1.0)

**Core application:**
- Electron desktop app for macOS (primary) and Windows (secondary), Linux as stretch goal
- Chat-based primary interface with agentic task execution
- GitHub OAuth authentication with Copilot subscription verification
- Integration with GH Copilot SDK agent harness for model access, agent orchestration, and built-in tool execution (Claude Sonnet 4.5 default, multi-model routing)
- Multi-process architecture inspired by VS Code

**Agentic capabilities:**
- Agent orchestration via GH Copilot SDK harness (planning, tool invocation, iteration)
- SDK built-in tools: file read/write/edit, bash/PowerShell command execution, Git operations, web fetch/search, glob, grep
- Ability to use any CLI tool available on the user's machine (via shell execution)
- MCP client for connecting to any MCP server
- Subagent spawning for parallel task execution
- Task queue: users can submit tasks while the agent is busy
- Permissions model with user-controlled approval (allow once, allow always, deny)
- Memory system with project-level and global context files

**Built-in connectors and integrations:**
- Local filesystem operations (SDK built-in)
- Bash/PowerShell command execution (SDK built-in) — enables use of any CLI tool
- Git operations (SDK built-in)
- Web content fetching and search (SDK built-in)
- Google Drive / Google Workspace (MCP)
- Slack (MCP)
- Gmail (MCP)
- Google Calendar (MCP)
- Google Sheets (MCP)
- Microsoft 365 — OneDrive, Outlook, Teams, Excel Online, Outlook Calendar, SharePoint (via `mgc` CLI)
- Microsoft Work IQ — work context, semantic search across M365 data (via Work IQ CLI; MCP planned)
- GitHub (via `gh` CLI)
- Document conversion (via `pandoc` CLI)

**Office-specific features:**
- Document drafting and editing (Markdown-first, with export to DOCX/PDF)
- Spreadsheet/data analysis (CSV, Excel read via libraries)
- Email composition, summarization, and triage
- Meeting preparation (calendar + document context)
- Report generation from multiple data sources
- Multi-step workflow orchestration across connectors

**Skills and extensibility:**
- Pre-built skills for common office tasks (/draft-email, /summarize-doc, /meeting-prep)
- User-defined custom skills (Markdown-based definitions)
- GH Copilot Agent Skills compatibility (open standard)
- Hooks for lifecycle automation

### 4.2 Out of Scope (v1.0)

- Real-time collaborative editing (Google Docs-style multiplayer)
- Native OOXML editing (Word/Excel/PowerPoint native format editing in-app)
- Mobile applications (iOS, Android)
- Self-hosted or on-premises deployment
- Enterprise admin console or centralized management
- Custom model fine-tuning
- Billing or subscription management (relies on existing GH Copilot subscription)
- Offline mode (requires Copilot API connectivity)
- Connector marketplace with publishing/review workflow (v2)
- Cross-device sync service (v2 -- use Google Drive MCP or OneDrive via `mgc` CLI for now)

### 4.3 Key Scope Trade-offs

| Decision | Rationale |
|----------|-----------|
| Markdown-first (not native Office formats) | Native OOXML editing is a multi-year engineering effort and is Microsoft's moat. The value proposition is AI-assisted content creation, not format fidelity. Provide high-quality export to DOCX/PDF via libraries. |
| macOS-first | Electron is cross-platform, but focusing QA and polish on macOS first reduces scope. Target persona skews macOS. |
| Leverage ecosystem, not build MCP servers | v1 connects to existing MCP servers from the MCP Registry and Claude ecosystem (Google Workspace, Slack, etc.), leverages CLI tools for M365/GitHub/Work IQ, and provides manual config for custom servers. A full marketplace with publishing/review is v2. |
| No cloud backend | Core differentiator vs M365 Copilot. No server costs, no data residency concerns. Cross-device via existing cloud storage connectors. |

---

## 5. Product Capabilities

### 5.1 Agentic Task Execution

The core capability. Users provide natural language requests, and the agent autonomously decomposes them into steps, uses tools, and iterates until complete.

**Example flow:**
```
User: "Summarize last week's sales data from the spreadsheet and draft a
       message to the #sales channel with the highlights."

Agent:
  1. [Google Sheets or Excel Online MCP] Fetch the sales spreadsheet
  2. [Built-in] Analyze data, identify trends and highlights
  3. [Built-in] Draft summary message
  4. [Slack or Teams MCP] Post to #sales channel (awaits user approval)
```

**Key characteristics:**
- Agent orchestration powered by the GH Copilot SDK harness: plan -> execute tool -> observe result -> iterate
- SDK handles the core agent loop (planning, tool invocation, file edits, shell execution); GHO Work provides MCP integration, permissions UI, and office-specific context
- Subagent parallelism for independent subtasks (e.g., fetch data from two sources simultaneously)
- Built-in shell execution enables use of any CLI tool on the user's machine (e.g., `pandoc`, `jq`, `curl`, `git`)
- Real-time progress feedback in the UI (tool calls, intermediate results, thinking)
- Cancellation support at any point
- Error recovery with automatic retry and alternative approaches
- **Task queue**: Users can submit new tasks while the agent is busy. Tasks queue and execute sequentially. Queue status visible in UI (see Section 6.6).

### 5.2 Tool System

Three categories of tools available to the agent:

| Category | Source | Examples |
|----------|--------|----------|
| SDK Built-in | Provided by GH Copilot SDK agent harness | FileRead, FileWrite, FileEdit, Bash, PowerShell, Git, WebFetch, WebSearch, Glob, Grep |
| MCP Tools | Dynamically discovered from connected MCP servers | google-drive/listFiles, onedrive/listFiles, slack/postMessage, teams/postMessage, outlook/sendEmail |
| Agent Skills | Auto-loaded from `.claude/skills/`, `.github/skills/`, or `~/.claude/skills/` | /draft-email, /meeting-prep, /summarize-doc |

**Tool discovery UI:** Users can browse all available tools, see which MCP server provides each, enable/disable tools, and view tool execution history.

### 5.3 Permissions and Trust Model

Inspired by Claude Code's permission system, adapted for office tasks where actions (sending emails, posting to Slack or Teams) have real-world consequences.

**Permission levels (with keyboard shortcuts — see Section 6.5):**
- **Allow Once** (`Enter`): Approve this specific tool call
- **Allow Always** (`Shift+Enter`): Pre-approve this tool for this MCP server (persisted as a rule)
- **Deny** (`Esc`): Block this specific tool call
- **Deny Always** (`Shift+Esc`): Block this tool permanently (persisted as a rule)

**Permission scopes:**
- Per tool (e.g., always allow `google-drive/readFile` or `onedrive/readFile`, always prompt for `slack/postMessage` or `teams/postMessage`)
- Per MCP server (e.g., trust all Google Drive tools, trust all OneDrive tools)
- Global rules (e.g., never allow file deletion without approval)

**Audit log:** Every tool call, permission decision, and agent action is logged locally with timestamps. Users can review what the agent did and when.

**Sandboxing:** File write operations are scoped to configured allowed directories. Network access is limited to configured MCP servers and the Copilot API.

### 5.4 Memory and Context

**Project-level context (CLAUDE.md / .github/copilot-instructions.md):**
- Supports both `CLAUDE.md` (Claude convention) and `.github/copilot-instructions.md` (GitHub Copilot convention)
- Markdown files stored alongside project files
- Contains project-specific instructions, conventions, data source references
- Agent reads these at the start of every conversation in that workspace
- Example: "Sales data is in the Google Sheet at [URL]. The weekly report goes to #sales on Slack. Use formal tone for external communications."

**Global memory (~/.claude/):**
- User preferences and patterns learned across sessions
- Persisted across all workspaces

**Conversation history:**
- Full conversation history stored locally (SQLite)
- Searchable across sessions
- Auto-compaction for long conversations (summarize old context to stay within model limits)

### 5.5 Skills and Custom Commands

**Pre-built skills (v1):**
- `/draft-email` - Draft an email from a brief description, with context from recent conversations
- `/summarize-doc` - Summarize a document or set of documents
- `/meeting-prep` - Prepare for a meeting (pull calendar event, gather related docs, draft agenda)
- `/data-analysis` - Analyze a spreadsheet or CSV with natural language queries
- `/weekly-report` - Generate a weekly summary from multiple data sources

**User-defined skills:**
- Markdown-based skill definitions stored in `.claude/skills/` or `.github/skills/`
- YAML frontmatter for configuration (name, description, allowed-tools, auto-invocation rules)
- Support for dynamic context injection (shell command output embedded in skill)
- Compatible with both Claude and GH Copilot Agent Skills formats

**Hooks:**
- Lifecycle automation: pre-tool-call, post-tool-call, session-start, session-end
- Use cases: auto-format after document edits, notify Slack or Teams after report generation, log all file changes
- Configured via JSON in `.claude/settings.json` (hooks section)

### 5.6 Multi-Model Support

Available through the GH Copilot SDK:

| Model | Best For | Availability |
|-------|----------|--------------|
| Claude Sonnet 4.5 (default) | General tasks, balanced speed/quality | All tiers |
| Claude Opus 4.6 | Complex reasoning, multi-step analysis | Pro+ / Enterprise |
| GPT-5.x variants | Creative writing, certain analytical tasks | Pro+ / Enterprise |
| Gemini 3 Pro | Multimodal tasks, large context | Pro+ / Enterprise |
| Claude Haiku 4.5 | Fast, lightweight tasks | All tiers |

Users can switch models mid-session via `/model` command or the model selector dropdown in the main panel header. The agent can be configured to prefer specific models for specific task types.

**Copilot usage meter:** The status bar displays remaining premium requests for the user's Copilot tier. When approaching the limit, a warning indicator appears. When the limit is reached, a clear notification explains the situation and links to the GitHub Copilot plan comparison page. The Free tier serves as a natural on-ramp.

---

## 6. UX Design

> **Visual reference:** The [UX Tutorial Site](tutorial/index.html) contains pixel-perfect HTML/CSS mockups of every screen and flow described below. This section defines the structural UX; the tutorial provides the definitive visual spec.

### 6.1 UX Principles

1. **User in Control** — Every agent action requires explicit or pre-approved permission. Users can see, approve, deny, and audit everything.
2. **Progressive Disclosure** — Simple tasks are simple. Power features (custom skills, permission rules, hooks) reveal themselves as users grow.
3. **Desktop-Native Feel** — Keyboard-first, fast, responsive. Follows OS conventions for menus, shortcuts, window management, and notifications.
4. **Transparent Agent Work** — Tool calls, data access, and reasoning are always visible. No hidden actions. The tool activity panel shows the full audit trail.

### 6.2 Onboarding Flow

First-launch wizard. Target: install to first productive task in under 10 minutes. On subsequent launches, the app opens directly to the workbench with the last workspace.

| Step | Screen | Key Actions |
|------|--------|-------------|
| 1 | Welcome | Brand intro, value props. Single CTA: "Sign in with GitHub" |
| 2 | Auth waiting | Spinner while GitHub OAuth (PKCE) completes in system browser. Shows step progress (browser opened / authorize / verify) |
| 3 | Copilot verification | Shows user profile, Copilot tier badge, and available models by tier |
| 4 | CLI detection | Scans PATH for `gh`, `mgc`, `pandoc`, `az`, `gcloud`. Shows found (with version) vs missing (with install link). Skippable. |
| 5 | First connector | Grid of popular MCP servers (Google Drive, Slack, Gmail, Calendar, Jira, Notion) with "Add" buttons. Registry browser link. Skippable — CTA is "Start Using GHO Work" regardless. |

If the Copilot subscription check fails, show a clear error with a link to subscribe.

### 6.3 Workbench Layout

VS Code-inspired layout with four zones:

```
+-------+----------+-----------------------------------+
| Act.  | Sidebar  |          Main Panel               |
| Bar   | (240px)  |   (chat, document preview,        |
| (48px)|          |    settings)                      |
|       |          |                                   |
|       |          |                                   |
|       |          |                                   |
+-------+----------+-----------------------------------+
| Status Bar (full width, 24px)                        |
+------------------------------------------------------+
```

**Activity Bar** (leftmost, 48px wide, dark background):
- Icon buttons for switching sidebar content: Chat, Tool Activity, Connectors, Documents
- Settings icon anchored at the bottom
- Active view indicated with highlight

**Sidebar** (240px, resizable, collapsible via `Cmd+B`):
- Content changes based on Activity Bar selection
- **Chat** (default): New conversation button, search filter, conversation list sorted by recency. Right-click context menu: rename, archive, delete.
- **Tool Activity**: Live feed of tool calls with filter by server/status/time. Expandable detail per call. Full audit log viewer.
- **Connectors**: Configured MCP servers and CLIs with status indicators, enable/disable toggles, tool counts, add button.
- **Documents**: File tree of current workspace. Click to preview in main panel. Export actions (DOCX, PDF).

**Main Panel** (remaining width):
- Contains the active view: Chat (default), Document Preview, or Settings
- Own header with context-specific actions (conversation title, model selector dropdown)
- Supports split-view: chat on left, document preview on right (when agent creates/edits a document)

**Status Bar** (full width, 24px):
- Left: workspace path (clickable — opens workspace picker), connector count with status dot
- Right: active model name, agent state indicator (idle / working / queued), Copilot usage meter, user avatar

### 6.4 Chat Interface

The chat panel is the primary interaction surface.

**Message types:**
- **User message** — right-aligned, accent background. Supports multi-line input, file drag-and-drop attachments (shows file pills with name/size).
- **Assistant text** — left-aligned, renders Markdown (headings, lists, bold, code blocks, tables). Streams token-by-token.
- **Tool call card (completed)** — collapsible card, collapsed by default after completion. Shows: status icon, tool name, duration. Expand for: server, arguments (JSON), result, permission decision.
- **Tool call card (pending)** — highlighted border, approval buttons inline (Allow Once, Allow Always, Deny, Deny Always). Agent pauses until user responds.
- **Tool call card (failed)** — red accent. Expand for error message. Agent auto-attempts recovery.
- **Thinking indicator** — animated dots with label from agent's current step (e.g., "Analyzing spreadsheet data...").

**Chat input:**
- Auto-growing textarea. `Enter` to send, `Shift+Enter` for newline.
- Type `/` to open slash command autocomplete inline (lists skills + system commands like `/model`, `/clear`).
- File drag-and-drop onto input area to attach files.
- Cancel button appears during agent work ("Stop generating").

**Model selector:**
- Dropdown in the main panel header showing current model with status dot.
- Also accessible via `/model` slash command.

### 6.5 Permission Interaction

Permission prompts appear inline in the chat flow (not as modal dialogs) when the agent wants to execute a tool with no saved rule. The agent pauses until the user decides.

**Keyboard shortcuts for permission decisions:**
| Shortcut | Action |
|----------|--------|
| `Enter` | Allow Once |
| `Shift+Enter` | Allow Always (creates persistent rule) |
| `Esc` | Deny |
| `Shift+Esc` | Deny Always (creates persistent deny rule) |

**Shell command review:** Bash/PowerShell tool calls display the full command text and working directory for review before approval. These use a warning-colored header to draw attention.

**MCP elicitation:** When an MCP server sends an `elicitation/request`, GHO Work surfaces it as a modal dialog with the server's requested form fields. The user's response is routed back to the server.

**Permission rules management:** Settings > Permissions shows all saved rules (tool pattern, scope, decision, server name) with delete buttons and an "Add Rule Manually" option.

### 6.6 Task Queue

Users can submit new tasks while the agent is busy. Tasks queue and execute sequentially (or in parallel via subagents for independent subtasks within a single task).

**Task queue panel:**
- Accessible from the status bar ("2 tasks queued" indicator, expandable) or as an overlay panel.
- Shows: active task (with spinner, tool call count, elapsed time), queued tasks (numbered), completed tasks (with duration and tool count).
- Cancel button per task. Completed tasks link back to their conversation messages.

### 6.7 Workspace Management

**Workspace picker:** Shown on launch if no recent workspace, or via clicking the workspace path in the status bar.
- Recent workspaces list (name, path, last opened time)
- "Open Folder..." button for selecting a new workspace folder
- Each workspace has its own SQLite database, conversations, and permission rules

### 6.8 Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+B` | Toggle sidebar |
| `Cmd+N` | New conversation |
| `Cmd+K` | Quick command palette |
| `Cmd+,` | Open settings |
| `Cmd+1` through `Cmd+4` | Switch activity bar view (Chat, Tool Activity, Connectors, Documents) |
| `Cmd+L` | Focus chat input |
| `Esc` | Cancel current agent task |

### 6.9 Theming

Three theme modes: Light, Dark, System (follows OS preference). Default: System. CSS custom properties for all theme tokens. Configured in Settings > Appearance.

---

## 7. Architecture and Technical Design

### 7.1 High-Level Architecture

```
+------------------------------------------------------------------+
|                        GHO Work Desktop App                       |
|                                                                   |
|  +-------------------+    IPC    +----------------------------+  |
|  |  Main Process     |<-------->|  Renderer Process           |  |
|  |  - App lifecycle  |          |  - Custom DOM workbench     |  |
|  |  - Window mgmt    |          |  - Chat interface           |  |
|  |  - Native menus   |          |  - Document preview         |  |
|  |  - Tray           |          |  - Settings                 |  |
|  |  - Auto-update    |          |  - Permission prompts       |  |
|  +-------------------+          +----------------------------+  |
|           |                                |                     |
|           |  MessagePort                   |  MessagePort        |
|           |                                |                     |
|  +-------------------+          +----------------------------+  |
|  |  MCP Manager      |          |  Agent Host                 |  |
|  |  (SharedProcess)  |          |  - Copilot SDK harness      |  |
|  |  - MCP clients    |<-------->|  - Agent loop (SDK-driven)  |  |
|  |  - Server lifecycle|         |  - Tool execution           |  |
|  |  - Capability mgmt |         |  - Bash/PowerShell/CLI      |  |
|  +-------------------+          |  - Permission checking      |  |
|           |                     |  - Memory management        |  |
|           |  MCP Protocol       |  - Subagent coordination    |  |
|           |  (stdio / HTTP)                |  JSON-RPC           |
|           v                                v                     |
|  +-------------------+          +----------------------------+  |
|  |  MCP Servers       |         |  GH Copilot CLI Server      |  |
|  |  - Registry/       |         |  - Model inference          |  |
|  |    Community       |         |  - Multi-model routing      |  |
|  |  - Remote (HTTP)   |         |  - Streaming responses      |  |
|  |  - Local (stdio)   |         +----------------------------+  |
|  |  - Custom servers  |                                         |
|  +-------------------+                                          |
+------------------------------------------------------------------+
```

### 7.2 Process Model (VS Code-inspired)

| Process | VS Code Equivalent | GHO Work Role |
|---------|-------------------|---------------|
| Main Process | Main | App lifecycle, window management, native OS integration (tray, menus, notifications), auto-update |
| Renderer Process | Renderer (Workbench) | DOM-based workbench UI (VS Code-style): chat panel, tool activity, document preview, settings, permission prompts |
| Agent Host | Extension Host | Hosts the GH Copilot SDK agent harness. The SDK drives the agent loop (planning, tool invocation, shell execution, file operations). GHO Work adds MCP tool registration, permission enforcement, and memory/context injection. |
| MCP Manager | SharedProcess | MCP client lifecycle management, capability negotiation, reconnection, shared across windows |

**Why multi-process?**
- A misbehaving tool or MCP server cannot crash the UI
- Agent Host can be killed and restarted without losing UI state
- MCP Manager is shared across windows (like VS Code's SharedProcess)
- Renderer stays responsive during heavy agent work

### 7.3 Layered Code Organization

```
src/
  base/           -- Utilities, data structures, common types
                     No dependencies on other layers

  platform/       -- OS abstractions, IPC, storage, auth, crypto
                     Depends on: base/
                     Key: IFileService, IStorageService, IAuthService,
                          IIPCService, ICryptoService

  agent/          -- SDK harness wrapper, tool registration, permissions, memory
                     Depends on: base/, platform/
                     Key: IAgentService, ICopilotSDK, IToolRegistry,
                          IPermissionService, IMemoryService

  connectors/     -- MCP client management, registry integration, CLI detection
                     Depends on: base/, platform/
                     Key: IMCPClientManager, IConnectorRegistry

  workbench/      -- UI components, panels, views, layouts (VS Code-style DOM)
                     Depends on: base/, platform/ (via IPC, not direct)
                     Reuses VS Code patterns: custom widgets, Disposable lifecycle,
                     event-driven updates, CSS custom properties for theming
                     Key: ChatPanel, ToolActivityPanel, ConnectorPanel,
                          SettingsPanel, PermissionDialog

  app/            -- Application entry point, window management, lifecycle
                     Depends on: all layers
                     Key: main.ts, preload.ts, window management
```

**Layering rule (from VS Code):** Each layer can depend on layers below it, never above. `workbench/` communicates with `agent/` and `connectors/` only via IPC messages, never via direct imports.

### 7.4 Dependency Injection

Follow VS Code's constructor-based DI pattern:

```typescript
// Service interface definition
interface IAgentService {
  executeTask(prompt: string, context: AgentContext): AsyncIterable<AgentEvent>;
  cancelTask(taskId: string): void;
}

// Service identifier (decorator)
const IAgentService = createServiceIdentifier<IAgentService>('IAgentService');

// Implementation with injected dependencies
class AgentService implements IAgentService {
  constructor(
    @ICopilotSDK private readonly copilotSDK: ICopilotSDK,  // wraps SDK harness
    @IToolRegistry private readonly toolRegistry: IToolRegistry,
    @IPermissionService private readonly permissionService: IPermissionService,
    @IMemoryService private readonly memoryService: IMemoryService,
  ) {}

  async *executeTask(prompt: string, context: AgentContext): AsyncIterable<AgentEvent> {
    // Create SDK session, register MCP tools, inject context, stream events
  }
}
```

**Key services:**

| Service | Responsibility |
|---------|---------------|
| `ICopilotSDK` | Wraps the GH Copilot SDK agent harness. Creates sessions, configures models, manages SDK lifecycle. Provides the agent loop, built-in tools (file ops, bash/PowerShell, git, web), and streaming. |
| `IAgentService` | Orchestrates a task execution session. Injects context (memory files, conversation history), registers MCP tools with the SDK session, enforces permissions, streams events to the UI. |
| `IToolRegistry` | Unified registry of all available tools (SDK built-in + MCP + Agent Skills). Registers custom tools with the SDK harness. |
| `IPermissionService` | Enforces trust model. Intercepts SDK tool calls for approval. Persists allow/deny decisions. Surfaces UI prompts. |
| `IMemoryService` | Reads CLAUDE.md / .github/copilot-instructions.md, manages conversation history, provides context |
| `IMCPClientManager` | Creates/manages MCP client connections, handles lifecycle, capability negotiation |
| `IStorageService` | SQLite-backed persistence for conversations, settings, permissions |
| `IAuthService` | GitHub OAuth flow, token management, Copilot subscription verification |
| `IFileService` | Abstraction over local filesystem operations |

### 7.5 Agent Loop Design

The agent loop is powered by the GH Copilot SDK harness. The SDK handles the core orchestration cycle (planning, tool invocation, observation, iteration). GHO Work's role is to configure each session with the right context, tools, and permissions.

```
User Message
    |
    v
[GHO Work: Create SDK Session]
  - Load context: CLAUDE.md / copilot-instructions.md, conversation history
  - Register MCP tools with SDK session (from IToolRegistry)
  - Configure model, max iterations, custom instructions
    |
    v
[SDK Agent Harness: Autonomous Loop]
    |
    +-- Plan --> SDK selects next action
    |
    +-- SDK Built-in Tool Call (file edit, bash, git, web) --> [GHO Work: Check Permissions]
    |       |                                                          |
    |    Allowed --> SDK executes directly                           Denied --> SDK notified
    |
    +-- MCP Tool Call --> [GHO Work: Check Permissions]
    |       |                                                          |
    |    Allowed --> GHO Work routes to MCP Manager --> Result back to SDK
    |                                                               Denied --> SDK notified
    |
    +-- Text --> Stream to GHO Work UI
    |
    +-- Done --> [Return Final Response to UI]
```

**What the SDK harness provides:**
- Agent loop orchestration (plan → execute → observe → iterate)
- Built-in tools: file read/write/edit, bash/PowerShell execution, Git operations, web fetch/search, glob, grep
- Model inference with multi-model routing
- Streaming responses
- Error recovery and retry logic
- Max iteration limits

**What GHO Work adds on top:**
- MCP tool registration: discovers tools from connected MCP servers and registers them as custom tools with the SDK session
- Permission interception: hooks into the SDK's tool execution to enforce the trust model before any tool runs
- Context injection: loads memory files, conversation history, and workspace metadata into each SDK session
- UI integration: streams SDK events (tool calls, text, thinking) to the workbench
- Subagent management: spawns parallel SDK sessions for independent subtasks

**Shell execution (Bash / PowerShell):**
- The SDK's built-in Bash and PowerShell tools allow the agent to run arbitrary commands on the user's machine
- This enables use of any CLI tool: `pandoc` for document conversion, `jq` for JSON processing, `git` for version control, `curl` for API calls, platform-specific utilities, etc.
- Shell commands go through `IPermissionService` — the user approves or denies execution
- The working directory defaults to the workspace root
- Commands run with the user's environment (PATH, env vars) — the agent has access to whatever the user has installed

### 7.6 Communication Patterns

| Path | Mechanism | Protocol |
|------|-----------|----------|
| Main <-> Renderer | Electron IPC (contextBridge) | Typed message passing |
| Renderer <-> Agent Host | MessagePort | Typed message passing |
| Renderer <-> MCP Manager | MessagePort | Typed message passing |
| Agent Host <-> Copilot CLI Server | JSON-RPC over stdio | GH Copilot SDK protocol |
| MCP Manager <-> MCP Servers (local) | stdio | MCP protocol (JSON-RPC 2.0) |
| MCP Manager <-> MCP Servers (remote) | Streamable HTTP | MCP protocol (JSON-RPC 2.0) |

### 7.7 State Management

| Store | Technology | Content |
|-------|-----------|---------|
| Workspace storage | SQLite (per workspace) | Conversations, tool call history, workspace settings |
| Global storage | SQLite (single) | User preferences, global permissions, connector configs, global memory |
| Secure storage | Electron `safeStorage` (OS keychain) | OAuth tokens, MCP server credentials, API keys |
| Memory files | Filesystem (Markdown) | CLAUDE.md / .github/copilot-instructions.md alongside project files |
| In-memory | JavaScript objects | Current conversation, active tool calls, pending permissions, UI state |

**UI state management:** VS Code-style services with `Event<T>` emitters in the Renderer process, synchronized with Agent Host via MessagePort events. No external state management library — state flows through DI-registered services, consistent with the rest of the architecture.

---

## 8. Data Models

### 8.1 Core Entities

```typescript
// User (persisted in global storage)
interface User {
  githubId: string;
  githubLogin: string;
  copilotTier: 'free' | 'pro' | 'pro_plus' | 'business' | 'enterprise';
  avatarUrl: string;
  preferences: UserPreferences;
}

interface UserPreferences {
  defaultModel: string;           // e.g., "claude-sonnet-4-5"
  theme: 'light' | 'dark' | 'system';
  maxIterations: number;          // default: 50
  autoApproveReadTools: boolean;  // default: true
  notificationsEnabled: boolean;
}

// Workspace (persisted in global storage, references local path)
interface Workspace {
  id: string;                     // UUID
  name: string;
  rootPath: string;               // local filesystem path
  memoryFilePaths: string[];       // paths to CLAUDE.md, .github/copilot-instructions.md
  connectorOverrides: Record<string, Partial<ConnectorConfig>>;
  createdAt: number;              // timestamp
  lastOpenedAt: number;
}

// Conversation (persisted in workspace storage)
interface Conversation {
  id: string;                     // UUID
  workspaceId: string;
  title: string;                  // auto-generated or user-set
  model: string;                  // model used
  status: 'active' | 'archived';
  createdAt: number;
  updatedAt: number;
}

// Message (persisted in workspace storage)
interface Message {
  id: string;                     // UUID
  conversationId: string;
  role: 'user' | 'assistant' | 'system' | 'tool_result';
  content: string | StructuredContent;
  toolCalls: ToolCall[];
  timestamp: number;
}

interface StructuredContent {
  type: 'text' | 'markdown' | 'code' | 'table' | 'image';
  data: string;
  metadata?: Record<string, unknown>;
}

// ToolCall (persisted in workspace storage -- serves as audit trail)
interface ToolCall {
  id: string;                     // UUID
  messageId: string;
  toolName: string;               // e.g., "google-drive/readFile" or "onedrive/readFile"
  serverName: string;             // MCP server name or "built-in"
  arguments: Record<string, unknown>;
  result: ToolResult | null;
  permission: PermissionDecision;
  status: 'pending' | 'approved' | 'denied' | 'executing' | 'completed' | 'failed';
  durationMs: number | null;
  timestamp: number;
}

interface ToolResult {
  success: boolean;
  content: string | unknown;
  error?: string;
}

type PermissionDecision = 'allow_once' | 'allow_always' | 'deny' | 'deny_always' | 'pending';

// ConnectorConfig (persisted in global storage)
interface ConnectorConfig {
  id: string;                     // UUID
  type: 'builtin' | 'local_mcp' | 'remote_mcp' | 'agent_skill';
  name: string;                   // display name
  transport: 'stdio' | 'streamable_http';
  // For stdio transport:
  command?: string;               // e.g., "npx"
  args?: string[];                // e.g., ["-y", "@mcp/google-drive"] or ["-y", "@mcp/onedrive"]
  env?: Record<string, string>;   // environment variables (credentials injected here)
  // For streamable_http transport:
  url?: string;
  headers?: Record<string, string>;
  enabled: boolean;
  capabilities?: ServerCapabilities; // populated after MCP init handshake
  status: 'connected' | 'disconnected' | 'error' | 'initializing';
}

// PermissionRule (persisted in global or workspace storage)
interface PermissionRule {
  id: string;                     // UUID
  scope: 'global' | 'workspace';
  workspaceId?: string;           // if workspace-scoped
  toolPattern: string;            // glob pattern, e.g., "google-drive/*" or "onedrive/*"
  serverName?: string;
  decision: 'allow' | 'deny';
  createdAt: number;
}

// Skill definition
interface Skill {
  id: string;                     // e.g., "draft-email"
  name: string;                   // display name
  source: 'builtin' | 'user' | 'agent_skill';
  description: string;
  filePath: string;               // path to skill Markdown file
  allowedTools?: string[];
  disableModelInvocation?: boolean;
  userInvocable?: boolean;
}

// Hook definition
interface Hook {
  event: 'pre_tool_call' | 'post_tool_call' | 'session_start' | 'session_end';
  matcher?: { toolPattern?: string; serverName?: string };
  command: string;                // shell command to execute
  timeout: number;                // ms
}
```

### 8.2 Entity Relationships

```
User (1) ----< (N) Workspace
Workspace (1) ----< (N) Conversation
Conversation (1) ----< (N) Message
Message (1) ----< (N) ToolCall
User (1) ----< (N) PermissionRule (global scope)
Workspace (1) ----< (N) PermissionRule (workspace scope)
User (1) ----< (N) ConnectorConfig (global)
```

### 8.3 Storage Strategy

| Data | Storage | Rationale |
|------|---------|-----------|
| Conversations, Messages, ToolCalls | SQLite (per workspace) | Structured, queryable, handles large histories |
| User, Preferences, ConnectorConfigs | SQLite (global) | Shared across workspaces |
| PermissionRules | SQLite (global + per workspace) | Fast lookup during tool execution |
| Memory files (CLAUDE.md / copilot-instructions.md) | Filesystem | Version-controllable, human-editable, compatible with existing tooling |
| OAuth tokens, API keys | Electron safeStorage (OS keychain) | Encrypted at rest |
| Active conversation state | In-memory (services + Event emitters) | Ephemeral, reconstructed from SQLite on load |

---

## 9. Authentication and Authorization Flows

### 9.1 Primary Auth Flow: GitHub OAuth

```
+------------------+     1. Click "Sign in with GitHub"     +------------------+
|                  |---------------------------------------->|                  |
|   GHO Work App   |                                        |   System Browser |
|                  |     6. Token stored in safeStorage      |                  |
|                  |<----+                                   |                  |
+------------------+     |                                   +------------------+
                         |                                          |
                         |                                   2. GitHub OAuth
                         |                                      (PKCE flow)
                         |                                          |
                         |                                          v
                         |                                   +------------------+
                         |                                   |                  |
                         |    5. Exchange code for token     |   GitHub OAuth   |
                         +-----------------------------------|   Server         |
                              4. Auth code via redirect      |                  |
                              (localhost or deep link)       +------------------+
                                                                    |
                                                             3. User authorizes
                                                                    |
                                                                    v
                                                             +------------------+
                                                             | Redirect to      |
                                                             | localhost:PORT    |
                                                             +------------------+
```

**Steps in detail:**

1. User clicks "Sign in with GitHub" in GHO Work
2. App opens system browser with GitHub OAuth URL (using PKCE -- no client secret stored)
   - Scopes: `read:user`, `read:org` (for Business/Enterprise tier detection)
3. User authorizes the GHO Work app on GitHub
4. GitHub redirects to `http://localhost:{random-port}/callback` with auth code
5. App exchanges auth code for access token (server-side PKCE verification)
6. App verifies:
   - User identity: `GET /user`
   - Copilot subscription: `GET /user/copilot` (or equivalent API)
   - Subscription tier (determines available models)
7. Token stored in Electron `safeStorage` (OS keychain)

### 9.2 Copilot CLI Server and Agent Harness

The GH Copilot SDK communicates with a locally-running Copilot CLI server, which provides the agent harness:

1. On app launch, GHO Work checks if Copilot CLI server is running
2. If not running, GHO Work starts it (using the installed `gh` CLI or bundled Copilot CLI binary)
3. The CLI server authenticates with GitHub using the same OAuth token or its own auth flow
4. GHO Work connects to the CLI server via JSON-RPC (stdio)
5. All agent sessions run through this connection — the SDK handles the agent loop, built-in tool execution (file ops, bash/PowerShell, git, web), and model inference

**Important:** The GH Copilot SDK manages the agent harness end-to-end. GHO Work creates sessions via `ICopilotSDK`, configures them (model, tools, context), and streams events back to the UI. By default, the SDK enables all first-party tools including shell execution — GHO Work gates these through `IPermissionService` before they run.

### 9.3 MCP Server Authentication

Each MCP server may have its own auth requirements:

| Transport | Auth Method | How GHO Work Handles It |
|-----------|-------------|------------------------|
| stdio (local) | None (runs on user's machine) | Credentials injected as environment variables |
| stdio (local) | API key via env var | User configures key in GHO Work settings, stored in safeStorage, injected as env var |
| Streamable HTTP (remote) | OAuth 2.0 Bearer | OAuth flow per server, token stored in safeStorage, sent as Authorization header |
| Streamable HTTP (remote) | API key | User provides key, stored in safeStorage, sent as header |

**Credential management UI:**
- Settings > Connectors > [Server Name] > Credentials
- Credentials stored in Electron safeStorage (never in plaintext config files)
- "Test Connection" button that runs MCP `initialize` handshake to verify auth

### 9.4 Authorization Model

**Core principle: All authorization is local and user-controlled.**

This is the key differentiator from M365 Copilot:
- No server-side authorization
- No IT admin policies
- No centralized management
- The user decides what the agent can do

The permissions system (Section 5.3) is the sole authorization mechanism. Every tool call goes through `IPermissionService` before execution.

---

## 10. Connector Strategy

### 10.1 Architecture: MCP and CLI as Complementary Integration Layers

**Core decision:** External integrations use either MCP servers or CLI tools, depending on which is the better fit. The agent can use both in a single task.

**Two integration paths:**

| Path | How It Works | Best For |
|------|-------------|----------|
| **MCP servers** | Dedicated process exposing tools/resources via MCP protocol (JSON-RPC 2.0) | Rich, purpose-built integrations that benefit from dynamic tool discovery, resources, streaming, and structured capability negotiation |
| **CLI tools** | Agent executes shell commands via SDK's built-in Bash/PowerShell tools | Mature CLI tools with established auth, command/output patterns, and broad coverage (e.g., `gh`, `az`, `mgc`, `gcloud`, `pandoc`) |

**When to use MCP:**
- The integration needs bidirectional communication, dynamic tool lists, or resource/prompt primitives
- No mature CLI exists for the service
- The integration is purpose-built for AI tool use (e.g., community MCP servers for Slack, Google Drive)
- Complex multi-step interactions benefit from structured tool schemas

**When to use CLI:**
- A well-maintained, well-authenticated CLI already exists (e.g., `gh`, `mgc`, `az`, `gcloud`)
- The interaction is command-oriented (run command → parse output)
- The CLI handles its own authentication (e.g., `gh auth login`, `az login`, `mgc login`)
- The service explicitly supports CLI access (e.g., Microsoft Work IQ supports CLI today)
- The tool is a general-purpose utility (e.g., `pandoc`, `jq`, `curl`, `git`)

**Benefits of the dual approach:**
- Maximizes coverage: some services have great CLIs but no MCP server, and vice versa
- CLI integration is zero-cost — the SDK's Bash tool is already available, no new infrastructure needed
- MCP provides richer integration where it matters (dynamic tools, resources, streaming)
- Users can mix both in workflows (e.g., `gh` CLI for GitHub Issues + Slack MCP for messaging)
- Future-proof: as services add MCP support (e.g., Work IQ plans MCP), integrations can migrate

### 10.2 Connector Tiers

| Tier | Description | Examples | Distribution | Integration Path |
|------|-------------|----------|-------------|------------------|
| **SDK Built-in** | Provided by GH Copilot SDK harness | Filesystem, Git, Bash/PowerShell, Web Fetch | Built into SDK | SDK tools |
| **CLI Tools** | Mature CLIs the agent invokes via shell | `gh` (GitHub), `mgc` (Microsoft Graph), `az` (Azure), `pandoc`, Work IQ CLI | User's PATH | Bash/PowerShell |
| **Registry/Community MCP** | From the MCP Registry (registry.modelcontextprotocol.io) or Claude ecosystem partners | Google Drive, Slack, Gmail, Google Sheets, Jira, Notion, Linear, Confluence | Registry browser in app | MCP |
| **Remote MCP (Claude-compatible)** | Remote MCP servers from partners (same as Claude Integrations) | Atlassian (Jira/Confluence), Zapier, Slack, Asana, Sentry, Linear, Intercom | Streamable HTTP + OAuth | MCP |
| **Custom** | User-configured MCP servers (stdio or HTTP) | Company-internal APIs, custom databases, Anthropic reference servers (Filesystem, Git, Memory) | Manual config in settings | MCP or CLI |

### 10.3 First-Party Integrations (v1)

For each integration, the recommended path (MCP or CLI) based on ecosystem maturity:

#### CLI-first integrations

These services have mature CLIs that handle authentication, provide broad coverage, and produce structured output the agent can parse directly.

| Integration | CLI Tool | Auth Model | Key Capabilities | Notes |
|------------|----------|-----------|-----------------|-------|
| **GitHub** | `gh` CLI | `gh auth login` (OAuth device flow) | Issues, PRs, repos, actions, releases, gists, search | Gold-standard CLI. Pre-installed on many dev machines. |
| **Microsoft Graph** (OneDrive, Outlook, Teams, Excel Online, Outlook Calendar) | `mgc` CLI (Microsoft Graph CLI) | `mgc login` (Microsoft Entra ID) | Files, mail, calendar, Teams messages, Excel workbooks, SharePoint sites | Single CLI covers all M365 services via Graph API. Structured JSON output. |
| **Work IQ** | Work IQ CLI | Microsoft Entra ID | Query work context, semantic search across M365 data, retrieve Work IQ insights | CLI supported today (March 2026). MCP and A2A support planned. Migrate to MCP when available. |
| **Azure** | `az` CLI | `az login` (Entra ID / service principal) | Resource management, DevOps, storage, functions | Relevant for users with Azure-hosted services. |
| **Google Cloud** | `gcloud` CLI | `gcloud auth login` (Google OAuth) | Cloud resources, BigQuery, GCS | Relevant for users with GCP services. |
| **Document conversion** | `pandoc` | N/A (local tool) | Convert between Markdown, DOCX, PDF, HTML, LaTeX, EPUB | Critical for the Markdown-first document model. |

#### MCP ecosystem integrations

For services that lack a mature CLI or benefit from rich MCP capabilities (dynamic tools, resources), GHO Work connects to existing MCP servers from the broader ecosystem. GHO Work does **not** fork, maintain, or ship any MCP servers. Instead, it relies on three sources:

1. **Anthropic reference servers** (github.com/modelcontextprotocol/servers): Everything, Fetch, Filesystem, Git, Memory, Sequential Thinking, Time. Users can run these locally via stdio.
2. **Claude-compatible remote MCP servers**: The same partner integrations available in Claude — Atlassian (Jira/Confluence), Zapier, Cloudflare, Intercom, Asana, Square, Sentry, PayPal, Linear, Plaid, with Stripe/GitLab/Box coming soon. GHO Work connects via Streamable HTTP + OAuth.
3. **MCP Registry** (registry.modelcontextprotocol.io): Hundreds of community-built servers for Google Drive, Gmail, Google Calendar, Slack, Google Sheets, Salesforce, Notion, and more. Users browse and install from within GHO Work.

| Integration | MCP Source | How Users Connect |
|------------|-----------|-------------------|
| **Google Drive** | Community servers on MCP Registry | Browse registry, install via npx or configure URL |
| **Gmail** | Community servers on MCP Registry (IMAP-based or Google API) | Browse registry, install via npx or configure URL |
| **Google Calendar** | Community servers on MCP Registry | Browse registry, install via npx or configure URL |
| **Slack** | Claude ecosystem partner (remote MCP) or community servers | Connect via Streamable HTTP + OAuth, or install local server |
| **Google Sheets** | Community servers on MCP Registry | Browse registry, install via npx or configure URL |
| **Jira/Confluence** | Claude ecosystem partner (Atlassian) | Connect via Streamable HTTP + OAuth |
| **Asana, Linear, Sentry** | Claude ecosystem partners | Connect via Streamable HTTP + OAuth |

#### Why Microsoft 365 services use CLI (`mgc`) instead of MCP

- **Single tool, full coverage**: `mgc` covers all M365 services through one authenticated session
- **Microsoft-maintained**: The Graph CLI is maintained by Microsoft and stays current with API changes
- **Auth simplicity**: One `mgc login` (Entra ID) authenticates all M365 services
- **Structured output**: `mgc` returns JSON that the agent can parse directly
- **Future migration**: Microsoft has announced MCP support for Work IQ (coming soon). As official Microsoft MCP servers mature, integrations can migrate from CLI to MCP.

**Strategy:** For Google Workspace and other services, users connect to existing community or partner MCP servers — GHO Work provides the registry browser and connection infrastructure but does not maintain any servers. For Microsoft 365 services, use the `mgc` CLI today and migrate to official Microsoft MCP servers as they become available. For Work IQ, use the CLI today (the only supported integration path in March 2026).

### 10.4 MCP Ecosystem Strategy (Primary MCP Approach)

GHO Work does **not** implement or maintain any MCP servers. Instead, it provides best-in-class infrastructure for discovering, connecting, and managing MCP servers from the existing ecosystem. This is the primary MCP strategy.

#### 9.4.1 MCP Registry Integration

The MCP Registry (registry.modelcontextprotocol.io) is a directory of hundreds of community-built MCP servers. GHO Work integrates with the Registry API (`registry.modelcontextprotocol.io/v0.1/servers`) to provide:

- **Server browser**: Search and browse available servers by category, name, or capability
- **Server details**: View descriptions, tool lists, install instructions, and community ratings
- **One-click install**: For npm-based servers, install via `npx` directly from the browser
- **Configuration templates**: Pre-filled configuration for popular servers (command, args, env vars)

#### 9.4.2 Remote MCP Servers (Claude-Compatible Partners)

Claude supports "Integrations" — connections to remote MCP servers hosted by partners via Streamable HTTP + OAuth. GHO Work supports the same connection model:

- **Currently available**: Atlassian (Jira/Confluence), Zapier, Cloudflare, Intercom, Asana, Square, Sentry, PayPal, Linear, Plaid
- **Coming soon**: Stripe, GitLab, Box
- **Connection model**: URL-based servers with OAuth tokens, allowlisting/denylisting tools, per-tool configuration, multiple servers simultaneously
- GHO Work's MCP Manager handles the Streamable HTTP transport, OAuth token management, and capability negotiation

#### 9.4.3 Local MCP Servers (stdio)

Users can run MCP servers locally on their machine via stdio transport:

- **Anthropic reference servers**: Filesystem, Git, Memory, Fetch, Sequential Thinking, Time, Everything (from github.com/modelcontextprotocol/servers)
- **Community servers**: Any npm-based or binary MCP server from the registry
- **Custom servers**: User-built servers for company-internal APIs or custom workflows
- GHO Work spawns and manages child processes, handles lifecycle, restart on crash, and credential injection via environment variables

#### 9.4.4 Available MCP Servers by Category

**Existing MCP servers relevant to office productivity (from the MCP Registry and Claude ecosystem):**

| Category | Available MCP Servers |
|----------|----------------------|
| **Google Workspace** | Google Drive, Gmail, Google Calendar, Google Sheets, Google Docs (community servers on registry) |
| **Project Management** | Jira (Claude partner), Linear (Claude partner), Asana (Claude partner), Trello, GitHub Issues, Basecamp |
| **Communication** | Slack (Claude partner / community), Discord, Webex, Zoom Chat, Intercom (Claude partner) |
| **Documents** | Notion, Confluence (Claude partner via Atlassian), Google Docs |
| **Databases** | PostgreSQL, MySQL, SQLite, MongoDB, Supabase |
| **Cloud Storage** | Dropbox, Box (coming soon as Claude partner) |
| **CRM** | Salesforce, HubSpot |
| **DevOps** | GitHub, GitLab (coming soon as Claude partner), Sentry (Claude partner), PagerDuty |
| **Automation** | Zapier (Claude partner) — connects to 7000+ apps |
| **Browser** | Puppeteer, Playwright (for web scraping/automation) |
| **Finance** | Stripe (coming soon as Claude partner), PayPal (Claude partner), QuickBooks (community), Plaid (Claude partner) |
| **Calendar** | CalDAV, Apple Calendar |
| **AI Utilities** | Sequential Thinking, Memory, Everything (Anthropic reference servers) |
| **Work Intelligence** | Work IQ (MCP planned — use CLI until available) |

**CLI tools relevant to office productivity (available on user's machine):**

| Category | CLI Tools |
|----------|----------|
| **Microsoft 365** | `mgc` (Microsoft Graph CLI) — OneDrive, Outlook, Teams, Excel, Calendar, SharePoint |
| **Work Intelligence** | Work IQ CLI — semantic search across M365 data, work context |
| **GitHub** | `gh` CLI — issues, PRs, repos, actions, releases |
| **Cloud Platforms** | `az` (Azure), `gcloud` (Google Cloud), `aws` (AWS) |
| **Document Processing** | `pandoc`, `wkhtmltopdf`, `pdftotext` |
| **Data Processing** | `jq`, `csvkit`, `sqlite3` |
| **Version Control** | `git` (SDK built-in) |

#### 9.4.5 Why No First-Party MCP Servers

GHO Work deliberately does not fork, maintain, or ship any MCP servers:

- **Maintenance burden**: Forking community servers creates an ongoing obligation to track upstream changes, API updates, and security patches
- **Ecosystem alignment**: The MCP ecosystem is rapidly maturing. Anthropic publishes reference servers, partners host remote servers, and the community maintains hundreds of purpose-built servers. Duplicating this work adds no value.
- **Focus**: GHO Work's value is in the desktop shell, agent integration, permissions UX, CLI tools, and connector infrastructure — not in reimplementing API wrappers
- **User empowerment**: Users can choose the best server for their needs from the registry, rather than being limited to GHO Work's maintained set

### 10.5 Connector Configuration UX

> Visual mockups for all connector screens are in the [UX Tutorial Site](tutorial/index.html#connectors).

The Connector Settings panel uses a **tabbed layout** (not a separate "Add" dialog):

| Tab | Content |
|-----|---------|
| **Installed** | All configured MCP servers (with status dot, tool count, enable/disable toggle, gear icon) and detected CLI tools (with version, auth status). MCP servers and CLI tools shown in separate subsections. |
| **Registry** | Search and browse the MCP Registry. Filter by category. Shows server name, author, description, tool count, last updated. "Install" button for npm-based servers. "Installed" badge for already-configured servers. |
| **Remote** | List of Claude-compatible remote MCP server partners (Atlassian, Slack, Zapier, Linear, etc.). "Connect with OAuth" button per server. "Connected" badge for active connections. |
| **CLI Tools** | Detected CLIs with version and auth status. Install guidance links for missing tools. |
| **Custom** | Form for manual MCP server config: name, transport type (stdio or Streamable HTTP), command/args/env (for stdio), URL/headers (for HTTP). Environment variable editor for credentials. |

**Per-connector detail view** (click gear icon on any installed connector):
1. Header: connector name, type, status, "Test Connection" and "Disconnect" buttons
2. **Tools section**: lists all tools with per-tool enable/disable toggles. Disabled tools are not registered with the agent. This provides per-tool allowlisting/denylisting (e.g., enable `google-drive/readFile` but disable `google-drive/deleteFile`).
3. **Credentials section**: credentials management via Electron safeStorage

**Additional connector UX:**
- Status indicators visible in the sidebar Connectors view and status bar
- "Test Connection" button: runs MCP `initialize` handshake (for MCP) or CLI version check + auth validation (for CLI)
- Error states show reconnect button with error description (e.g., "Token expired")

### 10.6 MCP Protocol Implementation Details

**Capability negotiation:** During MCP `initialize`, each server declares what it supports:
- `tools`: executable functions (primary use case)
- `resources`: data sources for contextual information
- `prompts`: reusable interaction templates

GHO Work's MCP Manager must handle all three primitives.

**Dynamic updates:** Servers can send `notifications/tools/list_changed`. The MCP Manager must propagate these to the Agent Host's tool registry in real-time.

**Sampling support:** Some MCP servers request LLM completions from the client via `sampling/complete`. GHO Work routes these through `ICopilotSDK` (which uses the GH Copilot SDK agent harness).

**Elicitation:** MCP servers can request user input via `elicitation/request`. GHO Work surfaces these as modal dialogs in the UI.

**Server lifecycle management (for stdio transport):**
- Spawn child process per MCP server
- Monitor process health (heartbeat, restart on crash)
- Resource limits (memory, CPU -- configurable per server)
- Graceful shutdown on app quit
- Restart without losing conversation context

### 10.7 Leveraging Existing Standards and Systems

Beyond MCP, GHO Work can leverage these existing standards to avoid building from scratch:

| Standard/System | How GHO Work Leverages It |
|----------------|--------------------------|
| **MCP (Model Context Protocol)** | Primary connector layer for purpose-built integrations. GHO Work connects to existing MCP servers from the Registry, Claude ecosystem partners, and Anthropic reference servers — no first-party servers maintained. |
| **CLI tools** | Integration path for services with mature CLIs (`mgc`, `gh`, `az`, `gcloud`, Work IQ CLI, `pandoc`). Agent invokes via SDK's built-in Bash/PowerShell. |
| **Microsoft Graph CLI (`mgc`)** | Single CLI covering all M365 services (OneDrive, Outlook, Teams, Excel, Calendar, SharePoint) with Entra ID auth |
| **Work IQ CLI / API** | Access to Microsoft's work intelligence layer \u2014 semantic search across M365 data, work context. CLI today, MCP planned. |
| **GH Copilot Agent Skills** | Open standard for reusable skill definitions, compatible across Copilot-ecosystem tools |
| **OAuth 2.0 / PKCE** | Standard auth flow for GitHub and MCP server authentication |
| **JSON-RPC 2.0** | Protocol for both MCP and GH Copilot SDK communication |
| **LSP (Language Server Protocol)** | Potential future use for document intelligence (not v1) |
| **CalDAV / CardDAV** | Open standards for calendar/contact sync (alternative to Google API) |
| **IMAP/SMTP** | Universal email protocols (alternative to Gmail API) |
| **WebDAV** | File access protocol (alternative to cloud-specific APIs) |
| **OpenAPI / Swagger** | Auto-generate MCP servers from API specs (community tooling exists) |
| **Markdown** | Universal content format -- LLM-native, human-readable, exportable |
| **CommonMark** | Standardized Markdown spec for consistent rendering |

**Key insight:** By supporting both MCP and CLI as integration paths — and relying on the existing MCP ecosystem rather than maintaining first-party servers — GHO Work maximizes coverage while minimizing maintenance burden. It inherits the entire MCP server ecosystem (Registry, Claude partners, Anthropic reference servers) for purpose-built AI integrations, while also leveraging mature CLIs (like `mgc`, `gh`, and the Work IQ CLI) that already handle authentication and provide broad service coverage. The agent can freely mix both in a single workflow.

---

## 11. Development Stack and Desired Skills

### 11.1 Core Technology Stack

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| Desktop Shell | Electron | Latest stable | Cross-platform, proven (VS Code precedent), native OS integration |
| UI Framework | VS Code-style custom DOM | N/A | Maximizes code reuse from VS Code; custom widgets, Disposable lifecycle, event-driven updates. No virtual DOM overhead. Proven at VS Code scale. |
| Language | TypeScript | 5.x | Type safety, GH Copilot SDK is TS-native, VS Code precedent |
| UI Components | Custom widget classes (VS Code pattern) | N/A | Direct DOM manipulation with accessibility built-in (ARIA roles, keyboard navigation). Reuses VS Code's component patterns (SplitView, ListView, Tree, InputBox, etc.) |
| Styling | CSS custom properties + CSS modules | N/A | VS Code's theming approach. CSS custom properties for theme tokens, scoped styles per component. No build-time CSS framework needed. |
| State Management (UI) | Services + Event<T> emitters | N/A | Same DI-based pattern used throughout the app. State changes propagate via typed events. No separate state management library. |
| Agent Runtime | Node.js | LTS (via Electron) | GH Copilot SDK is TS/Node-native |
| GH Copilot SDK | @github/copilot-cli-sdk | Latest | Primary model access layer |
| MCP Client | @modelcontextprotocol/sdk | Latest | Official MCP SDK for TypeScript |
| Local Database | better-sqlite3 | Latest | Fast, reliable, synchronous API, VS Code uses SQLite |
| Secure Storage | Electron safeStorage API | Built-in | OS keychain integration (macOS Keychain, Windows DPAPI) |
| Build Tool | Vite + electron-vite | Latest | Fast builds, HMR, good Electron support |
| Packaging | electron-builder | Latest | DMG (macOS), NSIS/MSI (Windows), AppImage (Linux) |
| Testing (unit) | Vitest | Latest | Fast, Vite-compatible, good TypeScript support |
| Testing (e2e) | Playwright | Latest | Electron-compatible, reliable, cross-platform |
| Monorepo | Turborepo | Latest | Parallel builds, caching, good for multi-package setup |

### 11.2 Key Libraries

| Library | Purpose |
|---------|---------|
| `mammoth` | DOCX to Markdown/HTML conversion (reading Word docs) |
| `docx` | Generating DOCX files from structured data |
| `exceljs` | Reading and writing Excel files |
| `papaparse` | CSV parsing |
| `marked` or `remark` | Markdown parsing and rendering (used with direct DOM insertion, VS Code-style) |
| `xterm.js` | Terminal emulator component (for advanced users, tool output) |
| `monaco-editor` | Code/Markdown editor (for editing skill definitions, CLAUDE.md, copilot-instructions.md) |
| `date-fns` | Date manipulation (calendar operations) |
| `zod` | Runtime type validation (tool arguments, MCP messages) |

### 11.3 Monorepo Structure

```
gho-work/
  packages/
    base/             -- Shared utilities, types, data structures
    platform/         -- OS abstractions, IPC, storage, auth
    agent/            -- Agent loop, tool execution, permissions
    connectors/       -- MCP client manager, built-in connectors
    ui/               -- Workbench UI (VS Code-style DOM components)
    electron/         -- Main process, preload, window management

  apps/
    desktop/          -- Electron app entry point, packaging config

  cli-guides/          -- Setup guides and wrapper scripts for CLI integrations
    mgc/              -- Microsoft Graph CLI setup, auth, usage patterns
    work-iq/          -- Work IQ CLI setup and usage patterns
    gh/               -- GitHub CLI usage patterns
    pandoc/           -- Document conversion recipes

  skills/             -- Built-in skill definitions
    draft-email/
    summarize-doc/
    meeting-prep/

  docs/               -- Documentation
  tests/              -- Integration and e2e tests
```

### 11.4 Development Infrastructure

| Tool | Purpose |
|------|---------|
| GitHub Actions | CI/CD (natural fit given GH Copilot dependency) |
| ESLint + Prettier | Code quality and formatting |
| Changesets | Version management and changelogs |
| Apple Developer ID | macOS code signing and notarization |
| Windows Authenticode | Windows code signing |
| electron-updater | Auto-update via GitHub Releases |
| Sentry | Error tracking and crash reporting |

### 11.5 Desired Team Skills

**Core engineering:**
- Strong TypeScript experience and familiarity with VS Code's DOM-based UI patterns (custom widgets, Disposable lifecycle, event-driven rendering)
- Electron application development (IPC, multi-process, packaging, auto-update, code signing)
- Experience with AI/LLM application development (streaming, tool use, agent loops, prompt engineering)
- Familiarity with JSON-RPC protocols

**Infrastructure:**
- OAuth 2.0 / PKCE implementation
- SQLite and local data management
- Process management (spawning, monitoring, IPC with child processes)
- Cross-platform desktop app distribution

**Domain knowledge:**
- MCP protocol (well-documented, but specific expertise accelerates connector development)
- GitHub Copilot SDK (Technical Preview -- willingness to navigate API changes)
- VS Code architecture patterns (DI, service-based design, layered code organization)

**UX/Design:**
- Desktop application UX design (not web -- different constraints around native menus, system tray, notifications)
- Conversation UI design (chat interfaces, streaming output, tool call visualization)
- Accessibility (keyboard navigation, screen reader support)

---

## 12. Key Design Decisions

### 12.1 GH Copilot SDK as Agent Runtime and Model Access Layer

| | |
|---|---|
| **Decision** | Use the GH Copilot SDK as the agent runtime (harness) and the only way to access LLM models. No custom agent loop, no direct API fallback. |
| **Rationale** | The SDK provides a production-tested agent harness with built-in tools (file ops, bash/PowerShell, Git, web), multi-model routing, and authentication. The entire product proposition is "use your existing Copilot subscription for office tasks." Building a separate agent loop on top of the same SDK would duplicate effort. GHO Work's value is in MCP integration, office context, permissions UX, and the desktop shell — not in reimplementing orchestration. |
| **Trade-off** | Full dependency on GitHub/Microsoft for both model access and agent orchestration. If the SDK has outages or breaking changes, GHO Work is blocked. The SDK is in Technical Preview (Jan 2026). Less control over agent planning/reasoning internals. |
| **Mitigation** | Abstract behind `ICopilotSDK` / `IAgentService` interfaces for testability and future flexibility. The SDK supports custom tool registration, event hooks, and session configuration — GHO Work retains control over what tools run, what context is provided, and what permissions are enforced. Monitor SDK changelog closely. |

### 12.2 MCP + CLI for External Integrations

| | |
|---|---|
| **Decision** | External integrations use MCP servers or CLI tools, depending on which is the better fit. No custom, proprietary integration code in the main app. |
| **Rationale** | MCP provides rich, purpose-built integrations with dynamic tool discovery and structured capabilities. CLI tools provide zero-cost access to mature, well-authenticated services (e.g., `mgc` for all M365 services, `gh` for GitHub, Work IQ CLI). The SDK's built-in Bash/PowerShell tools make CLI integration free — no additional infrastructure needed. Some services (like Work IQ) only support CLI today and plan MCP for the future. |
| **Trade-off** | Two integration patterns to document and support. CLI tool output parsing is less structured than MCP tool schemas. CLI tool availability depends on the user's machine setup. |
| **Mitigation** | Clear guidance on when to use each path. CLI tools produce JSON output that the agent parses reliably. GHO Work's onboarding can detect and guide CLI tool installation (e.g., prompt to install `mgc` if M365 integration is desired). As services add MCP support, integrations can migrate. |

### 12.3 Multi-Process Architecture (VS Code-inspired)

| | |
|---|---|
| **Decision** | Separate processes for UI (Renderer), agent logic (Agent Host), and connector management (MCP Manager). |
| **Rationale** | Process isolation prevents agent/tool failures from crashing the UI. Proven pattern at VS Code's scale. Enables future extensibility (e.g., multiple windows sharing MCP Manager). |
| **Trade-off** | Higher implementation complexity. IPC infrastructure required. More memory usage. |
| **Mitigation** | Start with 3 processes (Main + Renderer + Agent Host). MCP Manager can start as part of Agent Host and be separated later if needed. |

### 12.4 Local-First, No Cloud Backend

| | |
|---|---|
| **Decision** | GHO Work has no backend service. All data stored locally. No GHO Work servers. |
| **Rationale** | Core differentiator vs M365 Copilot. No server costs. Privacy by architecture. No data residency concerns. Simpler ops. |
| **Trade-off** | No cross-device sync (natively). No server-side analytics. No centralized user management. |
| **Mitigation** | Cross-device access via cloud storage MCP servers (Google Drive, Dropbox). Local telemetry with opt-in anonymous reporting. |

### 12.5 Markdown-First Document Model

| | |
|---|---|
| **Decision** | All AI-generated content is Markdown. Import from and export to DOCX/PDF via libraries. No native OOXML editing. |
| **Rationale** | Markdown is the natural format for LLM-generated content. Native OOXML editing is a multi-year engineering effort and is Microsoft's moat. Keeps the product focused on AI-assisted content creation, not document formatting. |
| **Trade-off** | Users who need pixel-perfect Word/PowerPoint formatting must export and finish in native apps. |
| **Mitigation** | High-quality export to DOCX/PDF. Rich Markdown preview in-app (tables, code blocks, images). Future: explore Pandoc integration for advanced format conversion. |

### 12.6 GH Copilot SDK Agent Harness (Not a Custom Loop)

| | |
|---|---|
| **Decision** | Use the GH Copilot SDK's agent harness for the core agent loop rather than building a custom orchestration layer. |
| **Rationale** | The SDK exposes the same production-tested agent runtime behind Copilot CLI. It handles planning, tool invocation, file edits, shell execution, streaming, and error recovery. Building a custom loop on top of the same SDK would duplicate effort and diverge from the tested codepath. The SDK also provides built-in Bash/PowerShell execution and Git operations, giving the agent access to any CLI tool on the user's machine. |
| **Trade-off** | Less control over the orchestration internals. Dependent on SDK's loop behavior and update cadence. Cannot easily change planning/reasoning strategy independently of the SDK. |
| **Mitigation** | The SDK supports custom tool registration, session configuration, and event hooks — giving GHO Work control over what tools are available, what context is injected, and what permissions are enforced. Abstract behind `IAgentService` / `ICopilotSDK` interfaces for testability. GHO Work's differentiation is in MCP integration, office-specific context, permissions UX, and the desktop shell — not in reinventing the agent loop. |

### 12.7 Resolving GH Copilot vs Claude Code Philosophy Differences

Where the two approaches differ, GHO Work follows GH Copilot's philosophy per the project brief:

| Aspect | Claude Code Approach | GH Copilot Approach | GHO Work Resolution |
|--------|---------------------|--------------------|--------------------|
| **Model access** | Direct Anthropic API | Via Copilot CLI server (JSON-RPC) | GH Copilot SDK (no direct API) |
| **Skill format** | `.claude/skills/` with SKILL.md | `.github/skills/` (open standard) | Support both paths — scan `.claude/skills/` and `.github/skills/`, no new directory convention needed |
| **Agent loop** | Built into Claude Code | SDK provides full agent harness (planning, tool invocation, shell execution) | Use the SDK agent harness directly. GHO Work configures sessions, registers MCP tools, and enforces permissions — does not reimplement the loop. |
| **Permissions** | Granular trust model with sandboxing | Simpler approval model | Start with GH Copilot's simpler model, add granularity over time |
| **Memory** | CLAUDE.md project files | Custom instructions (`.github/copilot-instructions.md`) | Support both — read `CLAUDE.md` and `.github/copilot-instructions.md`, no new file convention needed |
| **Tool naming** | Specific built-in names (Read, Edit, Bash) | SDK built-in tools (file ops, bash, git, web) | Use SDK's built-in tool names as-is. Add MCP tools with descriptive names aligned with office tasks. |
| **Multi-model** | Claude-only | Multi-model routing | Multi-model via SDK (key advantage) |

---

## 13. Open Questions

### 13.1 ~~Copilot CLI Server Lifecycle Management~~ **Resolved: Auto-detect and Guide**

**Decision:** Option C. On first launch, auto-detect whether `gh` CLI and Copilot CLI are installed. If present, use them. If not, show a guided setup wizard with one-click install links. This balances user experience with licensing simplicity.

### 13.2 ~~Open Source or Proprietary?~~ **Resolved: MIT License**

**Decision:** GHO Work will be released as fully open source under the **MIT license**.

**Rationale:**
- Maximizes community contributions and ecosystem growth
- Builds trust — users can audit what runs on their machine (aligns with local-first, user-controlled philosophy)
- Encourages MCP server contributions for office integrations
- MIT is the most permissive and widely adopted license, matching the VS Code codebase (also MIT)
- Reduces friction for adoption in organizations with license review processes
- Existing GitHub Copilot subscription provides the revenue model — GHO Work itself doesn't need to monetize

### 13.3 ~~MCP Server Security Model~~ **Resolved: Hybrid**

**Decision:** Option D (hybrid). Servers from the MCP Registry with high community ratings and Claude ecosystem partner servers get lighter permission requirements. Other community/custom servers require explicit per-tool approval until the user marks them as trusted. Future: add optional sandboxing for untrusted servers.

### 13.4 ~~Handling Copilot Free Tier Limitations~~ **Resolved: Allow All Tiers**

**Decision:** Allow all tiers. Show a clear usage meter. When approaching the limit, inform the user transparently. When the limit is reached, explain clearly and link to GitHub Copilot plan comparison. The Free tier serves as a natural on-ramp.

### 13.5 ~~Product Name~~ **Resolved: "GHO Work" (working name)**

**Decision:** Proceed with "GHO Work" as the working name. Conduct trademark search before public launch. Consider alternatives like "GH Office", "CopilotDesk", "DeskPilot" if trademark issues arise.

### 13.6 ~~Offline Capability~~ **Resolved: No Offline Support (v1)**

**Decision:** Option A. No offline support in v1. The product fundamentally requires LLM inference (via Copilot SDK) which requires internet. Offline mode adds complexity without serving the core use case. Local file browsing and conversation history viewing could be added in v2.

### 13.7 ~~Telemetry and Analytics~~ **Resolved: Opt-in Anonymous Telemetry**

**Decision:** Option B (opt-in). During onboarding, clearly explain what's collected (feature usage counts, error rates — never content or prompts) and let users choose. Respects the local-first, user-controlled philosophy.

### 13.8 Claude Cowork Parity Gap Analysis

Claude Cowork (launched Jan 2026, research preview) is the closest competitor to GHO Work's vision. It brings Claude Code's agentic capabilities to desktop office tasks. The following capabilities present in Claude Cowork are **gaps in the current GHO Work v1 spec**:

| Claude Cowork Capability | GHO Work Status | Priority | Notes |
|-------------------------|-----------------|----------|-------|
| **Scheduled/recurring tasks** — set a Cowork task to execute daily, weekly, or monthly | ❌ Not in v1 scope | **High (v1.1)** | Critical differentiator. Users can delegate recurring work (daily briefings, weekly reports). Requires a lightweight local scheduler service. |
| **Parallel task queuing** — queue multiple requests, Claude works through them | ✅ In v1 scope | **High (v1)** | Added to v1 per recommendation below. UX defined in Section 6.6. Requires task queue in Agent Host (see Implementation Plan Phase 4). |
| **Browser integration** — Claude in Chrome for web research, form filling, data extraction | ❌ Not in v1 scope | **Medium (v2)** | Significant scope. Could leverage Playwright MCP or a browser extension. Claude Cowork uses their Chrome extension. |
| **Plugin system** — one-click installable bundles of skills + MCP servers + tools | ❌ Not in v1 scope | **Medium (v2)** | Claude has 80+ plugins. GHO Work has skills + MCP but no bundled "plugin" concept. Consider for v2 connector marketplace. |
| **Native Excel/PowerPoint output** — Claude for Excel, Claude for PowerPoint | ⚠️ Partial (export via libraries) | **Medium** | GHO Work is Markdown-first with export. Claude Cowork can directly create XLSX/PPTX via skills. GHO Work can match via `pandoc` CLI + `exceljs`/`docx` libraries. |
| **Global and folder-level instructions** — persistent preferences per user and per folder | ✅ Covered | N/A | GHO Work already supports `CLAUDE.md` and `.github/copilot-instructions.md` at project level, plus global `~/.claude/` preferences. |
| **MCP connectors** (Slack, Notion, Figma, Airtable, Jira, etc.) | ✅ Covered | N/A | GHO Work supports MCP servers + CLI tools. Broader coverage via CLI. |
| **Local file operations** — read, create, edit files in designated folders | ✅ Covered | N/A | SDK built-in tools provide this. |
| **Permissions/approval model** — user approves before significant actions | ✅ Covered | N/A | `IPermissionService` handles this. |
| **Skills** — reusable capability definitions | ✅ Covered | N/A | Agent Skills (`.claude/skills/`, `.github/skills/`) supported. |

**Recommendation:** ~~Add **parallel task queuing** to v1 scope~~ **Done** — task queuing is now in v1 scope (Section 5.1, 6.6). Target **scheduled/recurring tasks** for v1.1. Defer browser integration and plugin system to v2.

---

## 14. Competitive Analysis

### 14.1 Competitive Landscape

```
                        Enterprise-Focused
                              |
                    M365 Copilot Wave 3
                    (Copilot Cowork)
                              |
                              |
  General AI ----+------------+------------+---- Office-Specific
  Assistant      |                         |
            Claude Cowork             GHO Work
            ChatGPT Desktop              |
                 |                        |
                 |                        |
                              |
                        Client-Focused
```

### 14.2 Detailed Comparison

| Dimension | GHO Work | M365 Copilot Wave 3 | Claude Cowork | ChatGPT Desktop |
|-----------|----------|---------------------|----------------|-----------------|
| **Deployment** | Local desktop app | Cloud + Office apps | Local desktop app (macOS + Windows) | Local desktop app |
| **Model access** | GH Copilot (Claude, GPT, Gemini) | Microsoft-managed (incl. Claude via Copilot Cowork) | Anthropic API only (Claude) | OpenAI API only |
| **Multi-model** | Yes (via Copilot SDK) | Yes (admin-controlled) | No (Claude only) | No (GPT only) |
| **Agentic capabilities** | Full agent loop + MCP + CLI tools | Multi-step workflows in Office apps | Full agent loop + MCP + local files + browser | Chat + tools/GPTs |
| **Office integration** | MCP (Google) + CLI (`mgc`, Work IQ) | Native (deep Office integration) | Claude for Excel, PowerPoint, Slack; MCP connectors | Limited (plugins) |
| **Scheduled tasks** | Not yet (v1.1) | Yes (Copilot Cowork) | Yes (daily, weekly, monthly) | No |
| **Browser integration** | Not yet (v2) | N/A (web-native) | Claude in Chrome (browse, research, form fill) | ChatGPT in browser |
| **Plugin/marketplace** | Not yet (v2 connector marketplace) | Agent 365 platform | Plugin directory (80+ plugins, one-click install) | GPT store |
| **Skills system** | Agent Skills (`.claude/`, `.github/`) | Work IQ skills | Claude Skills (reusable, cross-platform) | Custom GPTs |
| **Extensibility** | MCP + CLI + Agent Skills + custom skills | Agent 365 platform | MCP connectors + plugins + skills | GPT store |
| **Pricing** | $0-39/mo (existing Copilot sub) | $15-99/user/mo (on top of M365) | $17-200/mo (Pro to Max 20x) | $20/mo (Plus) |
| **Target** | Individual/team productivity | Enterprise productivity | Individual/team productivity | General AI assistant |
| **Data control** | Local-first, user-controlled | Cloud, admin-controlled | Local + Anthropic cloud | OpenAI cloud |
| **IT admin required** | No | Yes | No (Team/Enterprise: optional) | No |
| **Compliance** | User responsibility | Enterprise-grade | Limited (Enterprise plan available) | Limited |
| **Cross-tool** | Any tool via MCP or CLI | Microsoft ecosystem | Any tool via MCP connectors | Limited |

### 14.3 Competitive Advantages

1. **Zero incremental cost**: If you have GH Copilot, GHO Work is free to use
2. **No IT gate**: Install and go, no admin approval needed
3. **Multi-model by default**: Claude, GPT, Gemini through one subscription
4. **Open extensibility**: MCP + CLI ecosystem — hundreds of MCP servers plus every mature CLI tool on the user's machine
5. **Privacy by architecture**: No GHO Work backend, data stays local
6. **Cross-ecosystem**: Works with both Google Workspace (MCP) and Microsoft 365 (`mgc` CLI + Work IQ), plus Slack, GitHub, Notion, Jira
7. **Developer-adjacent**: Familiar to the large GH Copilot user base who also do office work
8. **Work IQ access**: Brings M365 work context intelligence to a client-centric tool — without requiring the full M365 Copilot licensing stack

### 14.4 Competitive Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Microsoft reduces M365 Copilot pricing or adds "personal" tier | Medium | High | Move fast, establish user base. Price is one advantage, but flexibility and extensibility are the durable ones. |
| GH Copilot SDK remains in Technical Preview or breaks compatibility | Medium | High | Abstract behind `ICopilotSDK` / `IAgentService`. Maintain close relationship with SDK team. |
| MCP ecosystem office integrations lag behind developer integrations | Medium | Medium | Provide excellent registry integration and connection UX. Contribute to existing open-source servers. Rely on CLI tools (`mgc`, `gh`) as fallback for services without mature MCP servers. |
| Claude Cowork adds office-specific features and expands plugin ecosystem | High | High | GHO Work's advantages are multi-model access ($0 incremental cost for Copilot subscribers), CLI integration (Work IQ, `mgc`), and open-source extensibility. Claude Cowork is Claude-only and $17-200/mo. |
| GitHub restricts SDK usage for non-coding applications | Low | Critical | Monitor terms of service. Engage with GitHub early about the use case. |

### 14.5 Competitive Moat (Long-term)

1. **Ecosystem lock-in**: Users who build workflows with custom skills and MCP server configurations have switching costs
2. **Community MCP servers**: If GHO Work drives MCP server creation for office use cases, the ecosystem benefits everyone but especially GHO Work
3. **Copilot subscription leverage**: As long as users have Copilot subscriptions, GHO Work provides additional value at zero marginal cost
4. **Skill sharing**: Teams sharing skill definitions and connector configs creates network effects

---

## Appendix A: Glossary

| Term | Definition |
|------|-----------|
| **MCP** | Model Context Protocol -- open standard for connecting AI applications to external tools and data sources |
| **MCP Server** | A program that exposes tools, resources, and prompts to AI applications via the MCP protocol |
| **Agent Loop** | The autonomous cycle where an AI agent plans, executes tools, observes results, and iterates |
| **Agent Skills** | Folders of instructions and scripts that an AI agent auto-loads when relevant (GH Copilot open standard) |
| **Copilot CLI Server** | Local server process that the GH Copilot SDK communicates with for model inference |
| **Work IQ** | Microsoft's intelligence layer for M365 Copilot — provides contextual understanding of work data (files, meetings, chats, relationships) via data, context, and skills/tools layers. Supports CLI today, MCP planned. |
| **CLAUDE.md / copilot-instructions.md** | Project-level context files — GHO Work reads both `CLAUDE.md` (Claude convention) and `.github/copilot-instructions.md` (GitHub Copilot convention) for workspace-specific instructions |
| **Tool Call** | A structured request from the AI to execute a specific function (e.g., read a file, send an email) |
| **Premium Request** | A model inference call that counts against the Copilot subscription quota |
| **Subagent** | A specialized agent spawned by the main agent to handle a specific subtask in parallel |
| **PKCE** | Proof Key for Code Exchange -- OAuth 2.0 extension for public clients (no client secret) |
| **stdio transport** | MCP communication via standard input/output streams (for local servers) |
| **Streamable HTTP** | MCP communication via HTTP POST with SSE streaming (for remote servers) |
| **Activity Bar** | Leftmost vertical strip (48px) with icons for switching sidebar views (Chat, Tool Activity, Connectors, Documents, Settings) |
| **Task Queue** | Queue of user-submitted tasks that execute sequentially while the agent works through them |
| **Command Palette** | Quick access overlay (`Cmd+K`) for executing commands, switching conversations, and navigating the app |

---

## Appendix B: References

### Technology Documentation
- [GitHub Copilot SDK](https://github.com/github/copilot-sdk) - Technical Preview
- [GitHub Copilot CLI](https://docs.github.com/en/copilot/concepts/agents/about-copilot-cli)
- [Model Context Protocol](https://modelcontextprotocol.io/) - Specification and documentation
- [MCP Server Registry](https://registry.modelcontextprotocol.io/) - Community servers
- [VS Code Source Code](https://github.com/microsoft/vscode) - Architecture reference
- [Electron Documentation](https://www.electronjs.org/docs)

### Competitive Intelligence
- [M365 Copilot Wave 3](https://www.microsoft.com/en-us/microsoft-365/blog/2026/03/09/powering-frontier-transformation-with-copilot-and-agents/)
- [Work IQ](https://techcommunity.microsoft.com/blog/microsoft365copilotblog/a-closer-look-at-work-iq/4499789)
- [GitHub Copilot Plans](https://github.com/features/copilot/plans)
- [Claude Cowork](https://claude.com/product/cowork)
- [Claude Cowork Research Preview Blog](https://claude.com/blog/cowork-research-preview)
- [Claude Skills](https://claude.com/skills)
- [Claude Plugins](https://claude.com/plugins)
- [Claude Code](https://code.claude.com/docs/en/overview)

### Architecture References
- [VS Code Source Code Organization](https://github.com/microsoft/vscode/wiki/source-code-organization)
- [VS Code Process Sandboxing](https://code.visualstudio.com/blogs/2022/11/28/vscode-sandbox)
- [MCP Architecture](https://modelcontextprotocol.io/docs/learn/architecture)

### UX Design
- [GHO Work UX Tutorial Site](tutorial/index.html) - Visual design spec with pixel-perfect mockups of all screens and flows
