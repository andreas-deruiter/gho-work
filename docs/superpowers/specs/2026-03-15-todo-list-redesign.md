# Todo List Redesign — Replace Plan Events with SDK Tool

**Date:** 2026-03-15
**Status:** Draft
**Scope:** Replace the non-functional plan-event-based ProgressSection with a tool-driven TodoListWidget, matching VS Code Copilot's `manage_todo_list` pattern.

## Problem

The current ProgressSection waits for `plan.created` and `plan.step_updated` SDK events that the GitHub Copilot SDK never emits. The mock SDK fakes these events, but the real SDK has no such event types. The Progress section is dead code in production.

VS Code Copilot solves this differently: it registers a `manage_todo_list` built-in tool that the model calls like any other tool. The client handles the call, updates the UI, and returns a confirmation message. No special SDK events needed.

## Solution

Register `manage_todo_list` as a custom tool on the SDK session via the `tools` array in `createSession()`. The model calls it when tasks have 3+ steps (instructed via system prompt). The client-side handler emits a `todo_list_updated` AgentEvent that flows through IPC to the TodoListWidget in the info panel.

## Design

### 1. Tool Registration & Handler

**SDK API (confirmed):** The real Copilot SDK's `createSession()` accepts a `tools` array with `Tool<TArgs>` definitions including client-side `handler` functions. See `@github/copilot-sdk/dist/types.d.ts` (`Tool` interface) and `README.md` (lines 397-411, `defineTool` example). The SDK deserializes JSON arguments and calls the handler directly in our process.

**Internal interface change:** Our `SessionConfig` wrapper (`packages/agent/src/common/types.ts`) must be extended with a `tools` field to pass through to the real SDK:

```typescript
export interface SessionConfig {
  // ...existing fields...
  tools?: Array<{
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;  // JSON Schema
    handler: (args: any) => Promise<unknown> | unknown;
  }>;
}
```

Register `manage_todo_list` in `AgentServiceImpl.executeTask()` when creating a new session:

```typescript
const session = await this._sdk.createSession({
  // ...existing config...
  tools: [
    {
      name: 'manage_todo_list',
      description: 'Create and update a todo list for tracking multi-step tasks. Send the full list each time (replace semantics). Only one item should be in-progress at a time. Mark items completed individually.',
      parameters: {
        type: 'object',
        properties: {
          todoList: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'number', description: 'Unique identifier for the todo item' },
                title: { type: 'string', description: 'Concise action-oriented label (3-7 words)' },
                status: { type: 'string', enum: ['not-started', 'in-progress', 'completed'] },
              },
              required: ['id', 'title', 'status'],
            },
          },
        },
        required: ['todoList'],
      },
      handler: async ({ todoList }) => {
        queue.push({ type: 'todo_list_updated', todos: todoList });
        return buildConfirmationMessage(todoList, previousTodos);
      },
    },
  ],
});
```

**Confirmation message** (returned to the model): follows VS Code's past-tense pattern:
- First call: `"Created N todos"`
- Status change: `"Starting: *Title* (N/M)"` or `"Completed: *Title* (N/M)"`

**System prompt** (added to `skills/system/gho-instructions.md`):
```markdown
## Todo tracking

For tasks with 3 or more distinct steps, call `manage_todo_list` to track progress.
Send the full list each time. Only one item should be `in-progress` at a time.
Mark items completed individually as you finish them.
```

### 2. Data Model & Event Flow

**New AgentEvent type** (replaces plan/subagent events):
```typescript
| { type: 'todo_list_updated'; todos: Array<{ id: number; title: string; status: 'not-started' | 'in-progress' | 'completed' }> }
```

**Removed AgentEvent types:**
- `plan_created`
- `plan_step_updated`

**Kept AgentEvent types** (subagent events are independent of todo tracking — they indicate nested agent activity and may be consumed by future UI features):
- `subagent_started`
- `subagent_completed`
- `subagent_failed`

**InfoPanelState:**
- Remove: `PlanState`, `PlanStep`, `StepState`, `plan`, `setPlan()`, `updateStep()`, `trackToolCall()`
- Add: `todos` array and `setTodos()` method

**Event flow:**
1. Model calls `manage_todo_list` → SDK routes to handler
2. Handler emits `todo_list_updated` into AsyncQueue
3. IPC forwards to renderer
4. `InfoPanel.handleEvent()` → `InfoPanelState.setTodos()` → `TodoListWidget.setTodos()`

### 3. TodoListWidget

Replaces `ProgressSection`. Same location in info panel (`_progressWrap` → `_todoWrap`).

**UI structure** (collapsible):
```
▼ Todos (2/5)
  ✓ Phase 3: MCP Manager core          (completed — green checkmark)
  ● Phase 3: Connector registry        (in-progress — blue filled circle)
  ○ Phase 3: Tool bridge to SDK        (not-started — empty circle)
  ○ Phase 3: Settings panel shell      (not-started — empty circle)
  ○ Phase 3: Connectors settings       (not-started — empty circle)
```

**Header:** `Todos (N/M)` where N = completed count, M = total. Example: "Todos (2/5)" means 2 of 5 done.

**Collapse behavior:**
- Starts expanded when first created
- Stays expanded (no auto-collapse — users want to see progress as it happens)
- User can manually collapse/expand via chevron click

**Visibility:** Hidden (`display: none`) when no todos. Auto-shows info panel when first todos arrive.

**Status icons** (CSS, no icon library):
- `not-started`: hollow circle (border only)
- `in-progress`: solid blue filled circle
- `completed`: green checkmark character (✓)

**File:** `packages/ui/src/browser/infoPanel/todoListWidget.ts`

### 4. Files Changed

**New files:**
- `packages/ui/src/browser/infoPanel/todoListWidget.ts` — TodoListWidget

**Deleted files:**
- `packages/ui/src/browser/infoPanel/progressSection.ts`
- `packages/ui/src/browser/infoPanel/subagentProgressBridge.ts`
- `packages/ui/src/browser/infoPanel/subagentProgressBridge.test.ts`

**Modified files:**
- `packages/base/src/common/types.ts` — Remove `plan_created` and `plan_step_updated`, add `todo_list_updated`
- `packages/base/src/common/types.test.ts` — Update event shape tests
- `packages/platform/src/ipc/common/ipc.ts` — Update Zod schema: remove plan event variants, add `todo_list_updated`. Also sync missing `subagent_*` and `context_loaded` variants (pre-existing gap)
- `packages/agent/src/common/types.ts` — Add `tools` field to `SessionConfig` interface
- `packages/agent/src/node/agentServiceImpl.ts` — Add tool registration in `createSession()`, remove `_mapEvent` cases for `plan.created` and `plan.step_updated`
- `packages/agent/src/node/mockCopilotSDK.ts` — Replace fake plan events with `manage_todo_list` tool calls
- `packages/ui/src/browser/infoPanel/infoPanel.ts` — Swap ProgressSection → TodoListWidget, handle `todo_list_updated`
- `packages/ui/src/browser/infoPanel/infoPanelState.ts` — Replace plan types with todos
- `packages/ui/src/browser/infoPanel/infoPanel.test.ts` — Update tests
- `apps/desktop/src/renderer/styles.css` — Add todo CSS, remove plan/step CSS
- `skills/system/gho-instructions.md` — Add todo tracking instructions
- `tests/e2e/agent-orchestration.spec.ts` — Verify todo list appears

**Unchanged files:**
- `packages/agent/src/node/instructionResolver.ts`
- `packages/connectors/src/node/pluginAgentLoader.ts`
- `packages/ui/src/browser/infoPanel/contextSection.ts`

### 5. Mock SDK Changes

Replace the fake `plan.created` / `plan.step_updated` event sequence with `manage_todo_list` tool calls:

```typescript
// Instead of emitting plan.created, simulate the model calling the tool
if (isComplex) {
  this.emit({
    type: 'tool.execution_start',
    data: {
      toolCallId: generateUUID(),
      toolName: 'manage_todo_list',
      arguments: {
        todoList: [
          { id: 1, title: 'Understand the request', status: 'in-progress' },
          { id: 2, title: 'Research relevant files', status: 'not-started' },
          { id: 3, title: 'Implement changes', status: 'not-started' },
        ],
      },
    },
  });
  // ... later update statuses via subsequent tool calls
}
```

**Mock tool handler routing:** The `MockSDKSession` must accept `tools` from `SessionConfig` and store them. When the mock simulates a `manage_todo_list` tool call, it looks up the registered handler by name and calls it with the arguments. This exercises the same handler code path as the real SDK — the handler pushes `todo_list_updated` into the queue, and the mock emits `tool.execution_complete` with the handler's return value.

```typescript
// In MockSDKSession constructor:
this._tools = config.tools ?? [];

// When simulating a tool call:
const tool = this._tools.find(t => t.name === 'manage_todo_list');
if (tool) {
  const result = await tool.handler(args);
  this.emit({ type: 'tool.execution_complete', data: { toolCallId, success: true, result } });
}
```

This keeps the mock faithful to the real flow — the handler is always what drives the `todo_list_updated` event, not hardcoded mock logic.

### 6. Testing

**Unit tests:**
- `todoListWidget.test.ts` — Widget renders todos, updates on `setTodos()`, collapse/expand behavior, status icons
- `infoPanelState.test.ts` — `setTodos()` stores and retrieves correctly
- `agentServiceImpl.test.ts` — Tool handler emits `todo_list_updated`, confirmation message format

**E2E test (mock mode):**
- Send a complex prompt → verify todo list appears in info panel
- Verify todo items have correct status indicators
- Verify counter shows correct N/M

**Manual validation (real SDK):**
- Send a multi-step prompt → verify model calls `manage_todo_list`
- Verify todos appear and update as the model works
- Verify the info panel auto-shows when todos arrive
