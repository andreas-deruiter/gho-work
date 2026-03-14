# Agent Orchestration — Design Spec

**Date:** 2026-03-15
**Status:** Draft
**Scope:** System prompt, auto-planning, plugin agent loading, subagent progress tracking, instruction discovery

---

## 1. Overview

GHO Work's agent currently runs as a single session with a basic system message and no awareness of plugin agents, user instruction files, or plan-driven orchestration. This spec introduces five interconnected capabilities:

1. **`gho-instructions.md`** — a bundled skill file that defines the agent persona, auto-planning behavior, and delegation rules
2. **Auto-planning** — the system prompt instructs the agent to create plans for complex tasks without the user switching modes
3. **Plugin agent loading** — marketplace plugin agents are registered as `customAgents` on the SDK session
4. **Subagent progress bridge** — SDK subagent and plan events drive the info panel's progress section
5. **User instruction discovery** — the app discovers and merges instruction files (`GHO.md`, `CLAUDE.md`, `copilot-instructions.md`, `.cursorrules`) from user and project directories

## 2. Architecture

### 2.1 Layered Pipeline

Four modules compose at session creation:

```
InstructionResolver        →  discovers & merges instruction files
PluginAgentLoader          →  reads plugin agent .md files into PluginAgentDefinition[]
AgentServiceImpl           →  orchestrates session creation, maps definitions → SDK types
SubagentProgressBridge     →  maps SDK subagent/plan events → InfoPanelState
```

Each module is independently testable. `AgentServiceImpl` stays focused on session lifecycle.

### 2.2 System Message Priority

Content is appended after SDK defaults. Within our content, later entries can override earlier ones:

| Priority | Source | Description |
|----------|--------|-------------|
| 1 (highest) | SDK defaults | Security guardrails, tool instructions (we don't control this) |
| 2 | `gho-instructions.md` | Persona, planning behavior, delegation rules (bundled) |
| 3 | User instructions | `~/.gho/instructions.md` (user-level defaults) |
| 4 | Project instructions | `GHO.md` / `CLAUDE.md` / etc. (project-level overrides) |
| 5 (lowest) | `context.systemPrompt` | Per-conversation ephemeral context (e.g., setup skills) |

All content is passed via `systemMessage: { mode: 'append', content: combined }`.

### 2.3 Model Selection

No model is hardcoded. The `model` field in `createSession()` is set to `context.model || undefined`. When `undefined`, the SDK server picks its own default. The only place a model string appears is when the user explicitly selects one in settings. The model list is populated from `client.listModels()`.

**Behavior change:** The existing code uses `context.model ?? 'gpt-4o'` as a hardcoded fallback. This spec removes that fallback. Users who previously relied on the implicit `gpt-4o` default will instead get whatever model the SDK server selects. This is intentional — the SDK handles `undefined` model gracefully by using its own default.

### 2.4 Shared Types

`PluginAgentDefinition` is defined in `packages/base` so it can be used by both `packages/connectors` (which produces it) and `packages/agent` (which consumes and maps it to the SDK's `CustomAgentConfig`):

```typescript
// packages/base/src/common/pluginTypes.ts
export interface PluginAgentDefinition {
  name: string;
  displayName?: string;
  description: string;
  prompt: string;
  tools?: string[] | null;
  infer?: boolean;
  mcpServers?: Record<string, unknown>;
}
```

`AgentServiceImpl` maps `PluginAgentDefinition` → SDK `CustomAgentConfig` at session creation. This keeps the SDK dependency confined to `packages/agent`.

## 3. Component Details

### 3.1 gho-instructions.md

A markdown skill file bundled at `skills/system/gho-instructions.md`. It defines the agent's identity and behavior.

**Contents:**

1. **Persona** — "You are GHO Work, an AI office assistant. You help users with email, documents, spreadsheets, calendars, and multi-step workflows."
2. **Planning behavior** — "When a task requires 3 or more distinct actions or involves multiple tools/services, create a plan before starting. For simpler tasks, execute directly without a plan."
3. **Delegation rules** — "When a plan step would benefit from a specialized agent's tools or domain expertise, delegate to that agent. Handle simple single-tool steps yourself."
4. **Transparency** — "When you create a plan, briefly state what you're going to do before starting. When delegating to a specialized agent, name it."
5. **Guardrails** — "Never send emails, messages, or make external changes without confirming with the user first. Read operations are fine without confirmation."

**Loading:** Read via `SkillRegistry.getSkill('system', 'gho-instructions')` during session creation, injected directly into `systemMessage`. Unlike regular skills (which the SDK loads on demand via `skillDirectories`), this file is always present in the system message — it is the agent's identity.

**Why a skill file, not a hardcoded string:**
- Users can read it to understand agent behavior
- Iterable without code changes
- Goes through existing `SkillRegistry` (same loading, same disable mechanism)
- Bundled at SkillRegistry priority 0, but appended at system message priority 2 (after SDK defaults)

### 3.2 InstructionResolver

**Location:** `packages/agent/src/node/instructionResolver.ts`

**Responsibility:** Discover, read, and merge user/project instruction files into a string.

**API:**

```typescript
interface InstructionSource {
  path: string;
  origin: 'user' | 'project';
  format: 'gho' | 'claude' | 'copilot' | 'cursor';
}

interface InstructionResult {
  content: string;              // merged content ready for systemMessage
  sources: InstructionSource[]; // which files were loaded (for transparency)
}

class InstructionResolver {
  constructor(
    private _userDir: string,      // ~/.gho/
    private _projectDirs: string[] // from settings, can be empty
  ) {}

  async resolve(): Promise<InstructionResult>;
}
```

**Discovery order within each directory:**

```
GHO.md  →  CLAUDE.md  →  .github/copilot-instructions.md  →  .cursorrules
```

All found files are read and merged. User-level (`~/.gho/GHO.md`) goes first, then project-level files in priority order. The user-level file uses the same name (`GHO.md`) for consistency — it lives at `~/.gho/GHO.md`.

**Merge format:**

```markdown
<!-- User instructions from ~/.gho/GHO.md -->
{content}

<!-- Project instructions from ./CLAUDE.md -->
{content}
```

HTML comments serve as separators visible in debug output. The model treats them as low-signal context boundaries.

**Project directory configuration:** `_projectDirs` come from a setting persisted via `StorageService`. The Settings UI would need an addition to let users add/remove project paths — that is a separate UI task, not part of this module.

### 3.3 PluginAgentLoader

**Location:** `packages/connectors/src/node/pluginAgentLoader.ts`

**Responsibility:** Read agent `.md` files from installed plugins and convert them to `PluginAgentDefinition[]` (defined in `packages/base`).

**API:**

```typescript
interface LoadedAgent {
  pluginName: string;
  definition: PluginAgentDefinition;
}

class PluginAgentLoader {
  async loadAll(plugins: InstalledPlugin[]): Promise<LoadedAgent[]>;
  async loadFromPlugin(plugin: InstalledPlugin): Promise<LoadedAgent[]>;
}
```

**Agent file format:**

Each `.md` file in a plugin's `agents/` directory becomes one `PluginAgentDefinition`. Frontmatter defines metadata, body is the prompt. Frontmatter is parsed using the same regex-based approach as `parseFrontmatterDescription()` in `skillRegistryImpl.ts` — no additional dependencies.

```markdown
---
name: code-simplifier
displayName: Code Simplifier
description: Simplifies code for clarity and maintainability
tools: [readFile, editFile, searchFiles]
infer: true
---

You simplify and refine code for clarity, consistency, and
maintainability while preserving all functionality...
```

**Frontmatter mapping:**

| Frontmatter field | PluginAgentDefinition field | Required? | Default |
|---|---|---|---|
| `name` | `name` | Yes | — |
| `displayName` | `displayName` | No | name |
| `description` | `description` | Yes | — |
| `tools` | `tools` | No | null (all tools) |
| `infer` | `infer` | No | `true` |

**MCP servers:** If the plugin's `.mcp.json` exists, those servers are passed via the agent's `mcpServers` field, scoped to that agent.

**Relationship to existing code:**
- `pluginInstaller.ts` already has `countAgents()` that scans `agents/` directories — `PluginAgentLoader` does the same scan but reads the files
- `pluginServiceImpl.ts` already calls `addSource()` for plugin skills — it would also call `loadAll()` for plugin agents
- The `agentCount` field stays as-is (useful for UI badges before the session is created)

**Disabled plugins:** Only `enabled` plugins have their agents loaded. Disabling a plugin removes its agents from future sessions.

### 3.4 SubagentProgressBridge

**Location:** `packages/ui/src/browser/infoPanel/subagentProgressBridge.ts`

**Responsibility:** Map SDK subagent and plan events to the info panel's progress section. Renderer-side module — translates `AgentEvent`s (already flowing via IPC) into `InfoPanelState` updates. No new IPC channels needed.

**Plan event model:** The existing codebase already maps structured plan events (`plan.created` with `{ id, steps: [{id, label}] }` and `plan.step_updated` with explicit state/error fields). The bridge works with these existing structured `PlanState`/`PlanStep` models — no markdown parsing needed.

**Core functions:**

```typescript
correlateSubagentToStep(steps: PlanStep[]): PlanStep | undefined
```
Sequential assumption: the next pending step is the one the subagent is working on.

```typescript
updateStepFromSubagent(event: AgentEvent, state: InfoPanelState): void
```
Maps subagent lifecycle events to step state changes:
- `subagent_started` → step state `active`, attach `agentName` badge
- `subagent_completed` → step state `completed`
- `subagent_failed` → step state `failed`, attach error message

**New AgentEvents:**

```typescript
| { type: 'subagent_started'; parentToolCallId: string; name: string; displayName: string }
| { type: 'subagent_completed'; parentToolCallId: string; name: string; displayName: string }
| { type: 'subagent_failed'; parentToolCallId: string; name: string; error: string }
```

**PlanStep extension:**

```typescript
interface PlanStep {
  // ...existing fields
  agentName?: string;  // NEW — subagent display name shown as badge
}
```

**Edge cases:**

| Scenario | Behavior |
|----------|----------|
| No plan created | Simple task — progress section stays hidden |
| Plan but no subagents | Main agent works through steps itself. Existing `plan_step_updated` events drive the stepper |
| Subagent without plan | Show subagent activity as a single-step progress indicator ("Running: Doc Drafter"), not a stepper |
| Plan changes mid-execution | New `plan.created` event replaces the plan; preserve completed steps where IDs match, add new ones as pending |
| Subagent fails | Mark step as failed with error. Main agent decides whether to retry, skip, or abort |

### 3.5 Transparency — Context Section

**Purpose:** Make loaded instructions and registered agents visible for troubleshooting.

#### 3.5.1 Chat Startup Log

On session creation (first message in a conversation), a `context_loaded` AgentEvent is emitted. On subsequent messages in the same conversation, the session is reused and `context_loaded` is not re-emitted. The renderer must persist this data in `InfoPanelState` across turns. The chat renders it as a subtle, collapsed message:

```
📋 Loaded instructions from: ~/.gho/instructions.md, ./CLAUDE.md
```

Clicking expands to show the full list with file paths.

**New AgentEvent:**

```typescript
| { type: 'context_loaded';
    sources: Array<{ path: string; origin: 'user' | 'project'; format: string }>;
    agents: Array<{ name: string; plugin: string }> }
```

#### 3.5.2 Info Panel Context Section

**Location:** `packages/ui/src/browser/infoPanel/contextSection.ts`

A new section in the info panel (alongside Progress, Inputs, Outputs) showing:

- Which instruction files were loaded, with full paths
- Which plugin agents are registered for the session
- Clickable paths to reveal file content

Data comes from `InstructionResolver.resolve()` (returns `sources`) and `PluginAgentLoader.loadAll()` (returns `LoadedAgent[]`), passed to the renderer at session creation via the `context_loaded` event and stored in `InfoPanelState`.

**Scope boundary:** The context section shows what was loaded. It does not allow editing instruction files or toggling agents — that is a settings UI concern.

## 4. Changes to AgentServiceImpl

### 4.1 Constructor

```typescript
constructor(
  private readonly _sdk: ICopilotSDK,
  private readonly _conversationService: IConversationService | null,
  private readonly _skillRegistry: ISkillRegistry,
  private readonly _instructionResolver: InstructionResolver,
  private readonly _pluginAgentLoader: PluginAgentLoader,
  private readonly _getDisabledSkills?: () => string[],
)
```

`_readContextFiles` callback is replaced by `_instructionResolver`. Currently, `_readContextFiles` is a callback wired in `mainProcess.ts` that returns a string (no files are actually read today — it's a placeholder). `InstructionResolver` fully subsumes this with actual file discovery.

### 4.2 Session Creation in executeTask()

```typescript
// 1. Load bundled persona (always present)
const persona = await this._skillRegistry.getSkill('system', 'gho-instructions');

// 2. Resolve user/project instructions
const instructions = await this._instructionResolver.resolve();

// 3. Load plugin agents (PluginAgentDefinition[] from connectors)
const pluginAgents = await this._pluginAgentLoader.loadAll(enabledPlugins);

// 4. Map PluginAgentDefinition → SDK CustomAgentConfig (keeps SDK dep in agent package)
const customAgents: CustomAgentConfig[] = pluginAgents.map(a => ({
  name: a.definition.name,
  displayName: a.definition.displayName,
  description: a.definition.description,
  prompt: a.definition.prompt,
  tools: a.definition.tools,
  infer: a.definition.infer ?? true,
  mcpServers: a.definition.mcpServers as Record<string, MCPServerConfig> | undefined,
}));

// 5. Compose system message — no hardcoded model
const systemContent = [persona, instructions.content, context.systemPrompt]
  .filter(Boolean).join('\n\n');

session = await this._sdk.createSession({
  model: context.model || undefined,
  systemMessage: { mode: 'append', content: systemContent },
  customAgents,
  // ...existing: mcpServers, disabledSkills, streaming
});

// 6. Emit context_loaded for transparency (once per session, persisted by renderer)
queue.push({
  type: 'context_loaded',
  sources: instructions.sources,
  agents: pluginAgents.map(a => ({
    name: a.definition.displayName ?? a.definition.name,
    plugin: a.pluginName,
  })),
});
```

### 4.3 Event Mapping Additions

Three new cases in `_mapEvent()` for subagent events:

```typescript
case 'subagent.started':
  return {
    type: 'subagent_started',
    parentToolCallId: data.parentToolCallId as string,
    name: data.name as string,
    displayName: (data.displayName as string) ?? (data.name as string),
  };
case 'subagent.completed':
  return {
    type: 'subagent_completed',
    parentToolCallId: data.parentToolCallId as string,
    name: data.name as string,
    displayName: (data.displayName as string) ?? (data.name as string),
  };
case 'subagent.failed':
  return {
    type: 'subagent_failed',
    parentToolCallId: data.parentToolCallId as string,
    name: data.name as string,
    error: (data.error as string) ?? 'Unknown error',
  };
```

### 4.4 Unchanged

- Session caching (`_sessions` map)
- Setup conversations (`createSetupConversation`)
- `cancelTask` / `getActiveTaskId`
- `AsyncQueue` pattern

## 5. File Layout

### New Files

| File | Package | Purpose |
|------|---------|---------|
| `packages/agent/src/node/instructionResolver.ts` | agent | Discover & merge instruction files |
| `packages/agent/src/node/instructionResolver.test.ts` | agent | Unit tests |
| `packages/connectors/src/node/pluginAgentLoader.ts` | connectors | Load plugin agent .md → PluginAgentDefinition |
| `packages/connectors/src/node/pluginAgentLoader.test.ts` | connectors | Unit tests |
| `packages/ui/src/browser/infoPanel/contextSection.ts` | ui | Info panel context section widget |
| `packages/ui/src/browser/infoPanel/contextSection.test.ts` | ui | Unit tests |
| `packages/ui/src/browser/infoPanel/subagentProgressBridge.ts` | ui | Map subagent events → progress section |
| `packages/ui/src/browser/infoPanel/subagentProgressBridge.test.ts` | ui | Unit tests |
| `skills/system/gho-instructions.md` | bundled skills | Agent persona & orchestration prompt |

### Modified Files

| File | Changes |
|------|---------|
| `packages/base/src/common/types.ts` | Add `subagent_started`, `subagent_completed`, `subagent_failed`, `context_loaded` to AgentEvent union |
| `packages/base/src/common/pluginTypes.ts` | Add `PluginAgentDefinition` interface |
| `packages/agent/src/node/agentServiceImpl.ts` | Replace `_readContextFiles` with `InstructionResolver` + `PluginAgentLoader`; add subagent event mapping; remove hardcoded model; add PluginAgentDefinition → CustomAgentConfig mapping |
| `packages/agent/src/common/copilotSDK.ts` | Add `customAgents` to session creation options |
| `packages/agent/src/node/copilotSDKImpl.ts` | Pass `customAgents` through to SDK |
| `packages/electron/src/main/mainProcess.ts` | Instantiate `InstructionResolver` and `PluginAgentLoader`, wire into `AgentServiceImpl` |
| `packages/ui/src/browser/infoPanel/infoPanel.ts` | Add context section, wire subagent progress bridge |
| `packages/ui/src/browser/infoPanel/infoPanelState.ts` | Add `contextSources`, `registeredAgents`, and `agentName` to `PlanStep`. `contextSources` and `registeredAgents` must survive `clear()` calls (they are per-session, not per-turn) |
| `packages/ui/src/browser/infoPanel/progressSection.ts` | Render subagent badge on steps |
| `packages/platform/src/ipc/common/ipc.ts` | Add IPC schema for context_loaded event data |

### Import Rule Compliance

- `instructionResolver.ts` in `agent` — reads files, imports from `base` only ✓
- `pluginAgentLoader.ts` in `connectors` — uses `InstalledPlugin` and `PluginAgentDefinition` from `base`, reads files ✓
- `contextSection.ts` in `ui` — imports from `base`/`platform` only ✓
- `subagentProgressBridge.ts` in `ui` — imports from `base`/`platform` only ✓

## 6. Testing Strategy

| Module | Test Type | What to verify |
|--------|-----------|----------------|
| InstructionResolver | Unit (Vitest) | Discovery order, merge format, missing files, empty dirs, multiple files |
| PluginAgentLoader | Unit (Vitest) | Frontmatter parsing, missing fields, disabled plugins filtered, MCP server scoping |
| SubagentProgressBridge | Unit (Vitest) | Step correlation, subagent event → state mapping, subagent-without-plan fallback, edge cases |
| ContextSection | Unit (Vitest) | Renders sources, renders agents, handles empty state |
| AgentServiceImpl | Integration (Vitest) | Session creation with all components composed, event mapping for new event types |
| End-to-end | Playwright | Complex task triggers plan in progress section; subagent badge appears; context section shows loaded files |
