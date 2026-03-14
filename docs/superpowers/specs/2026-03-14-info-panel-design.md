# Info Panel Design Spec

**Date:** 2026-03-14
**Status:** Approved
**PRD Section:** 6.10 (supersedes — renamed from "Task Context Panel" to "Info Panel", restructured sections)

---

## Overview

The Info Panel is a right-side panel in the conversation view that provides at-a-glance metadata about the active conversation. It answers three questions:

1. **"How far along is this?"** → Progress section
2. **"What is it working with?"** → Input section
3. **"What did it produce?"** → Output section

Inspired by Claude Cowork's task context sidebar, adapted to GHO Work's VS Code-style widget architecture.

## Panel Shell

### Dimensions & Behavior

- **Width:** 280px default, resizable (160–480px range)
- **Collapse toggle:** `Cmd+Shift+B` (keyboard shortcut)
- **Position:** Right of the chat panel in the workbench layout
- **Resize handle:** Between chat container and info panel, same pattern as sidebar resize handle

### Visibility Rules

| Condition | Panel state |
|-----------|-------------|
| No conversation active (fresh launch, settings view) | Hidden |
| Conversation active, agent starts multi-step task (plan with >1 step) | Auto-shows |
| User collapses panel | Stays collapsed until user re-opens or new multi-step task starts |
| User switches to non-chat view (settings) | Hidden |
| Conversation active but no data yet | Visible with empty state: "Panel will populate as the agent works" |

- Collapsed/expanded state remembered per session (not persisted across app restarts)
- Each section is independently collapsible (default: all expanded)

### Architecture

- **Widget:** `InfoPanel` in `packages/ui/src/browser/infoPanel.ts`, extends `Widget`
- **Child widgets:** `ProgressSection`, `InputSection`, `OutputSection` — each extends `Widget` (which extends `Disposable`, providing `getDomNode()` and `listen()`)
- **Event subscription:** Workbench subscribes to `AGENT_EVENT` once and exposes an `Event<AgentEvent>` emitter. Both ChatPanel and InfoPanel consume this emitter — no duplicate IPC subscriptions.
- **Conversation state:** InfoPanel receives the active conversation ID from Workbench via a `setConversation(id: string | null)` method. Internally maintains a `Map<string, InfoPanelState>` so switching conversations restores accumulated state.
- **Scroll-to-message:** InfoPanel emits `onDidRequestScrollToMessage(messageId: string)`. Workbench wires this to ChatPanel's `scrollToMessage(messageId: string)` method (new API on ChatPanel).
- **Wiring:** Workbench creates `InfoPanel` alongside `ChatPanel`. Workbench manages show/hide based on conversation state.
- **Layout:** New flex child in `.workbench-main`, after the chat container. Resize handle between them.
- **Empty state clarity:** When the panel is visible but all three sections are hidden (no plan, no inputs, no outputs), the panel shell shows the empty-state message. Individual sections appear/hide independently as data arrives.

## Section 1: Progress

### When Visible

Only appears when the agent emits a plan (task decomposition with named steps). Hidden for single-step or planless tasks — no "Working..." placeholder.

### Visual Design: Smart Collapse Stepper

Vertical stepper with smart collapsing for long plans:

**Stepper elements:**
- Each step: circle on the left, vertical connecting line, label to the right
- Step states:
  - **Completed:** green circle with checkmark, muted label
  - **Active:** blue circle with pulse animation, bold label
  - **Pending:** gray circle (outline only), muted label
  - **Failed:** red circle with X, label shows error on tooltip

**Smart collapse behavior (for plans with >4 steps):**
- Completed steps collapse into a summary row: "N steps completed" with expand toggle
- Active step + next 2 upcoming steps always visible
- Remaining future steps collapse into "N more steps" with expand toggle
- Progress bar at bottom: fraction (e.g., "6 of 10") and percentage
- User can expand either collapsed group to see all steps

**For short plans (2–4 steps):** Full stepper shown, no collapsing needed.

**Tooltips:** Each completed/active step shows start time and duration on hover.

### Interaction

- Click a completed or active step → scrolls chat to the corresponding agent message
- Read-only — user cannot edit steps

### Data Flow

New event types added to the `AgentEvent` discriminated union (in `packages/base/src/common/types.ts` and the Zod schema in `packages/platform/src/ipc/common/ipc.ts`):

```typescript
// Plan events
interface PlanCreatedEvent {
  type: 'plan_created';
  plan: {
    id: string;
    steps: Array<{ id: string; label: string; }>;
  };
}

interface PlanStepUpdatedEvent {
  type: 'plan_step_updated';
  planId: string;
  stepId: string;
  state: 'completed' | 'active' | 'pending' | 'failed';
  startedAt?: number;   // epoch ms
  completedAt?: number; // epoch ms
  error?: string;       // for failed state
  messageId?: string;   // chat message to scroll to
}
```

**Event origin:** The Copilot SDK (Technical Preview) does not emit structured plan events. The agent service must synthesize them:
- When the agent's response contains a recognizable plan structure (numbered list of steps, task decomposition), the agent service parses it and emits `plan_created`
- As the agent progresses through steps (detected via tool calls, status updates in response text), the agent service emits `plan_step_updated`
- This is a best-effort heuristic — the Progress section is an enhancement, not a guarantee. If no plan is detected, the section simply stays hidden.
- Future SDK versions may provide native plan events, at which point the heuristic can be replaced.

**State:** Per-conversation, maintained in InfoPanel's internal `Map<string, InfoPanelState>`.

## Section 2: Input

### What It Tracks

Everything the agent was given to work with in the conversation, regardless of source:

| Source | Example |
|--------|---------|
| Files attached from Files panel | User clicks attach button on a file |
| Files dragged/dropped onto chat | User drags a PDF into the chat input |
| Data from MCP tools | `google-sheets / getCellRange` returns data |
| Files the agent read autonomously | Agent uses filesystem tools to read a workspace file |

### Entry Display

Each entry shows:
- **Icon:** File type icon (based on extension) or tool icon (gear) for MCP entries
- **Name:** Filename, or `server / toolName` for MCP tool invocations
- **Click action:** Scrolls to the chat message where the input was first referenced

### Ordering

Chronological (newest at bottom), matching conversation flow.

### Empty State

Section hidden when no inputs yet. Appears as soon as the first input is referenced.

### Data Source

Derived from the `AgentEvent` stream via the Workbench's shared emitter.

**Classification of tool calls as "input":**
Tool calls are classified by matching `toolName` against known patterns:
- **File-read tools:** `toolName` matches `readFile`, `read_file`, `searchFiles`, `listDirectory`, or similar filesystem read operations
- **MCP tool invocations:** any tool call where `serverName` is set (indicates an MCP connector provided the data)
- **Attachments:** new `attachment_added` event type emitted by ChatPanel when user attaches/drops a file

```typescript
interface AttachmentAddedEvent {
  type: 'attachment_added';
  attachment: { name: string; path: string; source: 'files-panel' | 'drag-drop' | 'paste'; };
  messageId: string;
}
```

The `tool_call_start` event already carries `toolName`, `serverName`, and `messageId` on the `ToolCall` object — no new fields needed for classification. InfoPanel uses a `isInputTool(toolName, serverName)` helper to classify.

## Section 3: Output

### What It Tracks

Files the agent created or modified during the conversation:

| Action | Example |
|--------|---------|
| File written to workspace | Agent creates `Sales Summary.xlsx` |
| File downloaded | Agent exports from a connector |
| File modified | Agent edits an existing document |

### Entry Display

Each entry shows:
- **Icon:** File type icon (based on extension)
- **Filename:** Truncated with tooltip for long names
- **File size:** Displayed inline (e.g., "24 KB")
- **Badge:** "new" (green) for created files, "edited" (blue) for modified existing files
- **Actions (on hover):**
  - Click filename → opens file preview in main panel
  - External-link icon → opens in Finder/Explorer (`shell.showItemInFolder`)

### Ordering

Chronological (newest at bottom).

### Empty State

Section hidden until the first output. Appears with the first file write.

### Data Source

Same `AgentEvent` stream via the Workbench's shared emitter.

**Classification of tool calls as "output":**
Tool calls are classified by matching `toolName` against known patterns:
- **File-write tools:** `toolName` matches `writeFile`, `write_file`, `createFile`, `editFile`, or similar filesystem write operations
- **Export tools:** MCP tools that produce downloadable files (determined by result content)

The `tool_call_result` event (note: the actual event name, not `tool_call_done`) carries `{ success, content, error }`. To extract file path and size:
- The agent service enriches `tool_call_result` for file-write tools with additional metadata:

```typescript
// Extended tool_call_result for file operations
interface FileToolCallResult extends ToolCallResultEvent {
  fileMeta?: {
    path: string;       // absolute path of the file
    size: number;       // bytes
    action: 'created' | 'modified';
  };
}
```

InfoPanel uses `isOutputTool(toolName)` helper to classify, then reads `fileMeta` for display.

## Layout Integration

### Workbench Layout (updated)

```
Title Bar
├─ Workbench Wrapper
│   ├─ Activity Bar (48px, left edge)
│   ├─ Sidebar (240px, resizable, left)
│   ├─ Main Content (flex: 1)
│   │   ├─ Chat Container (flex: 1, max-width: 900px centered)
│   │   ├─ Resize Handle (info panel)
│   │   └─ Info Panel (280px, resizable, right, collapsible)
│   └─ (no right edge — info panel is inside main content)
└─ Status Bar
```

### CSS Changes

- `.workbench-main` becomes a flex row (currently just contains chat container)
- New `.info-panel` class with resize behavior matching `.workbench-sidebar`
- Chat container's `max-width: 900px` and `margin: 0 auto` centering needs adjustment — when info panel is visible, chat should fill available space up to its max-width, not center in the full main area
- Info panel resize handle: same visual treatment as sidebar resize handle

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+B` | Toggle info panel visibility |

## Comparison with Prior Art

| Aspect | Claude Cowork | GHO Work Info Panel |
|--------|---------------|---------------------|
| Panel structure | Live activity feed, less structured | Three discrete collapsible sections |
| Progress | Step-by-step with real-time indicators | Smart-collapse stepper with progress bar |
| Files in | Mixed into activity stream | Dedicated Input section, all sources |
| Files out | Clickable deliverables in stream | Dedicated Output section with new/edited badges |
| Tool visibility | Shown in activity stream | Included in Input section alongside files |
| Widget approach | Web-based (Cowork VM) | VS Code-style Widget + Disposable pattern |

## Accessibility

- **Panel:** `role="complementary"`, `aria-label="Task info"`
- **Sections:** Each section is a `role="region"` with `aria-label` (e.g., "Progress", "Input", "Output")
- **Collapsible headers:** `aria-expanded`, `aria-controls` on section headers (same pattern as `ChatCollapsible`)
- **Stepper steps:** `role="list"` container, `role="listitem"` for each step, `aria-current="step"` on active step
- **Step state changes:** `aria-live="polite"` region announces step completions (e.g., "Step 3 completed: Validate data types")
- **Keyboard navigation:** Tab to panel, arrow keys between sections, Enter to expand/collapse, Tab into section items, Enter to activate click actions
- **File entries:** Each entry is a focusable button with `aria-label` including filename and action description

## Animations & Transitions

- **Section show/hide:** `max-height` CSS transition, 200ms ease-out
- **Active step pulse:** CSS `@keyframes pulse` on the step circle, 1.5s infinite
- **Panel collapse/expand:** Width transition 200ms ease-out (matches sidebar pattern)
- **Progress bar:** Width transition 300ms ease-out when percentage updates
- All animations respect `prefers-reduced-motion: reduce` — disable pulse, use instant transitions

## Open Questions

1. **Persistence across sessions:** Should input/output lists persist when reopening a past conversation, or only populate during active sessions? (Current design: per-session only, since events are transient)
2. **Deduplication:** If the agent reads the same file multiple times, show once with a count badge (recommended) or once per occurrence?
3. **Plan updates:** Can the agent's plan grow mid-execution (add steps)? If so, the stepper needs to handle dynamic step insertion.
4. **Plan detection heuristic:** The agent service must parse agent responses to detect plans. What constitutes a "plan"? Numbered lists? Explicit "I'll do X, then Y" structures? This heuristic needs design and tuning — false positives (showing a stepper for a simple enumeration) are worse than false negatives (not showing a stepper when there is a plan).
5. **Auto-show vs user intent:** When the panel is collapsed and a multi-step task starts, should auto-show always trigger, or be suppressed if the user manually collapsed within the current task? (Recommendation: auto-show only on new conversations or new task starts, not mid-task.)
6. **Help text update:** The chat panel's help message (`/help` output) needs updating to list the `Cmd+Shift+B` shortcut.
