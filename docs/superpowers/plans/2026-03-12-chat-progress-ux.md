# Chat Progress UX Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat tool-call display in ChatPanel with a collapsible thinking section, shimmer animations, tool-specific icons, and a state-machine-driven tool call lifecycle — matching VS Code Copilot's UX patterns.

**Architecture:** New `ThinkingSection` and `ToolCallItem` widgets in `packages/ui/src/browser/` compose into the existing `ChatPanel`. A `ToolCallState` enum in `packages/base/src/common/types.ts` models the lifecycle. CSS animations (shimmer, chain-of-thought line) live alongside the existing `styles.css`. The `AgentEvent` type gets a new `thinking_delta` variant for streaming thinking content.

**Tech Stack:** Vanilla TypeScript, DOM via `h()` helper, CSS animations, existing `Disposable`/`Event<T>` patterns.

**Spec:** `docs/CHAT_PROGRESS_UX_SPEC.md`

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `packages/ui/src/browser/chatThinkingSection.ts` | Collapsible "Working" section with shimmer, contains tool calls and thinking text |
| `packages/ui/src/browser/chatToolCallItem.ts` | Single tool call row: icon, message, status, collapsible details |
| `packages/ui/src/browser/chatCollapsible.ts` | Reusable collapsible base: button + chevron + lazy content |
| `packages/ui/src/browser/chatProgressIcons.ts` | Tool-specific icon mapping + SVG icon factory |
| `apps/desktop/src/renderer/chatProgress.css` | All new CSS: shimmer, chain-of-thought line, collapsibles, tool call states |
| `packages/ui/src/browser/chatThinkingSection.test.ts` | Unit tests for thinking section widget |
| `packages/ui/src/browser/chatToolCallItem.test.ts` | Unit tests for tool call item widget |
| `packages/ui/src/browser/chatCollapsible.test.ts` | Unit tests for collapsible base widget |

### Modified files

| File | Changes |
|------|---------|
| `packages/base/src/common/types.ts` | Add `ToolCallState` enum, `thinking_delta` AgentEvent variant |
| `packages/ui/src/browser/chatPanel.ts` | Replace inline tool call rendering with `ThinkingSection` widget |
| `apps/desktop/src/renderer/styles.css` | Remove old `.tool-call-*` styles (replaced by chatProgress.css) |
| `apps/desktop/src/renderer/index.html` | Add `<link>` for `chatProgress.css` |
| `packages/platform/src/ipc/common/ipc.ts` | Add `thinking_delta` to `AgentEventSchema` if Zod-validated |

---

## Chunk 1: Foundation (types + collapsible base widget)

### Task 1: Add ToolCallState enum and thinking_delta event

**Files:**
- Modify: `packages/base/src/common/types.ts`

- [ ] **Step 1: Add ToolCallState enum and thinking_delta to types.ts**

Add after the existing `ToolCall` interface:

```typescript
export enum ToolCallState {
  Streaming = 'streaming',
  WaitingForConfirmation = 'waiting_for_confirmation',
  Executing = 'executing',
  Completed = 'completed',
  Failed = 'failed',
  Cancelled = 'cancelled',
}
```

Update the `AgentEvent` union type — add a `thinking_delta` variant after the existing `thinking` variant:

```typescript
export type AgentEvent =
  | { type: 'text'; content: string }
  | { type: 'text_delta'; content: string }
  | { type: 'thinking'; content: string }
  | { type: 'thinking_delta'; content: string }
  | { type: 'tool_call_start'; toolCall: Omit<ToolCall, 'result' | 'durationMs'> }
  | { type: 'tool_call_result'; toolCallId: string; result: ToolResult }
  | { type: 'error'; error: string }
  | { type: 'done'; messageId: string };
```

- [ ] **Step 2: Update IPC schema if Zod-validated**

Check `packages/platform/src/ipc/common/ipc.ts` for `AgentEventSchema`. If it exists and validates event types, add `thinking_delta` to the discriminated union.

**IMPORTANT:** The `AgentEvent` type in `types.ts` and the Zod schema in `ipc.ts` must stay in sync. Add a comment to both: `// NOTE: AgentEvent is defined in both types.ts and ipc.ts — keep in sync.`

- [ ] **Step 3: Build check**

Run: `npx turbo build --filter=@gho-work/base --filter=@gho-work/platform`
Expected: clean compilation

- [ ] **Step 4: Commit**

```bash
git add packages/base/src/common/types.ts packages/platform/src/ipc/common/ipc.ts
git commit -m "feat: add ToolCallState enum and thinking_delta event type"
```

---

### Task 2: Collapsible base widget

**Files:**
- Create: `packages/ui/src/browser/chatCollapsible.ts`
- Create: `packages/ui/src/browser/chatCollapsible.test.ts`

- [ ] **Step 1: Write failing test for ChatCollapsible**

```typescript
// packages/ui/src/browser/chatCollapsible.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ChatCollapsible } from './chatCollapsible.js';

describe('ChatCollapsible', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('renders collapsed by default', () => {
    const collapsible = new ChatCollapsible('Test Title');
    container.appendChild(collapsible.getDomNode());

    expect(collapsible.isExpanded).toBe(false);
    expect(collapsible.getDomNode().classList.contains('collapsed')).toBe(true);
    expect(collapsible.getDomNode().querySelector('.collapsible-content')!.children.length).toBe(0);
  });

  it('expands on click and lazily creates content', () => {
    let contentCreated = false;
    const collapsible = new ChatCollapsible('Test Title', {
      createContent: (el) => {
        contentCreated = true;
        el.textContent = 'Expanded content';
      },
    });
    container.appendChild(collapsible.getDomNode());

    expect(contentCreated).toBe(false);

    // Click the title button
    collapsible.getDomNode().querySelector('button')!.click();

    expect(collapsible.isExpanded).toBe(true);
    expect(contentCreated).toBe(true);
    expect(collapsible.getDomNode().classList.contains('collapsed')).toBe(false);
  });

  it('toggles collapsed on second click', () => {
    const collapsible = new ChatCollapsible('Test Title', {
      createContent: (el) => { el.textContent = 'Content'; },
    });
    container.appendChild(collapsible.getDomNode());

    collapsible.getDomNode().querySelector('button')!.click(); // expand
    collapsible.getDomNode().querySelector('button')!.click(); // collapse

    expect(collapsible.isExpanded).toBe(false);
    expect(collapsible.getDomNode().classList.contains('collapsed')).toBe(true);
  });

  it('sets aria-expanded correctly', () => {
    const collapsible = new ChatCollapsible('Test Title');
    container.appendChild(collapsible.getDomNode());
    const btn = collapsible.getDomNode().querySelector('button')!;

    expect(btn.getAttribute('aria-expanded')).toBe('false');
    btn.click();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });

  it('updates title text', () => {
    const collapsible = new ChatCollapsible('Original');
    container.appendChild(collapsible.getDomNode());

    collapsible.setTitle('Updated');
    const label = collapsible.getDomNode().querySelector('.collapsible-title-label')!;
    expect(label.textContent).toBe('Updated');
  });

  it('cleans up on dispose', () => {
    const collapsible = new ChatCollapsible('Test');
    container.appendChild(collapsible.getDomNode());

    collapsible.dispose();
    expect(collapsible.isDisposed).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/ui/src/browser/chatCollapsible.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ChatCollapsible**

```typescript
// packages/ui/src/browser/chatCollapsible.ts
import { Disposable } from '@gho-work/base';
import { h, addDisposableListener } from './dom.js';

export interface ChatCollapsibleOptions {
  /** Called once, on first expand. Populate the content element here. */
  createContent?: (contentEl: HTMLElement) => void;
  /** Start expanded. Default: false. */
  startExpanded?: boolean;
  /** CSS class for the title icon. */
  iconClass?: string;
}

export class ChatCollapsible extends Disposable {
  private readonly _root: HTMLElement;
  private readonly _button: HTMLButtonElement;
  private readonly _titleLabel: HTMLElement;
  private readonly _chevron: HTMLElement;
  private readonly _icon: HTMLElement;
  private readonly _contentEl: HTMLElement;
  private _expanded: boolean;
  private _contentInitialized = false;
  private readonly _createContent?: (el: HTMLElement) => void;

  get isExpanded(): boolean {
    return this._expanded;
  }

  constructor(title: string, options?: ChatCollapsibleOptions) {
    super();
    this._createContent = options?.createContent;
    this._expanded = options?.startExpanded ?? false;

    // Build DOM
    const { root, btn, chevron, icon, label, content } = h('div.chat-collapsible.collapsed', [
      h('button.collapsible-button@btn', [
        h('span.collapsible-chevron@chevron'),
        h('span.collapsible-icon@icon'),
        h('span.collapsible-title-label@label'),
      ]),
      h('div.collapsible-content@content'),
    ]);

    this._root = root;
    this._button = btn as HTMLButtonElement;
    this._chevron = chevron;
    this._icon = icon;
    this._titleLabel = label;
    this._contentEl = content;

    this._titleLabel.textContent = title;
    this._button.setAttribute('aria-expanded', String(this._expanded));
    this._button.setAttribute('aria-label', title);

    if (options?.iconClass) {
      this._icon.className = `collapsible-icon ${options.iconClass}`;
    }

    // Click handler
    this._register(addDisposableListener(this._button, 'click', () => {
      this.toggle();
    }));

    // Apply initial state
    if (this._expanded) {
      this._root.classList.remove('collapsed');
      this._initContent();
    }
  }

  toggle(): void {
    this._expanded = !this._expanded;
    this._button.setAttribute('aria-expanded', String(this._expanded));

    if (this._expanded) {
      this._root.classList.remove('collapsed');
      this._initContent();
    } else {
      this._root.classList.add('collapsed');
    }
  }

  setTitle(title: string): void {
    this._titleLabel.textContent = title;
    this._button.setAttribute('aria-label', title);
  }

  setIconClass(cls: string): void {
    this._icon.className = `collapsible-icon ${cls}`;
  }

  /** Append a child element to the content area (for progressive updates). */
  appendContent(el: HTMLElement): void {
    this._contentEl.appendChild(el);
  }

  getContentElement(): HTMLElement {
    return this._contentEl;
  }

  getDomNode(): HTMLElement {
    return this._root;
  }

  private _initContent(): void {
    if (this._contentInitialized) {
      return;
    }
    this._contentInitialized = true;
    this._createContent?.(this._contentEl);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/ui/src/browser/chatCollapsible.test.ts`
Expected: all 6 tests PASS

- [ ] **Step 5: Build check**

Run: `npx turbo build --filter=@gho-work/ui`
Expected: clean compilation

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/browser/chatCollapsible.ts packages/ui/src/browser/chatCollapsible.test.ts
git commit -m "feat: add ChatCollapsible base widget with lazy content init"
```

---

## Chunk 2: Icons + ToolCallItem widget

### Task 3: Tool-specific icon mapping

**Files:**
- Create: `packages/ui/src/browser/chatProgressIcons.ts`

- [ ] **Step 1: Create icon mapping module**

```typescript
// packages/ui/src/browser/chatProgressIcons.ts

/** Maps tool name patterns to icon class names. */
export function getToolIconClass(toolName: string): string {
  const name = toolName.toLowerCase();

  if (/search|grep|find|semantic|codebase|list/.test(name)) {
    return 'icon-search';
  }
  if (/read|get_file|problems|diagnostics/.test(name)) {
    return 'icon-file';
  }
  if (/edit|create|replace|write|patch|insert/.test(name)) {
    return 'icon-pencil';
  }
  if (/terminal|exec|run|shell|bash/.test(name)) {
    return 'icon-terminal';
  }
  if (/fetch|http|url|web/.test(name)) {
    return 'icon-globe';
  }
  return 'icon-tool';
}

/** Returns past-tense message for a tool call. */
export function getPastTenseMessage(toolName: string, status: string): string {
  if (status === 'failed') {
    return `Failed: ${toolName}`;
  }
  if (status === 'cancelled') {
    return `Cancelled: ${toolName}`;
  }
  // Simple past tense: "Running search" -> "Searched"
  // For now, just prefix with a completed indicator
  return `Used ${toolName}`;
}

/** Returns in-progress message for a tool call. */
export function getInProgressMessage(toolName: string): string {
  return `Using ${toolName}...`;
}
```

- [ ] **Step 2: Build check**

Run: `npx turbo build --filter=@gho-work/ui`
Expected: clean compilation

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/browser/chatProgressIcons.ts
git commit -m "feat: add tool-specific icon mapping for chat progress UI"
```

---

### Task 4: ToolCallItem widget

**Files:**
- Create: `packages/ui/src/browser/chatToolCallItem.ts`
- Create: `packages/ui/src/browser/chatToolCallItem.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/ui/src/browser/chatToolCallItem.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ChatToolCallItem } from './chatToolCallItem.js';

describe('ChatToolCallItem', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('renders with tool name and executing state', () => {
    const item = new ChatToolCallItem('tc-1', 'read_file', 'executing');
    container.appendChild(item.getDomNode());

    const label = item.getDomNode().querySelector('.tool-call-label')!;
    expect(label.textContent).toContain('read_file');
    expect(item.getDomNode().classList.contains('tool-call-executing')).toBe(true);
  });

  it('transitions to completed state', () => {
    const item = new ChatToolCallItem('tc-1', 'grep_search', 'executing');
    container.appendChild(item.getDomNode());

    item.setState('completed');

    expect(item.getDomNode().classList.contains('tool-call-completed')).toBe(true);
    expect(item.getDomNode().classList.contains('tool-call-executing')).toBe(false);
  });

  it('transitions to failed state', () => {
    const item = new ChatToolCallItem('tc-1', 'run_in_terminal', 'executing');
    container.appendChild(item.getDomNode());

    item.setState('failed');

    expect(item.getDomNode().classList.contains('tool-call-failed')).toBe(true);
  });

  it('applies correct icon class based on tool name', () => {
    const item = new ChatToolCallItem('tc-1', 'grep_search', 'executing');
    container.appendChild(item.getDomNode());

    const icon = item.getDomNode().querySelector('.tool-call-type-icon')!;
    expect(icon.classList.contains('icon-search')).toBe(true);
  });

  it('shows shimmer animation while executing', () => {
    const item = new ChatToolCallItem('tc-1', 'read_file', 'executing');
    container.appendChild(item.getDomNode());

    const label = item.getDomNode().querySelector('.tool-call-label')!;
    expect(label.classList.contains('shimmer')).toBe(true);
  });

  it('removes shimmer when completed', () => {
    const item = new ChatToolCallItem('tc-1', 'read_file', 'executing');
    container.appendChild(item.getDomNode());

    item.setState('completed');

    const label = item.getDomNode().querySelector('.tool-call-label')!;
    expect(label.classList.contains('shimmer')).toBe(false);
  });

  it('cleans up on dispose', () => {
    const item = new ChatToolCallItem('tc-1', 'test', 'executing');
    item.dispose();
    expect(item.isDisposed).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/ui/src/browser/chatToolCallItem.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ChatToolCallItem**

```typescript
// packages/ui/src/browser/chatToolCallItem.ts
import { Disposable } from '@gho-work/base';
import { h } from './dom.js';
import { getToolIconClass, getInProgressMessage, getPastTenseMessage } from './chatProgressIcons.js';

type ToolCallDisplayState = 'executing' | 'completed' | 'failed' | 'cancelled';

export class ChatToolCallItem extends Disposable {
  private readonly _root: HTMLElement;
  private readonly _statusIcon: HTMLElement;
  private readonly _label: HTMLElement;
  private _state: ToolCallDisplayState;

  readonly toolCallId: string;
  readonly toolName: string;

  constructor(toolCallId: string, toolName: string, initialState: ToolCallDisplayState) {
    super();
    this.toolCallId = toolCallId;
    this.toolName = toolName;
    this._state = initialState;

    const iconClass = getToolIconClass(toolName);

    const { root, statusIcon, typeIcon, label } = h('div.chat-tool-call-item@root', [
      h(`span.tool-call-status-icon@statusIcon`),
      h(`span.tool-call-type-icon.${iconClass}@typeIcon`),
      h('span.tool-call-label@label'),
    ]);

    this._root = root;
    this._statusIcon = statusIcon;
    this._label = label;

    this._applyState();
  }

  setState(state: ToolCallDisplayState): void {
    this._state = state;
    this._applyState();
  }

  getDomNode(): HTMLElement {
    return this._root;
  }

  private _applyState(): void {
    // Clear previous state classes
    this._root.classList.remove(
      'tool-call-executing', 'tool-call-completed', 'tool-call-failed', 'tool-call-cancelled',
    );
    this._root.classList.add(`tool-call-${this._state}`);

    // Update label text
    if (this._state === 'executing') {
      this._label.textContent = getInProgressMessage(this.toolName);
      this._label.classList.add('shimmer');
      this._statusIcon.className = 'tool-call-status-icon icon-spinner';
    } else {
      this._label.textContent = getPastTenseMessage(this.toolName, this._state);
      this._label.classList.remove('shimmer');
      if (this._state === 'completed') {
        this._statusIcon.className = 'tool-call-status-icon icon-check';
      } else if (this._state === 'failed') {
        this._statusIcon.className = 'tool-call-status-icon icon-error';
      } else {
        this._statusIcon.className = 'tool-call-status-icon icon-cancelled';
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/ui/src/browser/chatToolCallItem.test.ts`
Expected: all 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/browser/chatToolCallItem.ts packages/ui/src/browser/chatToolCallItem.test.ts
git commit -m "feat: add ChatToolCallItem widget with icon mapping and state transitions"
```

---

## Chunk 3: ThinkingSection widget

### Task 5: ThinkingSection widget

**Files:**
- Create: `packages/ui/src/browser/chatThinkingSection.ts`
- Create: `packages/ui/src/browser/chatThinkingSection.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/ui/src/browser/chatThinkingSection.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ChatThinkingSection } from './chatThinkingSection.js';

describe('ChatThinkingSection', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('renders collapsed with "Working" title', () => {
    const section = new ChatThinkingSection();
    container.appendChild(section.getDomNode());

    const btn = section.getDomNode().querySelector('button')!;
    expect(btn.textContent).toContain('Working');
    expect(section.getDomNode().classList.contains('collapsed')).toBe(true);
  });

  it('shows shimmer class while active', () => {
    const section = new ChatThinkingSection();
    container.appendChild(section.getDomNode());

    section.setActive(true);
    expect(section.getDomNode().classList.contains('thinking-active')).toBe(true);
  });

  it('removes shimmer class when deactivated', () => {
    const section = new ChatThinkingSection();
    container.appendChild(section.getDomNode());

    section.setActive(true);
    section.setActive(false);
    expect(section.getDomNode().classList.contains('thinking-active')).toBe(false);
  });

  it('adds tool call items', () => {
    const section = new ChatThinkingSection();
    container.appendChild(section.getDomNode());

    section.addToolCall('tc-1', 'read_file');

    // Expand to see content
    section.getDomNode().querySelector('button')!.click();

    const items = section.getDomNode().querySelectorAll('.chat-tool-call-item');
    expect(items.length).toBe(1);
  });

  it('updates tool call state', () => {
    const section = new ChatThinkingSection();
    container.appendChild(section.getDomNode());

    section.addToolCall('tc-1', 'grep_search');
    section.updateToolCall('tc-1', 'completed');

    // Expand to see content
    section.getDomNode().querySelector('button')!.click();

    const item = section.getDomNode().querySelector('.chat-tool-call-item')!;
    expect(item.classList.contains('tool-call-completed')).toBe(true);
  });

  it('appends thinking text', () => {
    const section = new ChatThinkingSection();
    container.appendChild(section.getDomNode());

    section.appendThinkingText('Analyzing the code...');

    // Expand to see content
    section.getDomNode().querySelector('button')!.click();

    const thinkingEl = section.getDomNode().querySelector('.thinking-text');
    expect(thinkingEl).not.toBeNull();
    expect(thinkingEl!.textContent).toContain('Analyzing the code...');
  });

  it('shows tool count in title when collapsed', () => {
    const section = new ChatThinkingSection();
    container.appendChild(section.getDomNode());

    section.addToolCall('tc-1', 'read_file');
    section.updateToolCall('tc-1', 'completed');
    section.addToolCall('tc-2', 'grep_search');
    section.updateToolCall('tc-2', 'completed');
    section.setActive(false);

    const btn = section.getDomNode().querySelector('button')!;
    expect(btn.textContent).toContain('2');
  });

  it('cleans up on dispose', () => {
    const section = new ChatThinkingSection();
    section.addToolCall('tc-1', 'read_file');
    section.dispose();
    expect(section.isDisposed).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/ui/src/browser/chatThinkingSection.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ChatThinkingSection**

```typescript
// packages/ui/src/browser/chatThinkingSection.ts
import { DisposableStore } from '@gho-work/base';
import { ChatCollapsible } from './chatCollapsible.js';
import { ChatToolCallItem } from './chatToolCallItem.js';
import { h } from './dom.js';

const THINKING_VERBS = ['Working', 'Thinking', 'Reasoning', 'Analyzing', 'Considering'];

export class ChatThinkingSection extends ChatCollapsible {
  private readonly _toolCalls = new Map<string, ChatToolCallItem>();
  private readonly _toolCallDisposables = this._register(new DisposableStore());
  private _thinkingTextEl: HTMLElement | null = null;
  private _toolCallListEl: HTMLElement | null = null;
  private _isActive = false;
  private _thinkingContent = '';
  private _contentCreated = false;

  constructor() {
    super(THINKING_VERBS[0], {
      createContent: (el) => this._buildContent(el),
    });
    this.getDomNode().classList.add('chat-thinking-section');
  }

  setActive(active: boolean): void {
    this._isActive = active;
    if (active) {
      this.getDomNode().classList.add('thinking-active');
      // Rotate the verb
      const verb = THINKING_VERBS[Math.floor(Math.random() * THINKING_VERBS.length)];
      this.setTitle(verb);
    } else {
      this.getDomNode().classList.remove('thinking-active');
      this._updateCompletedTitle();
    }
  }

  addToolCall(toolCallId: string, toolName: string): void {
    const item = new ChatToolCallItem(toolCallId, toolName, 'executing');
    this._toolCallDisposables.add(item);
    this._toolCalls.set(toolCallId, item);

    if (this._toolCallListEl) {
      this._toolCallListEl.appendChild(item.getDomNode());
    }
  }

  updateToolCall(toolCallId: string, state: 'completed' | 'failed' | 'cancelled'): void {
    const item = this._toolCalls.get(toolCallId);
    if (item) {
      item.setState(state);
    }
    if (!this._isActive) {
      this._updateCompletedTitle();
    }
  }

  appendThinkingText(text: string): void {
    this._thinkingContent += text;
    if (this._thinkingTextEl) {
      this._thinkingTextEl.textContent = this._thinkingContent;
    }
  }

  getDomNode(): HTMLElement {
    return super.getDomNode();
  }

  private _buildContent(el: HTMLElement): void {
    this._contentCreated = true;

    // Thinking text area
    const { root: thinkingText } = h('div.thinking-text');
    thinkingText.textContent = this._thinkingContent;
    this._thinkingTextEl = thinkingText;
    el.appendChild(thinkingText);

    // Tool call list
    const { root: toolCallList } = h('div.thinking-tool-list');
    this._toolCallListEl = toolCallList;

    // Add any tool calls that were added before content was created
    for (const item of this._toolCalls.values()) {
      toolCallList.appendChild(item.getDomNode());
    }

    el.appendChild(toolCallList);
  }

  private _updateCompletedTitle(): void {
    const count = this._toolCalls.size;
    if (count === 0) {
      this.setTitle('Worked');
    } else {
      this.setTitle(`Worked — ${count} tool${count !== 1 ? 's' : ''} used`);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/ui/src/browser/chatThinkingSection.test.ts`
Expected: all 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/browser/chatThinkingSection.ts packages/ui/src/browser/chatThinkingSection.test.ts
git commit -m "feat: add ChatThinkingSection widget with tool call tracking"
```

---

## Chunk 4: CSS animations

### Task 6: Chat progress CSS

**Files:**
- Create: `apps/desktop/src/renderer/chatProgress.css`
- Modify: `apps/desktop/src/renderer/index.html`
- Modify: `apps/desktop/src/renderer/styles.css` (remove old tool-call styles)

- [ ] **Step 1: Create chatProgress.css**

```css
/* Chat Progress UX — shimmer, collapsibles, tool call states, chain-of-thought line */

/* === Shimmer animation === */
@keyframes chat-shimmer {
  0%   { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}

.shimmer {
  background: linear-gradient(90deg,
    var(--fg-secondary) 0%,
    var(--fg-secondary) 30%,
    var(--fg-accent) 50%,
    var(--fg-secondary) 70%,
    var(--fg-secondary) 100%);
  background-size: 400% 100%;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: chat-shimmer 2s linear infinite;
}

/* === Spinner animation === */
@keyframes spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

.icon-spinner::before {
  content: '⟳';
  display: inline-block;
  animation: spin 1s linear infinite;
}

/* === Icon pseudo-elements === */
.icon-check::before  { content: '✓'; color: var(--fg-success); }
.icon-error::before  { content: '✕'; color: var(--fg-error); }
.icon-cancelled::before { content: '—'; color: var(--fg-muted); }
.icon-search::before { content: '🔍'; font-size: 12px; }
.icon-file::before   { content: '📄'; font-size: 12px; }
.icon-pencil::before { content: '✏️'; font-size: 12px; }
.icon-terminal::before { content: '>_'; font-family: var(--font-mono); font-size: 10px; color: var(--fg-accent); }
.icon-globe::before  { content: '🌐'; font-size: 12px; }
.icon-tool::before   { content: '🔧'; font-size: 12px; }

/* === Collapsible base === */
.chat-collapsible {
  margin: 4px 0;
}

.chat-collapsible .collapsible-button {
  background: none;
  border: none;
  color: var(--fg-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  font-size: 13px;
  width: 100%;
  text-align: left;
  border-radius: var(--radius-sm);
}

.chat-collapsible .collapsible-button:hover {
  background: var(--bg-tertiary);
  color: var(--fg-primary);
}

/* Chevron */
.collapsible-chevron::before {
  content: '▸';
  font-size: 10px;
  transition: transform 0.15s;
  display: inline-block;
}

.chat-collapsible:not(.collapsed) .collapsible-chevron::before {
  transform: rotate(90deg);
}

/* Content area */
.collapsible-content {
  overflow: hidden;
  transition: max-height 0.15s ease;
}

.chat-collapsible.collapsed .collapsible-content {
  max-height: 0;
}

.chat-collapsible:not(.collapsed) .collapsible-content {
  max-height: none;
}

/* === Thinking section === */
.chat-thinking-section {
  margin: 6px 0 8px 0;
}

.chat-thinking-section.thinking-active .collapsible-title-label {
  /* Apply shimmer to the "Working" / "Thinking" title */
  background: linear-gradient(90deg,
    var(--fg-secondary) 0%,
    var(--fg-secondary) 30%,
    var(--fg-accent) 50%,
    var(--fg-secondary) 70%,
    var(--fg-secondary) 100%);
  background-size: 400% 100%;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: chat-shimmer 2s linear infinite;
}

/* Chain-of-thought bordered box */
.chat-thinking-section .collapsible-content {
  border: 1px solid var(--bg-tertiary);
  border-radius: var(--radius-md);
  margin-top: 4px;
  padding: 0;
}

.chat-thinking-section.collapsed .collapsible-content {
  border: none;
}

/* Thinking text */
.thinking-text {
  padding: 8px 12px 8px 24px;
  font-size: 12px;
  color: var(--fg-secondary);
  max-height: 200px;
  overflow-y: auto;
  white-space: pre-wrap;
  line-height: 1.5;
  position: relative;
}

.thinking-text:empty {
  display: none;
}

/* Tool call list inside thinking */
.thinking-tool-list {
  padding: 0;
}

/* === Tool call item === */
.chat-tool-call-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px 4px 18px;
  font-size: 12px;
  position: relative;
}

/* Chain-of-thought vertical line */
.chat-tool-call-item::before {
  content: '';
  position: absolute;
  left: 10px;
  top: 0;
  bottom: 0;
  width: 1px;
  background-color: var(--bg-tertiary);
}

.chat-tool-call-item:first-child::before {
  top: 50%;
}

.chat-tool-call-item:last-child::before {
  bottom: 50%;
}

.chat-tool-call-item:only-child::before {
  display: none;
}

/* Status icon */
.tool-call-status-icon {
  width: 14px;
  text-align: center;
  font-size: 12px;
  flex-shrink: 0;
}

/* Type icon */
.tool-call-type-icon {
  width: 16px;
  text-align: center;
  flex-shrink: 0;
}

/* Label */
.tool-call-label {
  color: var(--fg-secondary);
}

.tool-call-executing .tool-call-label {
  color: var(--fg-primary);
}

.tool-call-completed .tool-call-label {
  color: var(--fg-secondary);
}

.tool-call-failed .tool-call-label {
  color: var(--fg-error);
}
```

- [ ] **Step 2: Add CSS link to index.html**

In `apps/desktop/src/renderer/index.html`, add after the existing `styles.css` link:

```html
<link rel="stylesheet" href="./chatProgress.css">
```

- [ ] **Step 3: Remove old tool-call styles from styles.css**

Remove the old `.chat-tool-calls`, `.tool-call-item`, `.tool-call-running`, `.tool-call-completed`, `.tool-call-icon`, `.tool-call-name`, `.tool-call-status` rules from `apps/desktop/src/renderer/styles.css` (approximately lines 386–425). These are replaced by `chatProgress.css`.

- [ ] **Step 4: Build check**

Run: `npx turbo build`
Expected: clean compilation

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/chatProgress.css apps/desktop/src/renderer/index.html apps/desktop/src/renderer/styles.css
git commit -m "feat: add chat progress CSS with shimmer, collapsibles, chain-of-thought line"
```

---

## Chunk 5: Wire into ChatPanel + E2E verification

### Task 7: Refactor ChatPanel to use ThinkingSection

**Files:**
- Modify: `packages/ui/src/browser/chatPanel.ts`

This is the integration task. Replace the flat `_updateAssistantToolCalls()` rendering with the new `ChatThinkingSection` widget, and handle the new `thinking_delta` event.

- [ ] **Step 1: Add imports and new field to ChatPanel**

At the top of `chatPanel.ts`, add:

```typescript
import { MutableDisposable } from '@gho-work/base';
import { ChatThinkingSection } from './chatThinkingSection.js';
```

Add a new private field after `_currentAssistantMessage`:

```typescript
private readonly _currentThinkingSection = this._register(new MutableDisposable<ChatThinkingSection>());
```

- [ ] **Step 2: Create ThinkingSection when assistant message starts**

In `_renderMessage()`, after creating the `toolCallsEl` (currently `div.chat-tool-calls`), don't change the element class — we'll mount the thinking section into it later.

In `_sendMessage()`, after creating the placeholder assistant message and calling `_renderMessage`, create the thinking section:

```typescript
// After: this._renderMessage(this._currentAssistantMessage);
const thinkingSection = new ChatThinkingSection();
this._currentThinkingSection.value = thinkingSection; // disposes previous if any
const el = document.getElementById(`msg-${this._currentAssistantMessage.id}`);
const toolCallsEl = el?.querySelector('.chat-tool-calls');
if (toolCallsEl) {
  toolCallsEl.appendChild(thinkingSection.getDomNode());
}
thinkingSection.setActive(true);
```

- [ ] **Step 3: Handle thinking_delta and update tool call events**

Update `_handleAgentEvent()`. Use `this._currentThinkingSection.value` (the `MutableDisposable`'s inner value):

```typescript
case 'thinking': {
  this._currentThinkingSection.value?.setActive(true);
  break;
}
case 'thinking_delta': {
  this._currentThinkingSection.value?.appendThinkingText(event.content);
  break;
}
case 'tool_call_start': {
  this._currentThinkingSection.value?.addToolCall(
    event.toolCall.id,
    event.toolCall.toolName,
  );
  break;
}
case 'tool_call_result': {
  const state = event.result.success ? 'completed' : 'failed';
  this._currentThinkingSection.value?.updateToolCall(event.toolCallId, state);
  break;
}
```

- [ ] **Step 4: Deactivate thinking section on done/error**

In `_finishStreaming()`, replace the existing body. Remove the `this._updateAssistantStatus('')` call (the method is deleted in Step 5). Add thinking section deactivation:

```typescript
private _finishStreaming(): void {
  if (this._currentAssistantMessage) {
    this._currentAssistantMessage.isStreaming = false;
    this._updateAssistantContent();
  }
  this._currentThinkingSection.value?.setActive(false);
  // Don't clear the MutableDisposable — the section stays in the DOM for scrollback.
  // It will be disposed when the next message creates a new section.
  this._currentAssistantMessage = null;
  this._isProcessing = false;
  this._sendBtnEl.disabled = false;
  this._sendBtnEl.style.display = '';
  this._cancelBtnEl.style.display = 'none';
  this._inputEl.focus();
}
```

- [ ] **Step 5: Remove old _updateAssistantToolCalls method**

Delete the entire `_updateAssistantToolCalls()` method and the `_updateAssistantStatus()` method (both replaced by the thinking section). The `_updateAssistantStatus('Thinking...')` call in the `thinking` case was already replaced in Step 3.

Remove the old tool call data from `ChatMessage` interface — replace:
```typescript
toolCalls?: Array<{ id: string; name: string; status: string }>;
```
with just keeping it for backward compatibility with loaded conversations (the rendering is now handled by the section widget).

- [ ] **Step 6: Build check**

Run: `npx turbo build`
Expected: clean compilation

- [ ] **Step 7: Run all existing tests**

Run: `npx vitest run --changed`
Expected: all tests pass (existing + new)

- [ ] **Step 8: Commit**

```bash
git add packages/ui/src/browser/chatPanel.ts
git commit -m "feat: wire ChatThinkingSection into ChatPanel, replace flat tool display"
```

---

### Task 8: E2E smoke test

**Files:**
- Modify: existing Playwright test or create new test

- [ ] **Step 1: Launch app and verify thinking section renders**

Write a temp Playwright script that:
1. Launches the Electron app via `_electron.launch()`
2. Sends a message that triggers tool calls (or use mock mode)
3. Takes a screenshot during streaming — verify `.chat-thinking-section` exists
4. Takes a screenshot after completion — verify `.thinking-active` is gone
5. Clicks the thinking section to expand — verify `.chat-tool-call-item` elements are visible

Run: `npx playwright test` (or the temp script)
Expected: screenshots show the collapsible thinking section with shimmer during streaming and tool calls visible when expanded.

- [ ] **Step 2: Review screenshots with Read tool**

View the screenshots to self-verify the UI looks correct. Check:
- Shimmer animation on the "Working" title
- Tool call items with icons
- Chain-of-thought vertical line
- Collapsed state after completion

- [ ] **Step 3: Clean up temp script (if any)**

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: chat progress UX — thinking section, tool call items, shimmer animations"
```

---

## Summary

| Task | What it builds | Files | Tests |
|------|---------------|-------|-------|
| 1 | Types (ToolCallState, thinking_delta) | types.ts, ipc.ts | build check |
| 2 | ChatCollapsible base widget | chatCollapsible.ts | 6 unit tests |
| 3 | Icon mapping | chatProgressIcons.ts | build check |
| 4 | ChatToolCallItem widget | chatToolCallItem.ts | 7 unit tests |
| 5 | ChatThinkingSection widget | chatThinkingSection.ts | 8 unit tests |
| 6 | CSS animations | chatProgress.css, styles.css | build check |
| 7 | ChatPanel integration | chatPanel.ts | vitest --changed |
| 8 | E2E smoke test | Playwright script | visual verification |

## Explicitly deferred (from spec)

These items are documented in `docs/CHAT_PROGRESS_UX_SPEC.md` but intentionally skipped in this plan:

- **Display modes** (collapsed-preview, fixed-scrolling) — only `collapsed` is implemented. Add modes when user feedback indicates a preference.
- **Confirmation widget** — spec section 5. Deferred until tool permission system is built.
- **Context window usage indicator** — requires token counting from SDK.
- **Subagent display** — no subagents yet.
- **Post-approval flow** — start with pre-approval only.
- **Terminal-specific renderer** — generic tool renderer first, specialize later.
- **ARIA live regions** for progress announcements — basic `aria-expanded` and `aria-label` are implemented; live regions are a follow-up.
