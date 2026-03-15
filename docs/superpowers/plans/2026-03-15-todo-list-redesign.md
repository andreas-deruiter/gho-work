# Todo List Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the non-functional plan-event-based ProgressSection with a tool-driven TodoListWidget that the model populates via a `manage_todo_list` SDK tool call.

**Architecture:** Register `manage_todo_list` as a custom tool on the Copilot SDK session. The model calls it for multi-step tasks. The client-side handler emits `todo_list_updated` AgentEvent through IPC to a new TodoListWidget in the info panel.

**Tech Stack:** TypeScript, Copilot SDK `tools` API, VS Code-style Widget pattern, Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-03-15-todo-list-redesign.md`

---

## Chunk 1: Data Model & Types

### Task 1: Add `tools` field to SessionConfig

**Files:**
- Modify: `packages/agent/src/common/types.ts:3-22`

- [ ] **Step 1: Write the failing test**

Create `packages/agent/src/common/types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { SessionConfig } from './types.js';

describe('SessionConfig', () => {
  it('accepts a tools array with handler', () => {
    const config: SessionConfig = {
      tools: [{
        name: 'manage_todo_list',
        description: 'Track todos',
        parameters: { type: 'object', properties: {} },
        handler: async () => ({ success: true }),
      }],
    };
    expect(config.tools).toHaveLength(1);
    expect(config.tools![0].name).toBe('manage_todo_list');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/andreasderuiter/Project/gho-work-agent-orchestration && npx vitest run packages/agent/src/common/types.test.ts`
Expected: FAIL — `handler` property does not exist on type

- [ ] **Step 3: Add tools field to SessionConfig**

In `packages/agent/src/common/types.ts`, add after `customAgents`:

```typescript
export interface ToolDefinition {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  handler: (args: any) => Promise<unknown> | unknown;
}

export interface SessionConfig {
  // ...existing fields...
  tools?: ToolDefinition[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/andreasderuiter/Project/gho-work-agent-orchestration && npx vitest run packages/agent/src/common/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/andreasderuiter/Project/gho-work-agent-orchestration && git add packages/agent/src/common/types.ts packages/agent/src/common/types.test.ts && git commit -m "feat: add tools field to SessionConfig for client-side tool handlers"
```

---

### Task 2: Replace plan events with todo_list_updated in AgentEvent

**Files:**
- Modify: `packages/base/src/common/types.ts:136-169`
- Modify: `packages/base/src/common/types.test.ts`

- [ ] **Step 1: Update AgentEvent union type**

In `packages/base/src/common/types.ts`, replace these two variants:

```typescript
  | { type: 'plan_created'; plan: { id: string; steps: Array<{ id: string; label: string }> } }
  | {
      type: 'plan_step_updated';
      planId: string;
      stepId: string;
      state: 'pending' | 'running' | 'completed' | 'failed';
      startedAt?: number;
      completedAt?: number;
      error?: string;
      messageId?: string;
    }
```

With:

```typescript
  | {
      type: 'todo_list_updated';
      todos: Array<{ id: number; title: string; status: 'not-started' | 'in-progress' | 'completed' }>;
    }
```

Keep all other variants (subagent_*, context_loaded, attachment_added) unchanged.

- [ ] **Step 2: Update type test**

In `packages/base/src/common/types.test.ts`, replace the `plan_created` test with:

```typescript
it('todo_list_updated event has correct shape', () => {
  const event: AgentEvent = {
    type: 'todo_list_updated',
    todos: [
      { id: 1, title: 'Research files', status: 'completed' },
      { id: 2, title: 'Implement changes', status: 'in-progress' },
      { id: 3, title: 'Write tests', status: 'not-started' },
    ],
  };
  expect(event.type).toBe('todo_list_updated');
  if (event.type === 'todo_list_updated') {
    expect(event.todos).toHaveLength(3);
    expect(event.todos[0].status).toBe('completed');
  }
});
```

- [ ] **Step 3: Run tests**

Run: `cd /Users/andreasderuiter/Project/gho-work-agent-orchestration && npx vitest run packages/base/src/common/types.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
cd /Users/andreasderuiter/Project/gho-work-agent-orchestration && git add packages/base/src/common/types.ts packages/base/src/common/types.test.ts && git commit -m "feat: replace plan_created/plan_step_updated with todo_list_updated event"
```

---

### Task 3: Update IPC Zod schema

**Files:**
- Modify: `packages/platform/src/ipc/common/ipc.ts:138-203`

- [ ] **Step 1: Replace plan Zod variants with todo_list_updated**

In `packages/platform/src/ipc/common/ipc.ts`, inside `AgentEventSchema`, replace:

```typescript
  z.object({
    type: z.literal('plan_created'),
    plan: z.object({
      id: z.string(),
      steps: z.array(z.object({ id: z.string(), label: z.string() })),
    }),
  }),
  z.object({
    type: z.literal('plan_step_updated'),
    planId: z.string(),
    stepId: z.string(),
    state: z.enum(['pending', 'running', 'completed', 'failed']),
    startedAt: z.number().optional(),
    completedAt: z.number().optional(),
    error: z.string().optional(),
    messageId: z.string().optional(),
  }),
```

With:

```typescript
  z.object({
    type: z.literal('todo_list_updated'),
    todos: z.array(z.object({
      id: z.number(),
      title: z.string(),
      status: z.enum(['not-started', 'in-progress', 'completed']),
    })),
  }),
```

- [ ] **Step 2: Run type check**

Run: `cd /Users/andreasderuiter/Project/gho-work-agent-orchestration && npx turbo build --filter=@gho-work/platform`
Expected: PASS (no type errors)

- [ ] **Step 3: Commit**

```bash
cd /Users/andreasderuiter/Project/gho-work-agent-orchestration && git add packages/platform/src/ipc/common/ipc.ts && git commit -m "feat: update IPC Zod schema — replace plan events with todo_list_updated"
```

---

### Task 4: Replace plan types with todos in InfoPanelState

**Files:**
- Modify: `packages/ui/src/browser/infoPanel/infoPanelState.ts`

- [ ] **Step 1: Write the failing test**

**Note:** `packages/ui/src/browser/infoPanel/infoPanelState.test.ts` already exists with tests for `isInputTool`, `isOutputTool`, `formatFileSize`, etc. ADD the following tests to the existing file — do NOT overwrite it.

Add to `packages/ui/src/browser/infoPanel/infoPanelState.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { InfoPanelState } from './infoPanelState.js';

describe('InfoPanelState', () => {
  it('stores and retrieves todos', () => {
    const state = new InfoPanelState();
    const todos = [
      { id: 1, title: 'Step one', status: 'not-started' as const },
      { id: 2, title: 'Step two', status: 'not-started' as const },
    ];
    state.setTodos(todos);
    expect(state.todos).toHaveLength(2);
    expect(state.todos[0].title).toBe('Step one');
  });

  it('replaces todos on subsequent calls', () => {
    const state = new InfoPanelState();
    state.setTodos([{ id: 1, title: 'Old', status: 'not-started' }]);
    state.setTodos([{ id: 1, title: 'New', status: 'completed' }]);
    expect(state.todos).toHaveLength(1);
    expect(state.todos[0].title).toBe('New');
    expect(state.todos[0].status).toBe('completed');
  });

  it('clears todos on clear()', () => {
    const state = new InfoPanelState();
    state.setTodos([{ id: 1, title: 'A', status: 'not-started' }]);
    state.clear();
    expect(state.todos).toHaveLength(0);
  });

  it('preserves context sources across clear()', () => {
    const state = new InfoPanelState();
    state.setContextSources([{ path: '/a', origin: 'user', format: 'gho' }]);
    state.clear();
    expect(state.contextSources).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/andreasderuiter/Project/gho-work-agent-orchestration && npx vitest run packages/ui/src/browser/infoPanel/infoPanelState.test.ts`
Expected: FAIL — `setTodos` does not exist

- [ ] **Step 3: Implement changes to infoPanelState.ts**

Remove `StepState`, `PlanStep`, `PlanState` types. Remove `_plan`, `setPlan()`, `updateStep()`, `trackToolCall()`, `getToolInfo()`. Add:

```typescript
export interface TodoItem {
  id: number;
  title: string;
  status: 'not-started' | 'in-progress' | 'completed';
}

// In the class:
private _todos: TodoItem[] = [];
get todos(): readonly TodoItem[] { return this._todos; }

setTodos(todos: TodoItem[]): void {
  this._todos = [...todos];
}

// Update clear() to include: this._todos = [];
```

Also update `_updateEmptyState` callers — the `plan` check becomes `todos.length > 0`.

**Spec deviation note:** The spec says to remove `trackToolCall()` and `getToolInfo()`, but these are still used by `infoPanel.ts` for tool-call-to-input correlation. Keep them. This is a spec error — the plan intentionally deviates.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/andreasderuiter/Project/gho-work-agent-orchestration && npx vitest run packages/ui/src/browser/infoPanel/infoPanelState.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/andreasderuiter/Project/gho-work-agent-orchestration && git add packages/ui/src/browser/infoPanel/infoPanelState.ts packages/ui/src/browser/infoPanel/infoPanelState.test.ts && git commit -m "feat: replace plan state with todos in InfoPanelState"
```

---

## Chunk 2: TodoListWidget & InfoPanel Wiring

### Task 5: Create TodoListWidget

**Files:**
- Create: `packages/ui/src/browser/infoPanel/todoListWidget.ts`
- Create: `packages/ui/src/browser/infoPanel/todoListWidget.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/src/browser/infoPanel/todoListWidget.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { TodoListWidget } from './todoListWidget.js';

describe('TodoListWidget', () => {
  it('is hidden when no todos', () => {
    const widget = new TodoListWidget();
    expect(widget.getDomNode().style.display).toBe('none');
  });

  it('becomes visible after setTodos', () => {
    const widget = new TodoListWidget();
    widget.setTodos([
      { id: 1, title: 'Step one', status: 'not-started' },
    ]);
    expect(widget.getDomNode().style.display).toBe('');
  });

  it('renders correct number of items', () => {
    const widget = new TodoListWidget();
    widget.setTodos([
      { id: 1, title: 'A', status: 'completed' },
      { id: 2, title: 'B', status: 'in-progress' },
      { id: 3, title: 'C', status: 'not-started' },
    ]);
    const items = widget.getDomNode().querySelectorAll('.info-todo-item');
    expect(items.length).toBe(3);
  });

  it('shows correct header counter', () => {
    const widget = new TodoListWidget();
    widget.setTodos([
      { id: 1, title: 'A', status: 'completed' },
      { id: 2, title: 'B', status: 'completed' },
      { id: 3, title: 'C', status: 'in-progress' },
      { id: 4, title: 'D', status: 'not-started' },
      { id: 5, title: 'E', status: 'not-started' },
    ]);
    const header = widget.getDomNode().querySelector('.info-section-header');
    expect(header!.textContent).toContain('2/5');
  });

  it('applies correct status classes', () => {
    const widget = new TodoListWidget();
    widget.setTodos([
      { id: 1, title: 'Done', status: 'completed' },
      { id: 2, title: 'Working', status: 'in-progress' },
      { id: 3, title: 'Waiting', status: 'not-started' },
    ]);
    const items = widget.getDomNode().querySelectorAll('.info-todo-item');
    expect(items[0].classList.contains('info-todo-item--completed')).toBe(true);
    expect(items[1].classList.contains('info-todo-item--in-progress')).toBe(true);
    expect(items[2].classList.contains('info-todo-item--not-started')).toBe(true);
  });

  it('toggles collapse on header click', () => {
    const widget = new TodoListWidget();
    widget.setTodos([{ id: 1, title: 'A', status: 'not-started' }]);
    const header = widget.getDomNode().querySelector('.info-section-header') as HTMLElement;
    const list = widget.getDomNode().querySelector('.info-todo-list') as HTMLElement;

    // Initially expanded
    expect(list.style.display).not.toBe('none');

    // Click to collapse
    header.click();
    expect(list.style.display).toBe('none');

    // Click to expand
    header.click();
    expect(list.style.display).not.toBe('none');
  });

  it('has correct ARIA attributes', () => {
    const widget = new TodoListWidget();
    widget.setTodos([{ id: 1, title: 'A', status: 'not-started' }]);
    const list = widget.getDomNode().querySelector('.info-todo-list');
    expect(list!.getAttribute('role')).toBe('list');
    expect(list!.getAttribute('aria-label')).toBe('Todo items');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/andreasderuiter/Project/gho-work-agent-orchestration && npx vitest run packages/ui/src/browser/infoPanel/todoListWidget.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement TodoListWidget**

Create `packages/ui/src/browser/infoPanel/todoListWidget.ts`:

```typescript
/**
 * TodoListWidget — collapsible todo list driven by manage_todo_list tool calls.
 * Shows status icons (circle/filled/check) and a counter header (N/M).
 */
import { Widget } from '../widget.js';
import { h, addDisposableListener } from '../dom.js';
import type { TodoItem } from './infoPanelState.js';

function clearChildren(el: HTMLElement): void {
  while (el.firstChild) { el.removeChild(el.firstChild); }
}

export class TodoListWidget extends Widget {
  private readonly _headerEl: HTMLElement;
  private readonly _listEl: HTMLElement;
  private readonly _chevronEl: HTMLElement;
  private _isExpanded = true;
  private _todos: TodoItem[] = [];

  constructor() {
    const root = h('section.info-todo-section@root', [
      h('div.info-section-header@header', [
        h('span.info-todo-chevron@chevron'),
        h('span.info-todo-header-text@headerText'),
      ]),
      h('div.info-todo-list@list'),
    ]);

    super(root.root);

    this._headerEl = root['header'];
    this._listEl = root['list'];
    this._chevronEl = root['chevron'];

    // ARIA
    this._listEl.setAttribute('role', 'list');
    this._listEl.setAttribute('aria-label', 'Todo items');

    // Collapse toggle
    this._register(addDisposableListener(this._headerEl, 'click', () => {
      this._isExpanded = !this._isExpanded;
      this._listEl.style.display = this._isExpanded ? '' : 'none';
      this._updateChevron();
    }));
    this._headerEl.style.cursor = 'pointer';

    // Hidden until todos arrive
    this.element.style.display = 'none';
  }

  setTodos(todos: TodoItem[]): void {
    this._todos = todos;
    this.element.style.display = todos.length > 0 ? '' : 'none';
    this._render();
  }

  private _render(): void {
    clearChildren(this._listEl);
    this._updateHeader();
    this._updateChevron();

    for (const todo of this._todos) {
      this._listEl.appendChild(this._makeTodoEl(todo));
    }
  }

  private _updateHeader(): void {
    const completed = this._todos.filter(t => t.status === 'completed').length;
    const total = this._todos.length;
    const headerText = this._headerEl.querySelector('.info-todo-header-text');
    if (headerText) {
      headerText.textContent = `Todos (${completed}/${total})`;
    }
  }

  private _updateChevron(): void {
    this._chevronEl.textContent = this._isExpanded ? '\u25BC' : '\u25B6'; // ▼ or ▶
  }

  private _makeTodoEl(todo: TodoItem): HTMLElement {
    const el = document.createElement('div');
    el.className = `info-todo-item info-todo-item--${todo.status}`;
    el.setAttribute('role', 'listitem');

    const icon = document.createElement('span');
    icon.className = `info-todo-icon info-todo-icon--${todo.status}`;
    icon.setAttribute('aria-hidden', 'true');
    if (todo.status === 'completed') {
      icon.textContent = '\u2713'; // ✓
    } else if (todo.status === 'in-progress') {
      icon.textContent = '\u25CF'; // ●
    } else {
      icon.textContent = '\u25CB'; // ○
    }

    const label = document.createElement('span');
    label.className = 'info-todo-label';
    label.textContent = todo.title;

    el.appendChild(icon);
    el.appendChild(label);
    return el;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/andreasderuiter/Project/gho-work-agent-orchestration && npx vitest run packages/ui/src/browser/infoPanel/todoListWidget.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/andreasderuiter/Project/gho-work-agent-orchestration && git add packages/ui/src/browser/infoPanel/todoListWidget.ts packages/ui/src/browser/infoPanel/todoListWidget.test.ts && git commit -m "feat: add TodoListWidget with collapsible UI and status icons"
```

---

### Task 6: Wire TodoListWidget into InfoPanel

**Files:**
- Modify: `packages/ui/src/browser/infoPanel/infoPanel.ts`
- Modify: `packages/ui/src/browser/infoPanel/infoPanel.test.ts`
- Delete: `packages/ui/src/browser/infoPanel/progressSection.ts`
- Delete: `packages/ui/src/browser/infoPanel/subagentProgressBridge.ts`
- Delete: `packages/ui/src/browser/infoPanel/subagentProgressBridge.test.ts`

- [ ] **Step 1: Delete dead files**

```bash
cd /Users/andreasderuiter/Project/gho-work-agent-orchestration && rm packages/ui/src/browser/infoPanel/progressSection.ts packages/ui/src/browser/infoPanel/progressSection.test.ts packages/ui/src/browser/infoPanel/subagentProgressBridge.ts packages/ui/src/browser/infoPanel/subagentProgressBridge.test.ts
```

- [ ] **Step 1b: Update barrel export**

In `packages/ui/src/browser/infoPanel/index.ts`, remove:

```typescript
export { ProgressSection } from './progressSection.js';
export { processSubagentEvent, correlateSubagentToStep } from './subagentProgressBridge.js';
```

Add:

```typescript
export { TodoListWidget } from './todoListWidget.js';
```

- [ ] **Step 2: Update infoPanel.ts**

Replace `ProgressSection` import with `TodoListWidget`. Make these changes:

1. Remove imports: `ProgressSection`, `processSubagentEvent`
2. Add import: `TodoListWidget` from `'./todoListWidget.js'`
3. Replace `_progressSection: ProgressSection` with `_todoSection: TodoListWidget`
4. Replace `_progressWrap` with `_todoWrap` in the layout (keep CSS class `info-panel-progress` or rename to `info-panel-todo` — renaming is cleaner)
5. In `handleEvent()`:
   - Remove `plan_created` case
   - Remove `plan_step_updated` case
   - Remove `subagent_started / subagent_completed / subagent_failed` case (was only used for plan step correlation)
   - Add `todo_list_updated` case:
     ```typescript
     case 'todo_list_updated': {
       this._currentState.setTodos(event.todos);
       this._todoSection.setTodos(event.todos);
       this._updateEmptyState();
       this._onDidTodosCreated.fire();
       break;
     }
     ```
6. Replace `_createProgressSection()` with `_createTodoSection()` returning a `TodoListWidget`
7. Replace `onDidPlanCreated` emitter with `onDidTodosCreated`
8. In `_rebuildSections()`: replay `state.todos` instead of `state.plan`
9. In `_updateEmptyState()`: replace `state.plan !== null` with `state.todos.length > 0`

- [ ] **Step 3: Update infoPanel.test.ts**

Replace plan_created test:

```typescript
it('hides empty state after receiving todo_list_updated event', () => {
  panel.handleEvent({
    type: 'todo_list_updated',
    todos: [{ id: 1, title: 'Do thing', status: 'not-started' }],
  });
  const emptyMsg = panel.getDomNode().querySelector('.info-panel-empty');
  expect(emptyMsg!.style.display).toBe('none');
});

it('renders todo items in TodoListWidget', () => {
  panel.handleEvent({
    type: 'todo_list_updated',
    todos: [
      { id: 1, title: 'First', status: 'completed' },
      { id: 2, title: 'Second', status: 'in-progress' },
    ],
  });
  const items = panel.getDomNode().querySelectorAll('.info-todo-item');
  expect(items.length).toBe(2);
});
```

Update the section containers test: replace `'.info-panel-progress'` with `'.info-panel-todo'` (if CSS class was renamed).

- [ ] **Step 4: Run all info panel tests**

Run: `cd /Users/andreasderuiter/Project/gho-work-agent-orchestration && npx vitest run packages/ui/src/browser/infoPanel/`
Expected: PASS (all tests in infoPanel directory)

- [ ] **Step 5: Commit**

```bash
cd /Users/andreasderuiter/Project/gho-work-agent-orchestration && git add -u packages/ui/src/browser/infoPanel/ && git commit -m "feat: wire TodoListWidget into InfoPanel, remove ProgressSection"
```

---

## Chunk 3: Agent Service & Mock SDK

### Task 7: Register manage_todo_list tool in AgentServiceImpl

**Files:**
- Modify: `packages/agent/src/node/agentServiceImpl.ts:76-139`

- [ ] **Step 1: Write the failing test**

Add to `packages/agent/src/__tests__/installConversation.test.ts` (or create a new file `packages/agent/src/__tests__/todoTool.test.ts`):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentServiceImpl } from '../node/agentServiceImpl.js';
import type { IInstructionResolverLike, IPluginAgentLoaderLike } from '../node/agentServiceImpl.js';
import { SkillRegistryImpl } from '../node/skillRegistryImpl.js';

const noopInstructionResolver: IInstructionResolverLike = { resolve: async () => ({ content: '', sources: [] }) };
const noopPluginAgentLoader: IPluginAgentLoaderLike = { loadAll: async () => [] };

describe('manage_todo_list tool registration', () => {
  it('passes tools array to createSession', async () => {
    const sdk = {
      session: {
        sessionId: 'session-1',
        on: vi.fn((_handler: (event: any) => void) => {
          setTimeout(() => _handler({ type: 'session.idle', data: {} }), 10);
          return () => {};
        }),
        send: vi.fn(async () => ''),
        abort: vi.fn(async () => {}),
      },
      createSession: vi.fn(function(this: any) { return this.session; }),
    };
    sdk.createSession = sdk.createSession.bind(sdk);

    const registry = new SkillRegistryImpl([]);
    await registry.scan();

    const svc = new AgentServiceImpl(
      sdk as any, null, registry,
      noopInstructionResolver, noopPluginAgentLoader,
    );

    const events = [];
    for await (const event of svc.executeTask('hello', { conversationId: 'c1', workspaceId: 'default' })) {
      events.push(event);
    }

    expect(sdk.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.arrayContaining([
          expect.objectContaining({ name: 'manage_todo_list' }),
        ]),
      }),
    );

    registry.dispose();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/andreasderuiter/Project/gho-work-agent-orchestration && npx vitest run packages/agent/src/__tests__/todoTool.test.ts`
Expected: FAIL — tools array not present in createSession call

- [ ] **Step 3: Add manage_todo_list tool registration**

In `agentServiceImpl.ts`, inside `executeTask()` where the session is created, add a `tools` array to the `createSession()` call. Create a `_buildTodoTool(queue)` private method that returns the tool definition:

```typescript
private _buildTodoTool(queue: AsyncQueue<AgentEvent>): ToolDefinition {
  let previousTodos: Array<{ id: number; title: string; status: string }> = [];
  return {
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
              id: { type: 'number', description: 'Unique identifier' },
              title: { type: 'string', description: 'Concise action-oriented label (3-7 words)' },
              status: { type: 'string', enum: ['not-started', 'in-progress', 'completed'] },
            },
            required: ['id', 'title', 'status'],
          },
        },
      },
      required: ['todoList'],
    },
    handler: async ({ todoList }: { todoList: Array<{ id: number; title: string; status: 'not-started' | 'in-progress' | 'completed' }> }) => {
      queue.push({ type: 'todo_list_updated', todos: todoList });
      const msg = this._buildTodoConfirmation(todoList, previousTodos);
      previousTodos = todoList;
      return msg;
    },
  };
}

private _buildTodoConfirmation(
  current: Array<{ id: number; title: string; status: string }>,
  previous: Array<{ id: number; title: string; status: string }>,
): string {
  const completed = current.filter(t => t.status === 'completed').length;
  const total = current.length;
  if (previous.length === 0) {
    return `Created ${total} todos`;
  }
  const newlyCompleted = current.find(t =>
    t.status === 'completed' && previous.find(p => p.id === t.id)?.status !== 'completed'
  );
  if (newlyCompleted) {
    return `Completed: *${newlyCompleted.title}* (${completed}/${total})`;
  }
  const newlyStarted = current.find(t =>
    t.status === 'in-progress' && previous.find(p => p.id === t.id)?.status !== 'in-progress'
  );
  if (newlyStarted) {
    return `Starting: *${newlyStarted.title}* (${completed}/${total})`;
  }
  return `Updated todos (${completed}/${total})`;
}
```

Then in `createSession()` call, add: `tools: [this._buildTodoTool(queue)]`

Also add `import type { ToolDefinition } from '../common/types.js';`

- [ ] **Step 4: Remove dead _mapEvent cases**

In `_mapEvent()`, remove the `plan.created` and `plan.step_updated` cases (lines 268-285). The subagent cases stay.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/andreasderuiter/Project/gho-work-agent-orchestration && npx vitest run packages/agent/src/__tests__/todoTool.test.ts`
Expected: PASS

- [ ] **Step 6: Run all agent tests**

Run: `cd /Users/andreasderuiter/Project/gho-work-agent-orchestration && npx vitest run packages/agent/`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd /Users/andreasderuiter/Project/gho-work-agent-orchestration && git add packages/agent/src/node/agentServiceImpl.ts packages/agent/src/__tests__/todoTool.test.ts && git commit -m "feat: register manage_todo_list tool on SDK session with confirmation messages"
```

---

### Task 8: Update MockSDKSession to route tool handlers

**Files:**
- Modify: `packages/agent/src/node/mockCopilotSDK.ts`

- [ ] **Step 1: Store tools in MockSDKSession**

Change `MockSDKSession` constructor to accept `SessionConfig` and store `config.tools`:

```typescript
private _tools: Array<{ name: string; handler: (args: any) => Promise<unknown> | unknown }>;

constructor(sessionId: string, config: SessionConfig) {
  this.sessionId = sessionId;
  this._model = config.model ?? 'gpt-4o';
  this._tools = config.tools ?? [];
  this.createdAt = Date.now();
}
```

Update `MockCopilotSDK.createSession()` to pass `config` instead of just `sessionId, model`.

- [ ] **Step 2: Replace plan events with manage_todo_list tool calls**

In `simulateResponse()`, replace the entire `if (isComplex)` block (lines 139-164) that emits `plan.created` / `plan.step_updated` with:

```typescript
if (isComplex) {
  // Call manage_todo_list tool (initial list)
  const todoToolCallId = generateUUID();
  const todoArgs = {
    todoList: [
      { id: 1, title: 'Understand the request', status: 'in-progress' as const },
      { id: 2, title: 'Research relevant files', status: 'not-started' as const },
      { id: 3, title: 'Implement changes', status: 'not-started' as const },
    ],
  };

  this.emit({
    type: 'tool.execution_start',
    data: { toolCallId: todoToolCallId, toolName: 'manage_todo_list', arguments: todoArgs },
  });

  // Route to registered handler
  const todoTool = this._tools.find(t => t.name === 'manage_todo_list');
  let todoResult: unknown = { success: true };
  if (todoTool) {
    todoResult = await todoTool.handler(todoArgs);
  }

  this.emit({
    type: 'tool.execution_complete',
    data: { toolCallId: todoToolCallId, success: true, result: todoResult },
  });
  await this.delay(60, signal);
  if (signal.aborted) { return; }
}
```

Also remove the second `if (isComplex)` block (lines 190-220) that references `planId` — replace with a todo update call that marks step 1 completed and step 2 in-progress:

```typescript
if (isComplex) {
  // Update todo list — step 1 done, step 2 in progress
  const todoUpdateId = generateUUID();
  const updatedArgs = {
    todoList: [
      { id: 1, title: 'Understand the request', status: 'completed' as const },
      { id: 2, title: 'Research relevant files', status: 'completed' as const },
      { id: 3, title: 'Implement changes', status: 'in-progress' as const },
    ],
  };

  this.emit({
    type: 'tool.execution_start',
    data: { toolCallId: todoUpdateId, toolName: 'manage_todo_list', arguments: updatedArgs },
  });

  const todoTool = this._tools.find(t => t.name === 'manage_todo_list');
  let result: unknown = { success: true };
  if (todoTool) {
    result = await todoTool.handler(updatedArgs);
  }

  this.emit({
    type: 'tool.execution_complete',
    data: { toolCallId: todoUpdateId, success: true, result },
  });
  await this.delay(30, signal);
  if (signal.aborted) { return; }
}
```

- [ ] **Step 3: Run all agent tests**

Run: `cd /Users/andreasderuiter/Project/gho-work-agent-orchestration && npx vitest run packages/agent/`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
cd /Users/andreasderuiter/Project/gho-work-agent-orchestration && git add packages/agent/src/node/mockCopilotSDK.ts && git commit -m "feat: mock SDK routes manage_todo_list tool calls to registered handlers"
```

---

## Chunk 4: System Prompt, CSS & E2E

### Task 9: Update gho-instructions system prompt

**Files:**
- Modify: `skills/system/gho-instructions.md`

- [ ] **Step 1: Add todo tracking section**

Append after the `## Delegation` section:

```markdown
## Todo tracking

For tasks with 3 or more distinct steps, call `manage_todo_list` to track progress.
Send the full list each time. Only one item should be `in-progress` at a time.
Mark items completed individually as you finish them.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/andreasderuiter/Project/gho-work-agent-orchestration && git add skills/system/gho-instructions.md && git commit -m "feat: add todo tracking instructions to agent persona"
```

---

### Task 10: Add todo CSS styles

**Files:**
- Modify: `apps/desktop/src/renderer/styles.css`

- [ ] **Step 1: Remove old plan/step CSS**

Search for and remove any CSS rules targeting: `.info-progress-section`, `.info-step-list`, `.info-step`, `.info-step-track`, `.info-step-circle`, `.info-step-line`, `.info-step-label`, `.info-step-summary`, `.info-step-remaining`, `.info-step-agent-badge`, `.info-step-error`, `.info-progress-bar-wrap`, `.info-progress-bar`.

- [ ] **Step 2: Add todo CSS**

Add these rules near the existing info panel CSS:

```css
/* --- Todo List --- */
.info-todo-section {
  margin-bottom: 12px;
}

.info-todo-section .info-section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  user-select: none;
}

.info-todo-chevron {
  font-size: 10px;
  width: 14px;
  text-align: center;
  color: var(--text-secondary);
}

.info-todo-list {
  margin: 0;
  padding: 0;
}

.info-todo-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0 4px 20px;
  font-size: 13px;
  line-height: 1.4;
}

.info-todo-icon {
  flex-shrink: 0;
  width: 16px;
  text-align: center;
  font-size: 12px;
}

.info-todo-icon--not-started {
  color: var(--text-tertiary);
}

.info-todo-icon--in-progress {
  color: var(--accent-blue, #3b82f6);
}

.info-todo-icon--completed {
  color: var(--accent-green, #22c55e);
}

.info-todo-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.info-todo-item--completed .info-todo-label {
  text-decoration: line-through;
  color: var(--text-tertiary);
}
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/andreasderuiter/Project/gho-work-agent-orchestration && npx turbo build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
cd /Users/andreasderuiter/Project/gho-work-agent-orchestration && git add apps/desktop/src/renderer/styles.css && git commit -m "feat: add todo list CSS, remove dead plan/step CSS"
```

---

### Task 11: Create E2E test for todo list

**Files:**
- Create: `tests/e2e/todo-list.spec.ts`

**Note:** The `tests/e2e/` directory does not exist in this worktree. Create it. Also ensure Playwright config exists (check `playwright.config.ts` at repo root — if missing, create a minimal one).

- [ ] **Step 1: Create E2E test**

Create `tests/e2e/todo-list.spec.ts`. Use a complex prompt that triggers the mock's `isComplex` path:

```typescript
import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { resolve } from 'path';

const appPath = resolve(__dirname, '../../apps/desktop');

let electronApp: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: [resolve(appPath, 'out/main/index.js'), '--mock'],
    cwd: appPath,
  });
  page = await electronApp.firstWindow();
  await page.waitForSelector('.workbench-activity-bar', { timeout: 15000 });
});

test.afterAll(async () => {
  await electronApp?.close();
});

test('todo list appears for complex prompts', async () => {
  const input = page.locator('.chat-input');
  await input.fill('Help me create a project plan');
  await input.press('Enter');

  // Wait for assistant response
  const assistantMsg = page.locator('.chat-message-assistant').first();
  await expect(assistantMsg).toBeVisible({ timeout: 10000 });

  // Open info panel
  await page.keyboard.press('Meta+Shift+b');
  const panel = page.locator('.info-panel');
  await expect(panel).toBeVisible({ timeout: 3000 });

  // Todo list should appear
  const todoSection = page.locator('.info-todo-section');
  await expect(todoSection).toBeVisible({ timeout: 5000 });

  // Should have todo items
  const todoItems = todoSection.locator('.info-todo-item');
  const todoCount = await todoItems.count();
  expect(todoCount).toBeGreaterThan(0);

  // Header should show counter
  const header = todoSection.locator('.info-section-header');
  await expect(header).toContainText('Todos');
});
```

- [ ] **Step 2: Build and run E2E test**

Run: `cd /Users/andreasderuiter/Project/gho-work-agent-orchestration && npx turbo build && cd apps/desktop && npx electron-vite build && cd ../.. && npx playwright test tests/e2e/todo-list.spec.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
cd /Users/andreasderuiter/Project/gho-work-agent-orchestration && git add tests/e2e/todo-list.spec.ts && git commit -m "test: E2E test verifying todo list appears for complex prompts in mock mode"
```

---

### Task 12: Full build & test verification

- [ ] **Step 1: Run lint**

Run: `cd /Users/andreasderuiter/Project/gho-work-agent-orchestration && npx turbo lint`
Expected: 0 errors

- [ ] **Step 2: Run full build**

Run: `cd /Users/andreasderuiter/Project/gho-work-agent-orchestration && npx turbo build`
Expected: Clean compilation

- [ ] **Step 3: Run all tests**

Run: `cd /Users/andreasderuiter/Project/gho-work-agent-orchestration && npx vitest run`
Expected: All pass

- [ ] **Step 4: Run E2E tests**

Run: `cd /Users/andreasderuiter/Project/gho-work-agent-orchestration && npx playwright test tests/e2e/todo-list.spec.ts`
Expected: All pass

- [ ] **Step 5: Launch app in mock mode and take screenshot evidence**

Run: `cd /Users/andreasderuiter/Project/gho-work-agent-orchestration/apps/desktop && npx electron-vite build && npx electron out/main/index.js --mock`

Send a complex prompt (e.g., "Help me create a project plan") and verify:
- Todo list appears in info panel
- Items show correct status icons (○ ● ✓)
- Header shows counter (N/M)
- Items update as mock progresses

Take Playwright screenshot as evidence.
