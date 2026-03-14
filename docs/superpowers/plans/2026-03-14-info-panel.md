# Info Panel Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a right-side info panel to the conversation view with three sections: Progress (smart-collapse stepper), Input (files + tools referenced), and Output (files produced).

**Architecture:** New `InfoPanel` widget in `packages/ui/src/browser/infoPanel/` composed of three child section widgets. Subscribes to `AgentEvent` stream via a shared Workbench emitter. New event types (`plan_created`, `plan_step_updated`, `attachment_added`) added to the `AgentEvent` discriminated union. Workbench manages panel visibility and wires scroll-to-message between InfoPanel and ChatPanel. InfoPanel tracks a `Map<string, string>` of toolCallId → toolName from `tool_call_start` events so that `tool_call_result` events (which lack `toolName`) can be classified. Output classification also uses `fileMeta` presence as a simpler shortcut when available.

**Tech Stack:** TypeScript, vanilla DOM (h() helper), Widget/Disposable pattern, Zod schemas, CSS, Vitest

**Spec:** `docs/superpowers/specs/2026-03-14-info-panel-design.md`

---

## Chunk 1: Types, State Model & Tool Classification

### Task 1: Extend AgentEvent with new event types

**Files:**
- Modify: `packages/base/src/common/types.ts:130-138`
- Modify: `packages/platform/src/ipc/common/ipc.ts:109-118`
- Test: `packages/base/src/common/types.test.ts`

- [ ] **Step 1: Write test for new AgentEvent types**

Create `packages/base/src/common/types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { AgentEvent } from './types.js';

describe('AgentEvent', () => {
  it('accepts plan_created event', () => {
    const event: AgentEvent = {
      type: 'plan_created',
      plan: {
        id: 'plan-1',
        steps: [
          { id: 'step-1', label: 'Fetch data' },
          { id: 'step-2', label: 'Analyze' },
        ],
      },
    };
    expect(event.type).toBe('plan_created');
  });

  it('accepts plan_step_updated event', () => {
    const event: AgentEvent = {
      type: 'plan_step_updated',
      planId: 'plan-1',
      stepId: 'step-1',
      state: 'completed',
      startedAt: 1000,
      completedAt: 2000,
      messageId: 'msg-1',
    };
    expect(event.type).toBe('plan_step_updated');
    expect(event.state).toBe('completed');
  });

  it('accepts attachment_added event', () => {
    const event: AgentEvent = {
      type: 'attachment_added',
      attachment: { name: 'file.csv', path: '/tmp/file.csv', source: 'drag-drop' },
      messageId: 'msg-2',
    };
    expect(event.type).toBe('attachment_added');
  });

  it('accepts tool_call_result with fileMeta', () => {
    const event: AgentEvent = {
      type: 'tool_call_result',
      toolCallId: 'tc-1',
      result: { success: true, content: 'ok' },
      fileMeta: { path: '/tmp/out.xlsx', size: 24576, action: 'created' },
    };
    expect(event.type).toBe('tool_call_result');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/base/src/common/types.test.ts`
Expected: FAIL — type errors, new event types not in union.

- [ ] **Step 3: Add new event types to AgentEvent union in types.ts**

In `packages/base/src/common/types.ts`, extend the `AgentEvent` union (after line 138):

```typescript
export type AgentEvent =
  | { type: 'text'; content: string }
  | { type: 'text_delta'; content: string }
  | { type: 'thinking'; content: string }
  | { type: 'thinking_delta'; content: string }
  | { type: 'tool_call_start'; toolCall: Omit<ToolCall, 'result' | 'durationMs'> }
  | { type: 'tool_call_result'; toolCallId: string; result: ToolResult; fileMeta?: FileMeta }
  | { type: 'error'; error: string }
  | { type: 'done'; messageId: string }
  | { type: 'plan_created'; plan: { id: string; steps: Array<{ id: string; label: string }> } }
  | { type: 'plan_step_updated'; planId: string; stepId: string; state: 'completed' | 'active' | 'pending' | 'failed'; startedAt?: number; completedAt?: number; error?: string; messageId?: string }
  | { type: 'attachment_added'; attachment: { name: string; path: string; source: 'files-panel' | 'drag-drop' | 'paste' }; messageId: string };

export interface FileMeta {
  path: string;
  size: number;
  action: 'created' | 'modified';
}
```

- [ ] **Step 4: Update Zod schema in ipc.ts to match**

In `packages/platform/src/ipc/common/ipc.ts`, add the new variants to `AgentEventSchema`:

```typescript
const FileMetaSchema = z.object({
  path: z.string(),
  size: z.number(),
  action: z.enum(['created', 'modified']),
});

export const AgentEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), content: z.string() }),
  z.object({ type: z.literal('text_delta'), content: z.string() }),
  z.object({ type: z.literal('thinking'), content: z.string() }),
  z.object({ type: z.literal('thinking_delta'), content: z.string() }),
  z.object({ type: z.literal('tool_call_start'), toolCall: ToolCallPartialSchema }),
  z.object({ type: z.literal('tool_call_result'), toolCallId: z.string(), result: ToolResultSchema, fileMeta: FileMetaSchema.optional() }),
  z.object({ type: z.literal('error'), error: z.string() }),
  z.object({ type: z.literal('done'), messageId: z.string() }),
  z.object({ type: z.literal('plan_created'), plan: z.object({
    id: z.string(),
    steps: z.array(z.object({ id: z.string(), label: z.string() })),
  }) }),
  z.object({ type: z.literal('plan_step_updated'), planId: z.string(), stepId: z.string(), state: z.enum(['completed', 'active', 'pending', 'failed']), startedAt: z.number().optional(), completedAt: z.number().optional(), error: z.string().optional(), messageId: z.string().optional() }),
  z.object({ type: z.literal('attachment_added'), attachment: z.object({ name: z.string(), path: z.string(), source: z.enum(['files-panel', 'drag-drop', 'paste']) }), messageId: z.string() }),
]);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run packages/base/src/common/types.test.ts`
Expected: PASS

- [ ] **Step 6: Run full build to check no regressions**

Run: `npx turbo build`
Expected: Clean compilation. Existing consumers of `AgentEvent` (ChatPanel, agent service) are unaffected — they use discriminated union narrowing on existing types.

- [ ] **Step 7: Commit**

```bash
git add packages/base/src/common/types.ts packages/base/src/common/types.test.ts packages/platform/src/ipc/common/ipc.ts
git commit -m "feat(types): add plan, attachment, and fileMeta event types to AgentEvent"
```

### Task 2: InfoPanel state model and tool classification helpers

**Files:**
- Create: `packages/ui/src/browser/infoPanel/infoPanelState.ts`
- Test: `packages/ui/src/browser/infoPanel/infoPanelState.test.ts`

- [ ] **Step 1: Write tests for state model and classification helpers**

Create `packages/ui/src/browser/infoPanel/infoPanelState.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { InfoPanelState, isInputTool, isOutputTool, formatFileSize, extractInputName } from './infoPanelState.js';

describe('isInputTool', () => {
  it('classifies readFile as input', () => {
    expect(isInputTool('readFile', '')).toBe(true);
  });
  it('classifies read_file as input', () => {
    expect(isInputTool('read_file', '')).toBe(true);
  });
  it('classifies searchFiles as input', () => {
    expect(isInputTool('searchFiles', '')).toBe(true);
  });
  it('classifies listDirectory as input', () => {
    expect(isInputTool('listDirectory', '')).toBe(true);
  });
  it('classifies any MCP tool (serverName set) as input', () => {
    expect(isInputTool('getCellRange', 'google-sheets')).toBe(true);
  });
  it('does not classify writeFile as input', () => {
    expect(isInputTool('writeFile', '')).toBe(false);
  });
});

describe('isOutputTool', () => {
  it('classifies writeFile as output', () => {
    expect(isOutputTool('writeFile')).toBe(true);
  });
  it('classifies write_file as output', () => {
    expect(isOutputTool('write_file')).toBe(true);
  });
  it('classifies createFile as output', () => {
    expect(isOutputTool('createFile')).toBe(true);
  });
  it('classifies editFile as output', () => {
    expect(isOutputTool('editFile')).toBe(true);
  });
  it('does not classify readFile as output', () => {
    expect(isOutputTool('readFile')).toBe(false);
  });
});

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(500)).toBe('500 B');
  });
  it('formats kilobytes', () => {
    expect(formatFileSize(24576)).toBe('24 KB');
  });
  it('formats megabytes', () => {
    expect(formatFileSize(2621440)).toBe('2.5 MB');
  });
});

describe('InfoPanelState', () => {
  it('starts empty', () => {
    const state = new InfoPanelState();
    expect(state.plan).toBeNull();
    expect(state.inputs).toEqual([]);
    expect(state.outputs).toEqual([]);
  });

  it('adds input entries and deduplicates by path', () => {
    const state = new InfoPanelState();
    state.addInput({ name: 'file.csv', path: '/tmp/file.csv', messageId: 'msg-1', kind: 'file' });
    state.addInput({ name: 'file.csv', path: '/tmp/file.csv', messageId: 'msg-3', kind: 'file' });
    expect(state.inputs).toHaveLength(1);
    expect(state.inputs[0].count).toBe(2);
  });

  it('adds output entries', () => {
    const state = new InfoPanelState();
    state.addOutput({ name: 'out.xlsx', path: '/tmp/out.xlsx', size: 24576, action: 'created', messageId: 'msg-2' });
    expect(state.outputs).toHaveLength(1);
    expect(state.outputs[0].action).toBe('created');
  });

  it('tracks toolCallId to toolName mapping', () => {
    const state = new InfoPanelState();
    state.trackToolCall('tc-1', 'readFile', '');
    state.trackToolCall('tc-2', 'getCellRange', 'google-sheets');
    expect(state.getToolInfo('tc-1')).toEqual({ toolName: 'readFile', serverName: '' });
    expect(state.getToolInfo('tc-2')).toEqual({ toolName: 'getCellRange', serverName: 'google-sheets' });
    expect(state.getToolInfo('tc-unknown')).toBeUndefined();
  });
});

describe('extractInputName', () => {
  it('extracts filename from path argument', () => {
    expect(extractInputName('readFile', '', { path: '/data/input.csv' })).toBe('input.csv');
  });
  it('extracts filename from filePath argument', () => {
    expect(extractInputName('readFile', '', { filePath: '/data/input.csv' })).toBe('input.csv');
  });
  it('extracts filename from file argument', () => {
    expect(extractInputName('readFile', '', { file: '/data/input.csv' })).toBe('input.csv');
  });
  it('formats MCP tool as server / toolName', () => {
    expect(extractInputName('getCellRange', 'google-sheets', {})).toBe('google-sheets / getCellRange');
  });
  it('falls back to toolName if no recognized path argument', () => {
    expect(extractInputName('readFile', '', { uri: 'https://example.com' })).toBe('readFile');
  });
});

describe('InfoPanelState', () => {
  it('sets plan and updates step states', () => {
    const state = new InfoPanelState();
    state.setPlan({ id: 'p1', steps: [{ id: 's1', label: 'Fetch' }, { id: 's2', label: 'Analyze' }] });
    expect(state.plan!.steps).toHaveLength(2);
    expect(state.plan!.steps[0].state).toBe('pending');

    state.updateStep('s1', 'active', { startedAt: 1000 });
    expect(state.plan!.steps[0].state).toBe('active');

    state.updateStep('s1', 'completed', { completedAt: 2000, messageId: 'msg-5' });
    expect(state.plan!.steps[0].state).toBe('completed');
    expect(state.plan!.steps[0].messageId).toBe('msg-5');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/ui/src/browser/infoPanelState.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement state model and helpers**

Create `packages/ui/src/browser/infoPanel/infoPanelState.ts`:

```typescript
/**
 * InfoPanel state model and tool classification helpers.
 * Manages per-conversation state for the info panel sections.
 */
// --- Tool classification ---

const INPUT_TOOL_NAMES = new Set([
  'readFile', 'read_file', 'searchFiles', 'search_files',
  'listDirectory', 'list_directory', 'readDir', 'read_dir',
  'getFileContents', 'get_file_contents',
]);

const OUTPUT_TOOL_NAMES = new Set([
  'writeFile', 'write_file', 'createFile', 'create_file',
  'editFile', 'edit_file', 'updateFile', 'update_file',
  'saveFile', 'save_file',
]);

export function isInputTool(toolName: string, serverName: string): boolean {
  // Any MCP tool (has a serverName) is considered input
  if (serverName) {
    return true;
  }
  return INPUT_TOOL_NAMES.has(toolName);
}

export function isOutputTool(toolName: string): boolean {
  return OUTPUT_TOOL_NAMES.has(toolName);
}

/**
 * Extract a human-readable name for an input entry from tool call arguments.
 * Tries common argument names (path, filePath, file), falls back to server/toolName.
 */
export function extractInputName(toolName: string, serverName: string, args: Record<string, unknown>): string {
  if (serverName) {
    return `${serverName} / ${toolName}`;
  }
  // Try common path argument names
  for (const key of ['path', 'filePath', 'file']) {
    const val = args[key];
    if (typeof val === 'string' && val) {
      // Extract just the filename from a path
      const parts = val.split(/[/\\]/);
      return parts[parts.length - 1] || val;
    }
  }
  return toolName;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// --- State model ---

export type StepState = 'completed' | 'active' | 'pending' | 'failed';

export interface PlanStep {
  id: string;
  label: string;
  state: StepState;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  messageId?: string;
}

export interface PlanState {
  id: string;
  steps: PlanStep[];
}

export interface InputEntry {
  name: string;
  path: string;
  messageId: string;
  kind: 'file' | 'tool';
  count: number;
}

export interface OutputEntry {
  name: string;
  path: string;
  size: number;
  action: 'created' | 'modified';
  messageId: string;
}

export class InfoPanelState {
  private _plan: PlanState | null = null;
  private _inputs: InputEntry[] = [];
  private _outputs: OutputEntry[] = [];
  private _toolCalls = new Map<string, { toolName: string; serverName: string }>();

  get plan(): PlanState | null {
    return this._plan;
  }

  get inputs(): readonly InputEntry[] {
    return this._inputs;
  }

  get outputs(): readonly OutputEntry[] {
    return this._outputs;
  }

  setPlan(plan: { id: string; steps: Array<{ id: string; label: string }> }): void {
    this._plan = {
      id: plan.id,
      steps: plan.steps.map(s => ({ ...s, state: 'pending' as StepState })),
    };
  }

  updateStep(stepId: string, state: StepState, meta?: { startedAt?: number; completedAt?: number; error?: string; messageId?: string }): void {
    if (!this._plan) {
      return;
    }
    const step = this._plan.steps.find(s => s.id === stepId);
    if (!step) {
      return;
    }
    step.state = state;
    if (meta?.startedAt !== undefined) { step.startedAt = meta.startedAt; }
    if (meta?.completedAt !== undefined) { step.completedAt = meta.completedAt; }
    if (meta?.error !== undefined) { step.error = meta.error; }
    if (meta?.messageId !== undefined) { step.messageId = meta.messageId; }
  }

  addInput(entry: Omit<InputEntry, 'count'>): void {
    const existing = this._inputs.find(e => e.path === entry.path);
    if (existing) {
      existing.count++;
      return;
    }
    this._inputs.push({ ...entry, count: 1 });
  }

  addOutput(entry: OutputEntry): void {
    // Update if same path already exists (re-write of same file)
    const existing = this._outputs.find(e => e.path === entry.path);
    if (existing) {
      existing.size = entry.size;
      existing.action = 'modified';
      return;
    }
    this._outputs.push(entry);
  }

  trackToolCall(toolCallId: string, toolName: string, serverName: string): void {
    this._toolCalls.set(toolCallId, { toolName, serverName });
  }

  getToolInfo(toolCallId: string): { toolName: string; serverName: string } | undefined {
    return this._toolCalls.get(toolCallId);
  }

  clear(): void {
    this._plan = null;
    this._inputs = [];
    this._outputs = [];
    this._toolCalls.clear();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/ui/src/browser/infoPanelState.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/browser/infoPanel/infoPanelState.ts packages/ui/src/browser/infoPanel/infoPanelState.test.ts
git commit -m "feat(ui): add InfoPanelState model and tool classification helpers"
```

## Chunk 2: Section Widgets

### Task 3: ProgressSection widget

**Files:**
- Create: `packages/ui/src/browser/infoPanel/progressSection.ts`
- Test: `packages/ui/src/browser/infoPanel/progressSection.test.ts`

- [ ] **Step 1: Write test for ProgressSection**

Create `packages/ui/src/browser/infoPanel/progressSection.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ProgressSection } from './progressSection.js';
import type { PlanState } from '../infoPanelState.js';

// Minimal DOM shim — Vitest with jsdom
describe('ProgressSection', () => {
  let section: ProgressSection;

  beforeEach(() => {
    section = new ProgressSection();
  });

  it('is hidden when no plan is set', () => {
    expect(section.getDomNode().style.display).toBe('none');
  });

  it('shows when a plan is set', () => {
    section.setPlan({
      id: 'p1',
      steps: [
        { id: 's1', label: 'Fetch', state: 'completed' },
        { id: 's2', label: 'Analyze', state: 'active' },
        { id: 's3', label: 'Draft', state: 'pending' },
      ],
    });
    expect(section.getDomNode().style.display).not.toBe('none');
  });

  it('renders correct number of step elements for short plan', () => {
    section.setPlan({
      id: 'p1',
      steps: [
        { id: 's1', label: 'Fetch', state: 'pending' },
        { id: 's2', label: 'Analyze', state: 'pending' },
      ],
    });
    const steps = section.getDomNode().querySelectorAll('.info-step');
    expect(steps.length).toBe(2);
  });

  it('collapses completed steps when plan has >4 steps', () => {
    const steps = Array.from({ length: 8 }, (_, i) => ({
      id: `s${i}`, label: `Step ${i}`, state: (i < 5 ? 'completed' : i === 5 ? 'active' : 'pending') as PlanState['steps'][0]['state'],
    }));
    section.setPlan({ id: 'p1', steps });
    const summary = section.getDomNode().querySelector('.info-step-summary');
    expect(summary).not.toBeNull();
    expect(summary!.textContent).toContain('5 steps completed');
  });

  it('shows progress bar for long plans', () => {
    const steps = Array.from({ length: 6 }, (_, i) => ({
      id: `s${i}`, label: `Step ${i}`, state: (i < 3 ? 'completed' : i === 3 ? 'active' : 'pending') as PlanState['steps'][0]['state'],
    }));
    section.setPlan({ id: 'p1', steps });
    const bar = section.getDomNode().querySelector('.info-progress-bar');
    expect(bar).not.toBeNull();
  });

  it('emits onDidClickStep with messageId when a step is clicked', () => {
    let clickedMsgId = '';
    section.onDidClickStep(msgId => { clickedMsgId = msgId; });
    section.setPlan({
      id: 'p1',
      steps: [
        { id: 's1', label: 'Fetch', state: 'completed', messageId: 'msg-1' },
        { id: 's2', label: 'Analyze', state: 'active' },
      ],
    });
    const stepEl = section.getDomNode().querySelector('[data-step-id="s1"]') as HTMLElement;
    stepEl?.click();
    expect(clickedMsgId).toBe('msg-1');
  });

  it('does not emit onDidClickStep for steps without messageId', () => {
    let emitted = false;
    section.onDidClickStep(() => { emitted = true; });
    section.setPlan({
      id: 'p1',
      steps: [
        { id: 's1', label: 'Fetch', state: 'active' }, // no messageId
      ],
    });
    const stepEl = section.getDomNode().querySelector('[data-step-id="s1"]') as HTMLElement;
    stepEl?.click();
    expect(emitted).toBe(false);
  });

  it('disposes cleanly', () => {
    section.dispose();
    // No error on double dispose
    section.dispose();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/ui/src/browser/infoPanel/progressSection.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement ProgressSection**

Create `packages/ui/src/browser/infoPanel/progressSection.ts`. This widget:
- Extends `Widget`
- Renders a collapsible section header ("Progress")
- Renders the smart-collapse stepper: collapsed completed summary, visible active+next 2, collapsed remaining, progress bar
- Emits `onDidClickStep(messageId: string)` when a step with a messageId is clicked
- `setPlan(plan: PlanState)` and `updateStep(stepId, state, meta)` methods for external updates
- Hidden (display:none) when no plan
- Uses `h()` helper and `_register()` for all listeners
- ARIA: `role="list"`, `role="listitem"`, `aria-current="step"`, `aria-live="polite"` for announcements

Reference `ChatCollapsible` pattern at `packages/ui/src/browser/chatCollapsible.ts` for collapsible section structure. Reference `Widget` at `packages/ui/src/browser/widget.ts` for base class.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/ui/src/browser/infoPanel/progressSection.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/browser/infoPanel/
git commit -m "feat(ui): add ProgressSection widget with smart collapse stepper"
```

### Task 4: InputSection widget

**Files:**
- Create: `packages/ui/src/browser/infoPanel/inputSection.ts`
- Test: `packages/ui/src/browser/infoPanel/inputSection.test.ts`

- [ ] **Step 1: Write test for InputSection**

Create `packages/ui/src/browser/infoPanel/inputSection.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { InputSection } from './inputSection.js';

describe('InputSection', () => {
  let section: InputSection;

  beforeEach(() => {
    section = new InputSection();
  });

  it('is hidden when no inputs', () => {
    expect(section.getDomNode().style.display).toBe('none');
  });

  it('shows after adding an input', () => {
    section.addEntry({ name: 'data.csv', path: '/tmp/data.csv', messageId: 'msg-1', kind: 'file', count: 1 });
    expect(section.getDomNode().style.display).not.toBe('none');
  });

  it('renders file entries with file icon', () => {
    section.addEntry({ name: 'data.csv', path: '/tmp/data.csv', messageId: 'msg-1', kind: 'file', count: 1 });
    const entry = section.getDomNode().querySelector('.info-entry');
    expect(entry).not.toBeNull();
    expect(entry!.querySelector('.info-entry-name')!.textContent).toBe('data.csv');
  });

  it('renders tool entries with tool icon', () => {
    section.addEntry({ name: 'google-sheets / getCellRange', path: 'google-sheets/getCellRange', messageId: 'msg-2', kind: 'tool', count: 1 });
    const entry = section.getDomNode().querySelector('.info-entry');
    expect(entry!.classList.contains('info-entry--tool')).toBe(true);
  });

  it('updates count badge on duplicate', () => {
    section.addEntry({ name: 'data.csv', path: '/tmp/data.csv', messageId: 'msg-1', kind: 'file', count: 1 });
    section.updateCount('/tmp/data.csv', 3);
    const badge = section.getDomNode().querySelector('.info-entry-count');
    expect(badge!.textContent).toBe('3');
  });

  it('emits onDidClickEntry when entry clicked', () => {
    let clickedMsgId = '';
    section.onDidClickEntry(msgId => { clickedMsgId = msgId; });
    section.addEntry({ name: 'data.csv', path: '/tmp/data.csv', messageId: 'msg-1', kind: 'file', count: 1 });
    const entry = section.getDomNode().querySelector('.info-entry') as HTMLElement;
    entry?.click();
    expect(clickedMsgId).toBe('msg-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/ui/src/browser/infoPanel/inputSection.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement InputSection**

Create `packages/ui/src/browser/infoPanel/inputSection.ts`. This widget:
- Extends `Widget`
- Collapsible section header ("Input")
- Renders chronological list of `InputEntry` items
- Each entry: icon (file or gear for tool), name, optional count badge
- Click emits `onDidClickEntry(messageId: string)`
- `addEntry(entry: InputEntry)` and `updateCount(path: string, count: number)` methods
- Hidden when empty, shows on first entry
- ARIA: `role="region"`, entries are focusable buttons with `aria-label`

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/ui/src/browser/infoPanel/inputSection.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/browser/infoPanel/inputSection.ts packages/ui/src/browser/infoPanel/inputSection.test.ts
git commit -m "feat(ui): add InputSection widget for info panel"
```

### Task 5: OutputSection widget

**Files:**
- Create: `packages/ui/src/browser/infoPanel/outputSection.ts`
- Test: `packages/ui/src/browser/infoPanel/outputSection.test.ts`

- [ ] **Step 1: Write test for OutputSection**

Create `packages/ui/src/browser/infoPanel/outputSection.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { OutputSection } from './outputSection.js';

describe('OutputSection', () => {
  let section: OutputSection;

  beforeEach(() => {
    section = new OutputSection();
  });

  it('is hidden when no outputs', () => {
    expect(section.getDomNode().style.display).toBe('none');
  });

  it('shows after adding an output', () => {
    section.addEntry({ name: 'report.pdf', path: '/tmp/report.pdf', size: 156000, action: 'created', messageId: 'msg-1' });
    expect(section.getDomNode().style.display).not.toBe('none');
  });

  it('renders entry with filename, size, and new badge', () => {
    section.addEntry({ name: 'report.pdf', path: '/tmp/report.pdf', size: 156000, action: 'created', messageId: 'msg-1' });
    const entry = section.getDomNode().querySelector('.info-entry');
    expect(entry!.querySelector('.info-entry-name')!.textContent).toBe('report.pdf');
    expect(entry!.querySelector('.info-entry-size')!.textContent).toBe('152 KB');
    expect(entry!.querySelector('.info-entry-badge')!.textContent).toBe('new');
  });

  it('shows edited badge for modified files', () => {
    section.addEntry({ name: 'config.json', path: '/tmp/config.json', size: 1024, action: 'modified', messageId: 'msg-2' });
    const badge = section.getDomNode().querySelector('.info-entry-badge');
    expect(badge!.textContent).toBe('edited');
    expect(badge!.classList.contains('info-entry-badge--edited')).toBe(true);
  });

  it('updates existing entry when same path is written again', () => {
    section.addEntry({ name: 'report.pdf', path: '/tmp/report.pdf', size: 100000, action: 'created', messageId: 'msg-1' });
    section.addEntry({ name: 'report.pdf', path: '/tmp/report.pdf', size: 200000, action: 'modified', messageId: 'msg-3' });
    const entries = section.getDomNode().querySelectorAll('.info-entry');
    expect(entries.length).toBe(1);
    expect(entries[0].querySelector('.info-entry-size')!.textContent).toBe('195 KB');
    expect(entries[0].querySelector('.info-entry-badge')!.textContent).toBe('edited');
  });

  it('emits onDidClickEntry with messageId', () => {
    let clickedMsgId = '';
    section.onDidClickEntry(msgId => { clickedMsgId = msgId; });
    section.addEntry({ name: 'report.pdf', path: '/tmp/report.pdf', size: 156000, action: 'created', messageId: 'msg-1' });
    const nameEl = section.getDomNode().querySelector('.info-entry-name') as HTMLElement;
    nameEl?.click();
    expect(clickedMsgId).toBe('msg-1');
  });

  it('emits onDidRequestReveal with path', () => {
    let revealedPath = '';
    section.onDidRequestReveal(p => { revealedPath = p; });
    section.addEntry({ name: 'report.pdf', path: '/tmp/report.pdf', size: 156000, action: 'created', messageId: 'msg-1' });
    const revealBtn = section.getDomNode().querySelector('.info-entry-reveal') as HTMLElement;
    revealBtn?.click();
    expect(revealedPath).toBe('/tmp/report.pdf');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/ui/src/browser/infoPanel/outputSection.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement OutputSection**

Create `packages/ui/src/browser/infoPanel/outputSection.ts`. This widget:
- Extends `Widget`
- Collapsible section header ("Output")
- Renders chronological list of `OutputEntry` items
- Each entry: file icon, filename (truncated, tooltip), size (formatted), badge ("new"/"edited"), reveal icon
- Click filename emits `onDidClickEntry(messageId: string)`
- Click reveal icon emits `onDidRequestReveal(path: string)`
- `addEntry(entry: OutputEntry)` — deduplicates by path, updates size/action on re-write
- Hidden when empty
- Uses `formatFileSize` from `infoPanelState.ts`

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/ui/src/browser/infoPanel/outputSection.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/browser/infoPanel/outputSection.ts packages/ui/src/browser/infoPanel/outputSection.test.ts
git commit -m "feat(ui): add OutputSection widget for info panel"
```

## Chunk 3: InfoPanel Shell & Workbench Wiring

### Task 6: InfoPanel composite widget

**Files:**
- Create: `packages/ui/src/browser/infoPanel/infoPanel.ts`
- Test: `packages/ui/src/browser/infoPanel/infoPanel.test.ts`

- [ ] **Step 1: Write test for InfoPanel**

Create `packages/ui/src/browser/infoPanel/infoPanel.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { InfoPanel } from './infoPanel.js';

describe('InfoPanel', () => {
  let panel: InfoPanel;

  beforeEach(() => {
    panel = new InfoPanel();
  });

  it('renders three section containers', () => {
    const root = panel.getDomNode();
    expect(root.classList.contains('info-panel')).toBe(true);
    expect(root.querySelector('.info-panel-progress')).not.toBeNull();
    expect(root.querySelector('.info-panel-input')).not.toBeNull();
    expect(root.querySelector('.info-panel-output')).not.toBeNull();
  });

  it('shows empty state when no data', () => {
    const emptyMsg = panel.getDomNode().querySelector('.info-panel-empty');
    expect(emptyMsg).not.toBeNull();
    expect(emptyMsg!.textContent).toContain('Panel will populate');
  });

  it('hides empty state after receiving plan event', () => {
    panel.handleEvent({
      type: 'plan_created',
      plan: { id: 'p1', steps: [{ id: 's1', label: 'Do thing' }, { id: 's2', label: 'Other' }] },
    });
    const emptyMsg = panel.getDomNode().querySelector('.info-panel-empty');
    expect(emptyMsg!.style.display).toBe('none');
  });

  it('manages per-conversation state', () => {
    panel.setConversation('conv-1');
    panel.handleEvent({
      type: 'attachment_added',
      attachment: { name: 'f.csv', path: '/f.csv', source: 'drag-drop' },
      messageId: 'msg-1',
    });

    // Switch to different conversation
    panel.setConversation('conv-2');
    // conv-2 should have no inputs
    const inputSection = panel.getDomNode().querySelector('.info-panel-input');
    expect(inputSection!.querySelectorAll('.info-entry').length).toBe(0);

    // Switch back — state restored
    panel.setConversation('conv-1');
    expect(inputSection!.querySelectorAll('.info-entry').length).toBe(1);
  });

  it('has correct ARIA attributes', () => {
    const root = panel.getDomNode();
    expect(root.getAttribute('role')).toBe('complementary');
    expect(root.getAttribute('aria-label')).toBe('Task info');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/ui/src/browser/infoPanel/infoPanel.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement InfoPanel**

Create `packages/ui/src/browser/infoPanel/infoPanel.ts`. This widget:
- Extends `Widget`
- Creates child `ProgressSection`, `InputSection`, `OutputSection` via `_register()`
- `handleEvent(event: AgentEvent)` — dispatches to sections based on event type:
  - `plan_created` → `ProgressSection.setPlan()`, auto-show panel
  - `plan_step_updated` → `ProgressSection.updateStep()`
  - `tool_call_start` → (1) always call `state.trackToolCall(id, toolName, serverName)` to track the mapping; (2) classify with `isInputTool(toolName, serverName)`, if match, use `extractInputName(toolName, serverName, args)` for display name, add to InputSection
  - `tool_call_result` → if `fileMeta` is present, this is an output — add to OutputSection using fileMeta fields. (No need for `isOutputTool` on results — `fileMeta` presence is the signal. `isOutputTool` is only used if we need to classify `tool_call_start` events for preview purposes.)
  - `attachment_added` → add to InputSection
- `setConversation(id: string | null)` — saves current state, loads state for new conversation from `Map<string, InfoPanelState>`
- Emits `onDidRequestScrollToMessage(messageId: string)` — aggregated from child section click events
- Emits `onDidRequestRevealFile(path: string)` — from OutputSection
- Empty state message shown/hidden based on whether any section has data
- ARIA: `role="complementary"`, `aria-label="Task info"`

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/ui/src/browser/infoPanel/infoPanel.test.ts`
Expected: PASS

- [ ] **Step 5: Create barrel export**

Create `packages/ui/src/browser/infoPanel/index.ts`:

```typescript
export { InfoPanel } from './infoPanel.js';
export { ProgressSection } from './progressSection.js';
export { InputSection } from './inputSection.js';
export { OutputSection } from './outputSection.js';
```

- [ ] **Step 6: Add InfoPanel to UI package exports**

In `packages/ui/src/index.ts`, add:

```typescript
export { InfoPanel } from './browser/infoPanel/index.js';
```

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/browser/infoPanel/ packages/ui/src/index.ts
git commit -m "feat(ui): add InfoPanel composite widget with per-conversation state"
```

### Task 7: Workbench wiring — layout, events, keyboard shortcut

**Files:**
- Modify: `packages/ui/src/browser/workbench.ts`
- Modify: `packages/ui/src/browser/chatPanel.ts` (add `scrollToMessage` method)

- [ ] **Step 1: Add data-message-id attributes to ChatPanel message elements**

In `packages/ui/src/browser/chatPanel.ts`, find where `.chat-message` elements are created (in the message rendering code). Add `data-message-id` attribute to each message element:

```typescript
messageEl.setAttribute('data-message-id', message.id);
```

Search for all `chat-message` element creation points (user messages, assistant messages) and ensure each one gets this attribute.

- [ ] **Step 2: Add scrollToMessage to ChatPanel**

In `packages/ui/src/browser/chatPanel.ts`, add a public method:

```typescript
scrollToMessage(messageId: string): void {
  const msgEl = this._messageListEl.querySelector(`[data-message-id="${messageId}"]`) as HTMLElement | null;
  if (msgEl) {
    msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    msgEl.classList.add('chat-message--highlighted');
    setTimeout(() => msgEl.classList.remove('chat-message--highlighted'), 2000);
  }
}
```

- [ ] **Step 3: Add SHELL_SHOW_ITEM_IN_FOLDER IPC channel**

In `packages/platform/src/ipc/common/ipc.ts`, add to `IPC_CHANNELS`:

```typescript
SHELL_SHOW_ITEM_IN_FOLDER: 'shell:showItemInFolder',
```

In `packages/electron/src/main/mainProcess.ts`, add the IPC handler (near the other shell/file handlers):

```typescript
ipcMain.handle(IPC_CHANNELS.SHELL_SHOW_ITEM_IN_FOLDER, async (_event, args: { path: string }) => {
  const { shell } = require('electron');
  shell.showItemInFolder(args.path);
});
```

- [ ] **Step 4: Wire InfoPanel into Workbench**

In `packages/ui/src/browser/workbench.ts`:

1. Import `InfoPanel` from `./infoPanel/index.js`
2. Add fields: `private _infoPanel!: InfoPanel;`, `private _infoPanelEl!: HTMLElement;`, `private _infoPanelVisible = false;`, `private _userCollapsedInfoPanel = false;`
3. In `render()`, after creating `chatPanelContainer`:
   - Create info panel resize handle element with mouse-drag resize behavior (copy the sidebar resize handle pattern from lines 64-91, but adjusting for right-side resize: `newWidth = startWidth - (e.clientX - startX)`, clamped to 160-480px range)
   - Create info panel container `div.info-panel-container`
   - Create `InfoPanel`, register it, append to container
   - Append resize handle + container to `layout.main`
   - Start with `_infoPanelEl.style.display = 'none'` (hidden by default)
4. Subscribe to `AGENT_EVENT` in Workbench and forward to InfoPanel:
   - Keep ChatPanel's existing IPC subscription unchanged (simpler, less refactoring)
   - Add a separate Workbench subscription: `this._ipc.on(IPC_CHANNELS.AGENT_EVENT, (...args) => { const event = args[0] as AgentEvent; this._infoPanel.handleEvent(event); })`
   - When InfoPanel receives `plan_created`, call `this._autoShowInfoPanel()` (wired via a callback or event)
5. Wire InfoPanel events:
   - `_infoPanel.onDidRequestScrollToMessage(msgId => this._chatPanel.scrollToMessage(msgId))`
   - `_infoPanel.onDidRequestRevealFile(path => this._ipc.invoke(IPC_CHANNELS.SHELL_SHOW_ITEM_IN_FOLDER, { path }))`
   - `_infoPanel.onDidPlanCreated(() => this._autoShowInfoPanel())` — emitted by InfoPanel when it processes a `plan_created` event
6. Wire conversation switching: when ChatPanel loads a conversation, call `this._infoPanel.setConversation(conversationId)` and reset `this._userCollapsedInfoPanel = false`. Update `_createNewConversation` and `onDidSelectConversation` handlers.
7. Hide panel when switching to settings view (alongside existing sidebar/chat hiding).

- [ ] **Step 5: Emit attachment_added events from ChatPanel**

In `packages/ui/src/browser/chatPanel.ts`, when a file is attached (via `addAttachment` or drag-drop), emit an `attachment_added` event through the IPC channel so InfoPanel can pick it up. Find the `addAttachment` method and the drag-drop handler, and add:

```typescript
this._ipc.send(IPC_CHANNELS.AGENT_EVENT, {
  type: 'attachment_added',
  attachment: { name: file.displayName, path: file.path, source },
  messageId: this._currentAssistantMessage?.id ?? '',
} satisfies AgentEvent);
```

Where `source` is `'files-panel'` for attach button clicks and `'drag-drop'` for drag events.

- [ ] **Step 6: Add keyboard shortcut Cmd+Shift+B**

In `_setupShortcuts()`, add:

```typescript
this._shortcuts.bind({
  key: 'b',
  meta: true,
  shift: true,
  handler: () => this._toggleInfoPanel(),
});
```

Add visibility management methods. Use two flags: `_infoPanelVisible` (current display state) and `_userCollapsedInfoPanel` (whether user explicitly collapsed it):

```typescript
private _infoPanelVisible = false;
private _userCollapsedInfoPanel = false;

private _toggleInfoPanel(): void {
  if (this._infoPanelVisible) {
    this._hideInfoPanel();
    this._userCollapsedInfoPanel = true;
  } else {
    this._showInfoPanel();
    this._userCollapsedInfoPanel = false;
  }
}

private _showInfoPanel(): void {
  this._infoPanelVisible = true;
  this._infoPanelEl.style.display = '';
}

private _hideInfoPanel(): void {
  this._infoPanelVisible = false;
  this._infoPanelEl.style.display = 'none';
}

// Called when InfoPanel receives plan_created — auto-show unless user explicitly collapsed
private _autoShowInfoPanel(): void {
  if (!this._userCollapsedInfoPanel) {
    this._showInfoPanel();
  }
}
```

Reset `_userCollapsedInfoPanel = false` when switching to a new conversation (in `_createNewConversation` and `onDidSelectConversation`).

- [ ] **Step 7: Verify build compiles**

Run: `npx turbo build`
Expected: Clean compilation.

- [ ] **Step 8: Commit**

```bash
git add packages/ui/src/browser/workbench.ts packages/ui/src/browser/chatPanel.ts packages/platform/src/ipc/common/ipc.ts packages/electron/src/main/mainProcess.ts
git commit -m "feat(ui): wire InfoPanel into Workbench layout with keyboard shortcut"
```

## Chunk 4: CSS & Visual Polish

### Task 8: Info panel CSS styles

**Files:**
- Modify: `apps/desktop/src/renderer/styles.css`

- [ ] **Step 1: Add info panel layout CSS**

Add to `apps/desktop/src/renderer/styles.css`:

```css
/* --- Info Panel --- */

.info-panel-container {
  width: 280px;
  min-width: 160px;
  max-width: 480px;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  border-left: 1px solid var(--border-color, #333);
  background: var(--sidebar-bg, #1e1e2e);
  transition: width 200ms ease-out;
}

.info-panel {
  flex: 1;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.info-panel-empty {
  color: var(--text-muted, #666);
  font-size: 12px;
  text-align: center;
  padding: 24px 12px;
}

/* Info panel resize handle */
.info-panel-resize-handle {
  width: 4px;
  cursor: col-resize;
  background: transparent;
  flex-shrink: 0;
}
.info-panel-resize-handle:hover {
  background: var(--accent-color, #4a6cf7);
}
```

- [ ] **Step 2: Add section header CSS**

```css
/* Section headers (shared by all three sections) */
.info-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  cursor: pointer;
  user-select: none;
}
.info-section-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--text-secondary, #ccc);
}
.info-section-chevron {
  width: 14px;
  height: 14px;
  color: var(--text-muted, #666);
  transition: transform 200ms ease-out;
}
.info-section.collapsed .info-section-chevron {
  transform: rotate(-90deg);
}
.info-section-body {
  overflow: hidden;
  transition: max-height 200ms ease-out;
}
.info-section.collapsed .info-section-body {
  max-height: 0;
}
```

- [ ] **Step 3: Add stepper CSS (Progress section)**

```css
/* Progress stepper */
.info-step {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.info-step-track {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.info-step-circle {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 10px;
}
.info-step-circle--completed {
  background: var(--success-muted, #2d5a3d);
  color: var(--success-fg, #4ade80);
}
.info-step-circle--active {
  background: var(--accent-color, #4a6cf7);
  animation: info-pulse 1.5s infinite;
}
.info-step-circle--pending {
  border: 2px solid var(--border-color, #444);
  background: transparent;
}
.info-step-circle--failed {
  background: var(--error-muted, #5a2d2d);
  color: var(--error-fg, #f87171);
}
.info-step-line {
  width: 2px;
  min-height: 16px;
  flex: 1;
}
.info-step-line--completed { background: var(--success-muted, #2d5a3d); }
.info-step-line--pending { background: var(--border-color, #444); }

.info-step-label {
  padding: 2px 0 8px;
  font-size: 12px;
  color: var(--text-primary, #e0e0e0);
  cursor: pointer;
}
.info-step-label--completed { color: var(--text-muted, #777); }
.info-step-label--active { font-weight: 600; }
.info-step-label--pending { color: var(--text-muted, #555); }

/* Collapsed step summary */
.info-step-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--surface-bg, #252540);
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-muted, #888);
  margin-bottom: 8px;
}
.info-step-summary:hover {
  background: var(--surface-hover, #2a2a50);
}

/* Progress bar */
.info-progress-bar-container {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color, #333);
  font-size: 10px;
  color: var(--text-muted, #888);
}
.info-progress-bar {
  flex: 1;
  height: 4px;
  background: var(--border-color, #333);
  border-radius: 2px;
  overflow: hidden;
}
.info-progress-bar-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--accent-color, #4a6cf7);
  transition: width 300ms ease-out;
}

@keyframes info-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

- [ ] **Step 4: Add entry CSS (Input/Output sections)**

```css
/* Entry items (shared Input/Output) */
.info-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: var(--surface-bg, #252540);
  border-radius: 6px;
  margin-bottom: 4px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-primary, #e0e0e0);
}
.info-entry:hover {
  background: var(--surface-hover, #2a2a50);
}
.info-entry:focus-visible {
  outline: 2px solid var(--accent-color, #4a6cf7);
  outline-offset: -2px;
}
.info-entry-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--accent-color, #4a6cf7);
}
.info-entry--tool .info-entry-icon {
  color: var(--warning-fg, #e5c07b);
}
.info-entry-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.info-entry-size {
  font-size: 10px;
  color: var(--text-muted, #666);
  flex-shrink: 0;
}
.info-entry-count {
  font-size: 9px;
  color: var(--text-muted, #666);
  background: var(--border-color, #333);
  padding: 1px 6px;
  border-radius: 3px;
  flex-shrink: 0;
}
.info-entry-badge {
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 3px;
  flex-shrink: 0;
  background: var(--success-muted, #2d5a3d);
  color: var(--success-fg, #4ade80);
}
.info-entry-badge--edited {
  background: var(--accent-muted, #2d3a5a);
  color: var(--accent-color, #4a6cf7);
}
.info-entry-reveal {
  width: 14px;
  height: 14px;
  color: var(--text-muted, #666);
  cursor: pointer;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 150ms;
}
.info-entry:hover .info-entry-reveal {
  opacity: 1;
}

/* Chat message highlight (for scroll-to-message) */
.chat-message--highlighted {
  background: var(--accent-muted, #2d3a5a);
  transition: background 2s ease-out;
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .info-step-circle--active { animation: none; }
  .info-panel-container { transition: none; }
  .info-section-body { transition: none; }
  .info-progress-bar-fill { transition: none; }
}
```

- [ ] **Step 5: Adjust workbench-main layout for info panel**

Verify `.workbench-main` is `display: flex` (it already is at line 120-124). The chat container and info panel container will be flex children. The chat container keeps `flex: 1` and `max-width: 900px` but remove `margin: 0 auto` — instead use `justify-content: center` on `.workbench-main` when info panel is hidden, and `justify-content: flex-start` when visible. Or simpler: keep the current centering and let the info panel sit to the right naturally.

Check that the layout works: `.workbench-main { display: flex; }` → `.workbench-chat-container { flex: 1; }` → `.info-panel-resize-handle` → `.info-panel-container { width: 280px; }`.

- [ ] **Step 6: Build and verify**

Run: `npx turbo build`
Expected: Clean.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/renderer/styles.css
git commit -m "feat(ui): add CSS styles for info panel, stepper, and entry items"
```

## Chunk 5: Integration Test & E2E Smoke Test

### Task 9: Integration test — InfoPanel event handling

**Files:**
- Create: `tests/integration/infoPanel.test.ts`

- [ ] **Step 1: Write integration test**

Create `tests/integration/infoPanel.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { InfoPanel } from '../../packages/ui/src/browser/infoPanel/infoPanel.js';
import type { AgentEvent } from '@gho-work/base';

/**
 * Integration test: verifies InfoPanel correctly processes a realistic
 * sequence of AgentEvents and updates its DOM state.
 */
describe('InfoPanel integration', () => {
  let panel: InfoPanel;

  beforeEach(() => {
    panel = new InfoPanel();
    panel.setConversation('conv-1');
  });

  it('processes a full agent task lifecycle', () => {
    const events: AgentEvent[] = [
      // Agent creates a plan
      {
        type: 'plan_created',
        plan: {
          id: 'plan-1',
          steps: [
            { id: 's1', label: 'Read input file' },
            { id: 's2', label: 'Analyze data' },
            { id: 's3', label: 'Generate report' },
          ],
        },
      },
      // Step 1 starts
      { type: 'plan_step_updated', planId: 'plan-1', stepId: 's1', state: 'active', startedAt: 1000 },
      // Agent reads a file (input)
      {
        type: 'tool_call_start',
        toolCall: {
          id: 'tc-1', messageId: 'msg-1', toolName: 'readFile', serverName: '',
          arguments: { path: '/data/input.csv' },
          permission: 'allow_once', status: 'executing', timestamp: 1000,
        },
      },
      // User attached a file
      {
        type: 'attachment_added',
        attachment: { name: 'budget.xlsx', path: '/home/user/budget.xlsx', source: 'drag-drop' },
        messageId: 'msg-2',
      },
      // Step 1 completes
      { type: 'plan_step_updated', planId: 'plan-1', stepId: 's1', state: 'completed', completedAt: 2000, messageId: 'msg-1' },
      // Step 2 active
      { type: 'plan_step_updated', planId: 'plan-1', stepId: 's2', state: 'active', startedAt: 2000 },
      // Step 2 completes
      { type: 'plan_step_updated', planId: 'plan-1', stepId: 's2', state: 'completed', completedAt: 3000, messageId: 'msg-3' },
      // Step 3 active — agent writes a file
      { type: 'plan_step_updated', planId: 'plan-1', stepId: 's3', state: 'active', startedAt: 3000 },
      {
        type: 'tool_call_result',
        toolCallId: 'tc-2',
        result: { success: true, content: 'File written' },
        fileMeta: { path: '/data/report.pdf', size: 156000, action: 'created' },
      },
      // Step 3 completes
      { type: 'plan_step_updated', planId: 'plan-1', stepId: 's3', state: 'completed', completedAt: 4000, messageId: 'msg-4' },
    ];

    for (const event of events) {
      panel.handleEvent(event);
    }

    const root = panel.getDomNode();

    // Progress: all 3 steps completed
    const completedSteps = root.querySelectorAll('.info-step-circle--completed');
    expect(completedSteps.length).toBe(3);

    // Input: 2 entries (readFile + attachment)
    const inputEntries = root.querySelectorAll('.info-panel-input .info-entry');
    expect(inputEntries.length).toBe(2);

    // Output: 1 entry (report.pdf)
    const outputEntries = root.querySelectorAll('.info-panel-output .info-entry');
    expect(outputEntries.length).toBe(1);
    expect(outputEntries[0].querySelector('.info-entry-name')!.textContent).toBe('report.pdf');

    // Empty state hidden
    expect(root.querySelector('.info-panel-empty')!.style.display).toBe('none');
  });

  it('handles tool_call_start for MCP tools as input', () => {
    panel.handleEvent({
      type: 'tool_call_start',
      toolCall: {
        id: 'tc-mcp', messageId: 'msg-5', toolName: 'getCellRange', serverName: 'google-sheets',
        arguments: {}, permission: 'allow_once', status: 'executing', timestamp: 5000,
      },
    });

    const inputEntries = panel.getDomNode().querySelectorAll('.info-panel-input .info-entry');
    expect(inputEntries.length).toBe(1);
    expect(inputEntries[0].querySelector('.info-entry-name')!.textContent).toBe('google-sheets / getCellRange');
  });

  it('ignores tool_call_result without fileMeta for output', () => {
    panel.handleEvent({
      type: 'tool_call_result',
      toolCallId: 'tc-3',
      result: { success: true, content: 'some text response' },
    });

    const outputEntries = panel.getDomNode().querySelectorAll('.info-panel-output .info-entry');
    expect(outputEntries.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run tests/integration/infoPanel.test.ts`
Expected: PASS (depends on all previous tasks being complete).

- [ ] **Step 3: Commit**

```bash
git add tests/integration/infoPanel.test.ts
git commit -m "test: add InfoPanel integration test for full agent lifecycle"
```

### Task 10: Playwright E2E smoke test

**Files:**
- Create: `tests/e2e/infoPanel.spec.ts`

- [ ] **Step 1: Write E2E test**

Create `tests/e2e/infoPanel.spec.ts`. This test:
1. Launches the Electron app
2. Toggles info panel with `Cmd+Shift+B` — verifies it appears
3. Sends a message that triggers a plan (if mock mode can emit plan events, otherwise verify the panel container renders and responds to keyboard shortcut)
4. Verifies the info panel DOM structure: `.info-panel`, three section containers
5. Toggles again — verifies it hides
6. Takes screenshots at each checkpoint for verification

Reference existing E2E tests in `tests/e2e/` for the app launch pattern and Playwright Electron setup.

Follow the existing E2E pattern from `tests/e2e/app-launches.spec.ts`:

```typescript
import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

const appPath = resolve(__dirname, '../../apps/desktop');

// Pre-seed onboarding-complete so the workbench loads directly
const userDataDir = resolve(__dirname, '../../.e2e-userdata-infopanel');
mkdirSync(userDataDir, { recursive: true });
writeFileSync(resolve(userDataDir, 'onboarding-complete.json'), '{"complete":true}');

let electronApp: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: [resolve(appPath, 'out/main/index.js')],
    cwd: appPath,
    env: { ...process.env, GHO_USER_DATA_DIR: userDataDir },
  });
  page = await electronApp.firstWindow();
});

test.afterAll(async () => {
  await electronApp.close();
});

test.describe('Info Panel', () => {
  test('starts hidden', async () => {
    await expect(page.locator('.workbench')).toBeVisible();
    const panelContainer = page.locator('.info-panel-container');
    await expect(panelContainer).toBeHidden();
  });

  test('toggles visibility with Cmd+Shift+B', async () => {
    const panelContainer = page.locator('.info-panel-container');

    // Toggle on
    await page.keyboard.press('Meta+Shift+b');
    await expect(panelContainer).toBeVisible();

    // Has correct structure
    await expect(page.locator('.info-panel')).toBeVisible();
    await expect(page.locator('.info-panel-empty')).toBeVisible();

    await page.screenshot({ path: 'tests/e2e/screenshots/info-panel-visible.png' });

    // Toggle off
    await page.keyboard.press('Meta+Shift+b');
    await expect(panelContainer).toBeHidden();

    await page.screenshot({ path: 'tests/e2e/screenshots/info-panel-hidden.png' });
  });

  test('has correct ARIA attributes', async () => {
    await page.keyboard.press('Meta+Shift+b');
    const panel = page.locator('.info-panel');
    await expect(panel).toHaveAttribute('role', 'complementary');
    await expect(panel).toHaveAttribute('aria-label', 'Task info');
    await page.keyboard.press('Meta+Shift+b'); // close
  });
});
```

- [ ] **Step 2: Build and run E2E test**

Run:
```bash
npx turbo build
npx playwright test tests/e2e/infoPanel.spec.ts
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/infoPanel.spec.ts
git commit -m "test: add Playwright E2E test for info panel toggle"
```

### Task 11: HARD GATE — Launch app and verify

- [ ] **Step 1: Build the app**

Run: `npx turbo build`

- [ ] **Step 2: Launch the app**

Run: `npm run desktop:dev`

- [ ] **Step 3: Verify info panel**

1. Press `Cmd+Shift+B` — info panel should appear on the right
2. Verify it shows the "Panel will populate as the agent works" empty state
3. Verify panel is resizable (drag the left edge)
4. Press `Cmd+Shift+B` again — panel should hide
5. Verify no console errors related to InfoPanel

- [ ] **Step 4: Take self-verification screenshot**

Write a temp Playwright script that launches the app, toggles the panel, takes screenshots. View with Read tool to confirm visually.

- [ ] **Step 5: Commit final state**

Only if there are outstanding changes not committed by earlier tasks:

```bash
git status
# Stage specific modified files, not git add -A
git commit -m "feat: info panel — final polish and verification"
```
