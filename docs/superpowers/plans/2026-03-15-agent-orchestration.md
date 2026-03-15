# Agent Orchestration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add system prompt composition (persona + user/project instructions), plugin agent loading, subagent progress tracking, and context transparency to the agent orchestration pipeline.

**Architecture:** Five new modules compose at session creation: `InstructionResolver` (agent) discovers/merges instruction files, `PluginAgentLoader` (connectors) reads plugin agent `.md` files into `PluginAgentDefinition[]`, `AgentServiceImpl` maps definitions to SDK types and composes the system message, `SubagentProgressBridge` (ui) maps SDK subagent events to progress section state, and `ContextSection` (ui) shows loaded instructions/agents in the info panel. New `AgentEvent` types (`subagent_started`, `subagent_completed`, `subagent_failed`, `context_loaded`) flow through existing IPC.

**Tech Stack:** TypeScript, Node.js fs, vanilla DOM (h() helper), Widget/Disposable pattern, Zod schemas, Vitest

**Spec:** `docs/superpowers/specs/2026-03-15-agent-orchestration-design.md`

---

## Chunk 1: Base Types & Shared Definitions

### Task 1: Add PluginAgentDefinition to base pluginTypes

**Files:**
- Modify: `packages/base/src/common/pluginTypes.ts`

- [ ] **Step 1: Add PluginAgentDefinition interface**

Add to `packages/base/src/common/pluginTypes.ts`:

```typescript
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

### Task 2: Add new AgentEvent types

**Files:**
- Modify: `packages/base/src/common/types.ts`
- Modify: `packages/platform/src/ipc/common/ipc.ts`

- [ ] **Step 1: Add subagent and context_loaded events to AgentEvent union in types.ts**

Add four new variants to the `AgentEvent` discriminated union:
- `subagent_started` with `parentToolCallId`, `name`, `displayName`
- `subagent_completed` with `parentToolCallId`, `name`, `displayName`
- `subagent_failed` with `parentToolCallId`, `name`, `error`
- `context_loaded` with `sources[]` and `agents[]`

- [ ] **Step 2: Add matching Zod schemas to ipc.ts AgentEventSchema**

Add four new entries to the `AgentEventSchema` discriminated union matching the types above.

### Task 3: Add agentName to PlanStep in infoPanelState

**Files:**
- Modify: `packages/ui/src/browser/infoPanel/infoPanelState.ts`

- [ ] **Step 1: Extend PlanStep interface with agentName field**

Add `agentName?: string` to the `PlanStep` interface.

- [ ] **Step 2: Add contextSources and registeredAgents to InfoPanelState**

Add two new fields that survive `clear()`:
```typescript
private _contextSources: Array<{ path: string; origin: string; format: string }> = [];
private _registeredAgents: Array<{ name: string; plugin: string }> = [];
```
With getters and setters. These are NOT cleared by `clear()` (they are per-session, not per-turn).

---

## Chunk 2: InstructionResolver

### Task 4: Create InstructionResolver

**Files:**
- New: `packages/agent/src/node/instructionResolver.ts`
- New: `packages/agent/src/node/instructionResolver.test.ts`

- [ ] **Step 1: Implement InstructionResolver class**

Class with constructor taking `_userDir` (string) and `_projectDirs` (string[]). Has `resolve()` method that:
1. Scans `_userDir` for `GHO.md`
2. For each `_projectDirs` entry, scans for `GHO.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, `.cursorrules` in that order
3. Reads all found files, wraps each in HTML comment separator with origin info
4. Returns `InstructionResult` with merged `content` and `sources` array

Max file size: 50KB per file (truncate with warning comment).

- [ ] **Step 2: Export InstructionResolver from agent package index**

Add `export { InstructionResolver } from './node/instructionResolver.js';` to `packages/agent/src/index.ts`.

- [ ] **Step 3: Write unit tests for InstructionResolver**

Test: discovery order, merge format, missing files, empty dirs, multiple project dirs, truncation at 50KB.

---

## Chunk 3: PluginAgentLoader

### Task 5: Create PluginAgentLoader

**Files:**
- New: `packages/connectors/src/node/pluginAgentLoader.ts`
- New: `packages/connectors/src/node/pluginAgentLoader.test.ts`

- [ ] **Step 1: Implement PluginAgentLoader class**

Class with `loadAll(plugins: InstalledPlugin[])` and `loadFromPlugin(plugin: InstalledPlugin)` methods. For each enabled plugin:
1. Resolve agent directories from manifest (same logic as `_resolveAgentDirs` in pluginInstaller)
2. Read each `.md` file, parse frontmatter (regex-based, same as skillRegistryImpl)
3. Map frontmatter fields to `PluginAgentDefinition`
4. If plugin has `.mcp.json`, read and attach as `mcpServers`

Skip disabled plugins. Log warnings for malformed agent files (missing `name` or `description`).

- [ ] **Step 2: Export PluginAgentLoader from connectors package index**

Add `export { PluginAgentLoader } from './node/pluginAgentLoader.js';` to `packages/connectors/src/index.ts`.

- [ ] **Step 3: Write unit tests for PluginAgentLoader**

Test: frontmatter parsing, missing required fields, disabled plugins filtered, MCP server loading, multiple agents per plugin.

---

## Chunk 4: AgentServiceImpl Updates

### Task 6: Update AgentServiceImpl constructor and session creation

**Files:**
- Modify: `packages/agent/src/node/agentServiceImpl.ts`
- Modify: `packages/agent/src/common/types.ts` (SessionConfig)
- Modify: `packages/agent/src/node/copilotSDKImpl.ts` (pass customAgents)

- [ ] **Step 1: Add customAgents to SessionConfig**

Add `customAgents?: Array<{ name: string; displayName?: string; description: string; prompt: string; tools?: string[] | null; infer?: boolean; mcpServers?: Record<string, unknown> }>` to `SessionConfig` in `packages/agent/src/common/types.ts`.

- [ ] **Step 2: Pass customAgents through in copilotSDKImpl.ts**

Update `mapSessionConfig()` to include `customAgents` field. Also pass through in `MockCopilotSDK` if needed.

- [ ] **Step 3: Update AgentServiceImpl constructor**

Replace `_readContextFiles?: () => Promise<string>` with:
- `_instructionResolver: { resolve(): Promise<{ content: string; sources: Array<{ path: string; origin: string; format: string }> }> }`
- `_pluginAgentLoader: { loadAll(plugins: InstalledPlugin[]): Promise<Array<{ pluginName: string; definition: PluginAgentDefinition }>> }`
- `_getEnabledPlugins?: () => InstalledPlugin[]`

Use interfaces (not concrete classes) to keep it testable.

- [ ] **Step 4: Update executeTask() session creation**

When creating a new session:
1. Load persona via `this._skillRegistry.getSkill('system', 'gho-instructions')`
2. Call `this._instructionResolver.resolve()` for user/project instructions
3. Call `this._pluginAgentLoader.loadAll(enabledPlugins)` for plugin agents
4. Map `PluginAgentDefinition[]` to SDK `customAgents` format
5. Compose systemContent: `[persona, instructions.content, context.systemPrompt].filter(Boolean).join('\n\n')`
6. Set `model: context.model || undefined` (remove hardcoded `'gpt-4o'` fallback)
7. Pass `customAgents` to `createSession()`
8. Emit `context_loaded` event with sources and agents

- [ ] **Step 5: Add subagent event mapping to _mapEvent()**

Add three new cases: `subagent.started`, `subagent.completed`, `subagent.failed`.

---

## Chunk 5: SubagentProgressBridge

### Task 7: Create SubagentProgressBridge

**Files:**
- New: `packages/ui/src/browser/infoPanel/subagentProgressBridge.ts`
- New: `packages/ui/src/browser/infoPanel/subagentProgressBridge.test.ts`

- [ ] **Step 1: Implement SubagentProgressBridge**

Pure functions (no class needed):
- `correlateSubagentToStep(steps: PlanStep[]): PlanStep | undefined` — returns next pending step
- `updateStepFromSubagent(event: AgentEvent, state: InfoPanelState): void` — maps subagent events to step state changes
- Handles edge case: subagent without plan (returns info for single-step indicator)

- [ ] **Step 2: Write unit tests**

Test: step correlation (sequential), subagent_started → active, subagent_completed → completed, subagent_failed → failed, subagent without plan, agentName badge assignment.

---

## Chunk 6: ContextSection Widget

### Task 8: Create ContextSection

**Files:**
- New: `packages/ui/src/browser/infoPanel/contextSection.ts`
- New: `packages/ui/src/browser/infoPanel/contextSection.test.ts`

- [ ] **Step 1: Implement ContextSection widget**

Extends `Widget`. Shows:
- Header "Context"
- List of loaded instruction sources with paths and origin badges
- List of registered agents with plugin name badges
- Empty state when no context loaded
- Hidden when both lists empty

Uses `h()` helper for DOM creation, follows Widget/Disposable pattern.

- [ ] **Step 2: Write unit tests**

Test: renders sources, renders agents, handles empty state, hidden when no data.

---

## Chunk 7: Wire Everything Together

### Task 9: Update InfoPanel to handle new events

**Files:**
- Modify: `packages/ui/src/browser/infoPanel/infoPanel.ts`
- Modify: `packages/ui/src/browser/infoPanel/index.ts`
- Modify: `packages/ui/src/browser/infoPanel/progressSection.ts`

- [ ] **Step 1: Add ContextSection to InfoPanel**

Add a `_contextWrap` div and `_contextSection` widget. Wire context_loaded event to populate it.

- [ ] **Step 2: Handle subagent events in InfoPanel.handleEvent()**

Add cases for `subagent_started`, `subagent_completed`, `subagent_failed` in `handleEvent()`. Use `SubagentProgressBridge` to correlate with plan steps. Handle subagent-without-plan case.

- [ ] **Step 3: Render agentName badge in ProgressSection**

In `_makeStepEl()`, if step has `agentName`, render a badge span next to the label.

- [ ] **Step 4: Export new modules from infoPanel/index.ts**

Add exports for `ContextSection` and `SubagentProgressBridge`.

- [ ] **Step 5: Persist context data across clear() in _rebuildSections**

When rebuilding sections, replay context data (sources + agents) into ContextSection.

### Task 10: Wire InstructionResolver and PluginAgentLoader in mainProcess.ts

**Files:**
- Modify: `packages/electron/src/main/mainProcess.ts`

- [ ] **Step 1: Import and instantiate InstructionResolver**

Replace `readInstructionsFile` callback with `InstructionResolver` instance. Use `os.homedir() + '/.gho-work'` as userDir. Project dirs from `storageService.getSetting('instructions.projectDirs')` or empty array.

- [ ] **Step 2: Import and instantiate PluginAgentLoader**

Create `PluginAgentLoader` instance.

- [ ] **Step 3: Update AgentServiceImpl construction**

Pass `instructionResolver`, `pluginAgentLoader`, and a `getEnabledPlugins` callback (from `pluginService.getInstalled().filter(p => p.enabled)`).

### Task 11: Create gho-instructions.md skill file

**Files:**
- New: `skills/system/gho-instructions.md`

- [ ] **Step 1: Write the bundled persona file**

Create `skills/system/gho-instructions.md` with frontmatter (description) and body containing: persona, planning behavior, delegation rules, transparency rules, guardrails.

---

## Chunk 8: Quality Gates

### Task 12: Lint, build, and test

- [ ] **Step 1: Run `npx turbo lint` and fix errors**
- [ ] **Step 2: Run `npx turbo build` and fix errors**
- [ ] **Step 3: Run `npx vitest run --changed` and fix failures**
