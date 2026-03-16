# Info Panel Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the info panel as 7 collapsible mini-panel sections with a connected timeline for progress, 3 new data sections (Agents, Skills, Usage), enriched Context (MCP servers + skills), and auto-hide when empty.

**Architecture:** Each section wraps in a reusable `CollapsibleSection` base widget. New sections consume events already flowing through the system (`skill_invoked`, `subagent_*`, `CONNECTOR_STATUS_CHANGED`, `QUOTA_CHANGED`). The panel auto-hides when all sections are empty. A subagent type bug (duplicate event variants) is fixed as a prerequisite.

**Tech Stack:** TypeScript, vanilla DOM (no frameworks), VS Code-inspired Widget pattern, `h()` DOM helper, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-03-16-info-panel-redesign-design.md`

---

## Chunk 1: Foundation — Types Fix + CollapsibleSection Base

### Task 1: Fix duplicate subagent event type variants

**Files:**
- Modify: `packages/base/src/common/types.ts` (lines 156–159)
- Modify: `packages/agent/src/node/agentServiceImpl.ts` (lines 315–327)
- Modify: `packages/ui/src/browser/chatPanel.ts` (lines 568–581)

This fixes a pre-existing bug where the type definitions have two conflicting shapes for `subagent_started` and `subagent_completed`. The SDK emits Variant B (`parentToolCallId`, `name`, `displayName`) but the chat panel reads Variant A fields (`subagentId`, `subagentName`).

- [ ] **Step 1: Update AgentEvent type — remove Variant A, keep Variant B**

In `packages/base/src/common/types.ts`, replace the 4 duplicate subagent lines (156–159) with the single canonical variants:

```typescript
  | { type: 'subagent_started'; parentToolCallId: string; name: string; displayName: string }
  | { type: 'subagent_completed'; parentToolCallId: string; name: string; displayName: string; state: 'completed' | 'failed' }
```

Note: merge the `state` field from Variant A into Variant B so consumers can distinguish success/failure. Keep `subagent_failed` as a separate event type (it carries an `error` field). In `handleEvent()`, map `subagent_failed` → `AgentsSection.updateAgent(id, 'failed', error)` directly.

- [ ] **Step 2: Remove duplicate case handlers in agentServiceImpl.ts**

Delete the unreachable duplicate handlers at lines 315–327 (the second `subagent.started` and `subagent.completed`/`subagent.failed` cases). Keep only the handlers at lines 288–308 that emit Variant B fields. Add `state` field to the `subagent_completed` emission:

```typescript
case 'subagent.completed':
  return {
    type: 'subagent_completed',
    parentToolCallId: data.parentToolCallId as string,
    name: data.name as string,
    displayName: (data.displayName as string) ?? (data.name as string),
    state: 'completed' as const,
  };
```

- [ ] **Step 3: Update chatPanel.ts to use Variant B field names**

In `packages/ui/src/browser/chatPanel.ts`, update the event handlers (lines 568–581):

```typescript
case 'subagent_started':
  this._currentThinkingSection.value?.addSubagent(event.parentToolCallId, event.displayName ?? event.name);
  break;
case 'subagent_completed':
  this._currentThinkingSection.value?.updateSubagent(event.parentToolCallId, event.state);
  break;
```

- [ ] **Step 4: Update chatThinkingSection.ts if needed**

Verify `addSubagent(id, name)` and `updateSubagent(id, state)` signatures still match. The first param changes from `subagentId` to `parentToolCallId` but the method just uses it as a map key — no signature change needed, just the caller.

- [ ] **Step 5: Run tests and verify**

Run: `npx vitest run --changed`
Expected: All existing tests pass (the old fields were never properly tested since the event shapes were ambiguous).

- [ ] **Step 6: Commit**

```bash
git add packages/base/src/common/types.ts packages/agent/src/node/agentServiceImpl.ts packages/ui/src/browser/chatPanel.ts
git commit -m "fix: resolve duplicate subagent event type variants — use SDK-aligned shape"
```

---

### Task 2: Extend context_loaded event with skills field

**Files:**
- Modify: `packages/base/src/common/types.ts` (context_loaded variant)
- Modify: `packages/agent/src/node/agentServiceImpl.ts` (context_loaded emission)

- [ ] **Step 1: Add skills to context_loaded type**

In `packages/base/src/common/types.ts`, update the `context_loaded` union member:

```typescript
  | {
      type: 'context_loaded';
      sources: Array<{ path: string; origin: 'user' | 'project'; format: string }>;
      agents: Array<{ name: string; plugin: string }>;
      skills: Array<{ name: string; source: string }>;
    }
```

- [ ] **Step 2: Update zod schema if present**

Check `packages/platform/src/ipc/common/ipc.ts` for the `context_loaded` zod schema variant. Add `skills` array field:

```typescript
skills: z.array(z.object({ name: z.string(), source: z.string() })),
```

- [ ] **Step 3: Emit skills in agentServiceImpl.ts**

In the code that emits `context_loaded` (around line 136–148 of `agentServiceImpl.ts`), add skills data. The skill registry should already be available in the agent service. Map available skills:

```typescript
skills: availableSkills.map(s => ({ name: s.name, source: s.source ?? 'built-in' })),
```

If the skill registry is not available in scope, check what data the agent service has access to and map accordingly.

- [ ] **Step 4: Run tests**

Run: `npx vitest run --changed`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/base/src/common/types.ts packages/platform/src/ipc/common/ipc.ts packages/agent/src/node/agentServiceImpl.ts
git commit -m "feat: add skills field to context_loaded event"
```

---

### Task 3: Create CollapsibleSection base widget

**Files:**
- Create: `packages/ui/src/browser/infoPanel/collapsibleSection.ts`
- Create: `packages/ui/src/browser/infoPanel/collapsibleSection.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// collapsibleSection.test.ts
import { describe, it, expect } from 'vitest';
import { CollapsibleSection } from './collapsibleSection.js';

describe('CollapsibleSection', () => {
  it('renders header with title and chevron', () => {
    const section = new CollapsibleSection('Progress');
    const el = section.getDomNode();
    expect(el.querySelector('.info-section-chevron')).toBeTruthy();
    expect(el.querySelector('.info-section-title')?.textContent).toBe('PROGRESS');
  });

  it('starts expanded by default', () => {
    const section = new CollapsibleSection('Progress');
    const body = section.getDomNode().querySelector('.info-section-body');
    expect(body?.getAttribute('style')).not.toContain('display: none');
  });

  it('starts collapsed when defaultCollapsed is true', () => {
    const section = new CollapsibleSection('Progress', { defaultCollapsed: true });
    expect(section.isCollapsed).toBe(true);
  });

  it('toggles collapse state on header click', () => {
    const section = new CollapsibleSection('Progress');
    const header = section.getDomNode().querySelector('.info-section-header') as HTMLElement;
    header.click();
    expect(section.isCollapsed).toBe(true);
    header.click();
    expect(section.isCollapsed).toBe(false);
  });

  it('updates badge text', () => {
    const section = new CollapsibleSection('Progress');
    section.setBadge('3 / 5');
    const badge = section.getDomNode().querySelector('.info-section-badge');
    expect(badge?.textContent).toBe('3 / 5');
  });

  it('shows and hides section', () => {
    const section = new CollapsibleSection('Test');
    section.setVisible(false);
    expect(section.getDomNode().style.display).toBe('none');
    section.setVisible(true);
    expect(section.getDomNode().style.display).toBe('');
  });

  it('provides body element for content', () => {
    const section = new CollapsibleSection('Test');
    expect(section.bodyElement).toBeInstanceOf(HTMLElement);
    expect(section.bodyElement.classList.contains('info-section-body')).toBe(true);
  });

  it('rotates chevron on collapse', () => {
    const section = new CollapsibleSection('Test');
    const chevron = section.getDomNode().querySelector('.info-section-chevron') as HTMLElement;
    section.setCollapsed(true);
    expect(chevron.classList.contains('info-section-chevron--collapsed')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/ui/src/browser/infoPanel/collapsibleSection.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement CollapsibleSection**

```typescript
// collapsibleSection.ts
import { Widget } from '../widget.js';
import { h, addDisposableListener } from '../dom.js';
import { Emitter } from '@gho-work/base';

export interface CollapsibleSectionOptions {
  defaultCollapsed?: boolean;
}

export class CollapsibleSection extends Widget {
  private _collapsed: boolean;
  private readonly _headerEl: HTMLElement;
  private readonly _bodyEl: HTMLElement;
  private readonly _chevronEl: HTMLElement;
  private readonly _badgeEl: HTMLElement;
  private readonly _titleEl: HTMLElement;

  private readonly _onDidToggle = this._register(new Emitter<boolean>());
  readonly onDidToggle = this._onDidToggle.event;

  constructor(title: string, options?: CollapsibleSectionOptions) {
    const chevron = h('span.info-section-chevron');
    const titleEl = h('span.info-section-title');
    titleEl.textContent = title.toUpperCase();
    const badge = h('span.info-section-badge');

    const header = h('div.info-section-header', chevron, titleEl, badge);
    const body = h('div.info-section-body');
    const root = h('section.info-section-container', header, body);

    super(root);

    this._headerEl = header;
    this._bodyEl = body;
    this._chevronEl = chevron;
    this._badgeEl = badge;
    this._titleEl = titleEl;
    this._collapsed = options?.defaultCollapsed ?? false;

    this._updateChevron();
    this._updateBodyVisibility();

    this._register(addDisposableListener(header, 'click', () => this.toggle()));
  }

  get isCollapsed(): boolean {
    return this._collapsed;
  }

  get bodyElement(): HTMLElement {
    return this._bodyEl;
  }

  toggle(): void {
    this.setCollapsed(!this._collapsed);
  }

  setCollapsed(collapsed: boolean): void {
    this._collapsed = collapsed;
    this._updateChevron();
    this._updateBodyVisibility();
    this._onDidToggle.fire(collapsed);
  }

  setBadge(text: string): void {
    this._badgeEl.textContent = text;
  }

  setBadgeStyle(style: Partial<CSSStyleDeclaration>): void {
    Object.assign(this._badgeEl.style, style);
  }

  setVisible(visible: boolean): void {
    this.element.style.display = visible ? '' : 'none';
  }

  private _updateChevron(): void {
    this._chevronEl.classList.toggle('info-section-chevron--collapsed', this._collapsed);
  }

  private _updateBodyVisibility(): void {
    this._bodyEl.style.display = this._collapsed ? 'none' : '';
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/ui/src/browser/infoPanel/collapsibleSection.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/browser/infoPanel/collapsibleSection.ts packages/ui/src/browser/infoPanel/collapsibleSection.test.ts
git commit -m "feat: add CollapsibleSection base widget for info panel"
```

---

## Chunk 2: New Sections — Agents, Skills, Usage

### Task 4: Create AgentsSection

**Files:**
- Create: `packages/ui/src/browser/infoPanel/agentsSection.ts`
- Create: `packages/ui/src/browser/infoPanel/agentsSection.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// agentsSection.test.ts
import { describe, it, expect } from 'vitest';
import { AgentsSection } from './agentsSection.js';

describe('AgentsSection', () => {
  it('starts hidden with no agents', () => {
    const section = new AgentsSection();
    expect(section.getDomNode().style.display).toBe('none');
  });

  it('shows when agent starts', () => {
    const section = new AgentsSection();
    section.addAgent('tc-1', 'code-reviewer', 'Code Reviewer');
    expect(section.getDomNode().style.display).toBe('');
  });

  it('shows running badge', () => {
    const section = new AgentsSection();
    section.addAgent('tc-1', 'reviewer', 'Code Reviewer');
    const badge = section.getDomNode().querySelector('.info-section-badge');
    expect(badge?.textContent).toBe('1 running');
  });

  it('updates agent to completed', () => {
    const section = new AgentsSection();
    section.addAgent('tc-1', 'reviewer', 'Code Reviewer');
    section.updateAgent('tc-1', 'completed');
    const statusBadge = section.getDomNode().querySelector('[data-agent-id="tc-1"] .info-agent-status');
    expect(statusBadge?.textContent).toBe('DONE');
  });

  it('updates agent to failed', () => {
    const section = new AgentsSection();
    section.addAgent('tc-1', 'reviewer', 'Code Reviewer');
    section.updateAgent('tc-1', 'failed', 'timeout');
    const statusBadge = section.getDomNode().querySelector('[data-agent-id="tc-1"] .info-agent-status');
    expect(statusBadge?.textContent).toBe('FAILED');
  });

  it('updates header badge count', () => {
    const section = new AgentsSection();
    section.addAgent('tc-1', 'reviewer', 'Code Reviewer');
    section.addAgent('tc-2', 'tester', 'Test Runner');
    expect(section.getDomNode().querySelector('.info-section-badge')?.textContent).toBe('2 running');
    section.updateAgent('tc-1', 'completed');
    expect(section.getDomNode().querySelector('.info-section-badge')?.textContent).toBe('1 running');
    section.updateAgent('tc-2', 'completed');
    expect(section.getDomNode().querySelector('.info-section-badge')?.textContent).toBe('all done');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/ui/src/browser/infoPanel/agentsSection.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement AgentsSection**

```typescript
// agentsSection.ts
import { CollapsibleSection } from './collapsibleSection.js';
import { h } from '../dom.js';

type AgentState = 'running' | 'completed' | 'failed';

interface AgentEntry {
  id: string;
  name: string;
  displayName: string;
  state: AgentState;
  el: HTMLElement;
  statusEl: HTMLElement;
  dotEl: HTMLElement;
}

export class AgentsSection extends CollapsibleSection {
  private readonly _agents = new Map<string, AgentEntry>();

  constructor() {
    super('Agents', { defaultCollapsed: true });
    this.setVisible(false);
  }

  addAgent(id: string, name: string, displayName: string): void {
    if (this._agents.has(id)) return;

    const dotEl = h('span.info-agent-dot.info-agent-dot--running');
    const nameEl = h('span.info-agent-name');
    nameEl.textContent = displayName || name;
    const statusEl = h('span.info-agent-status.info-agent-status--running');
    statusEl.textContent = 'RUNNING';

    const el = h('div.info-agent-card', dotEl, nameEl, statusEl);
    el.setAttribute('data-agent-id', id);

    this._agents.set(id, { id, name, displayName, state: 'running', el, statusEl, dotEl });
    this.bodyElement.appendChild(el);
    this.setVisible(true);
    this._updateBadge();
  }

  updateAgent(id: string, state: 'completed' | 'failed', error?: string): void {
    const entry = this._agents.get(id);
    if (!entry) return;

    entry.state = state;
    entry.dotEl.className = `info-agent-dot info-agent-dot--${state}`;
    entry.statusEl.className = `info-agent-status info-agent-status--${state}`;
    entry.statusEl.textContent = state === 'completed' ? 'DONE' : 'FAILED';

    if (state === 'completed') {
      entry.el.classList.add('info-agent-card--dimmed');
    }

    this._updateBadge();
  }

  /** Restore agents from state on conversation switch */
  setAgents(agents: Array<{ id: string; name: string; displayName: string; state: AgentState }>): void {
    this._agents.clear();
    this.bodyElement.textContent = '';
    for (const a of agents) {
      this.addAgent(a.id, a.name, a.displayName);
      if (a.state !== 'running') {
        this.updateAgent(a.id, a.state);
      }
    }
    this.setVisible(agents.length > 0);
  }

  getAgentEntries(): Array<{ id: string; name: string; displayName: string; state: AgentState }> {
    return [...this._agents.values()].map(a => ({
      id: a.id, name: a.name, displayName: a.displayName, state: a.state,
    }));
  }

  private _updateBadge(): void {
    const running = [...this._agents.values()].filter(a => a.state === 'running').length;
    this.setBadge(running > 0 ? `${running} running` : 'all done');
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/ui/src/browser/infoPanel/agentsSection.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/browser/infoPanel/agentsSection.ts packages/ui/src/browser/infoPanel/agentsSection.test.ts
git commit -m "feat: add AgentsSection widget for info panel"
```

---

### Task 5: Create SkillsSection

**Files:**
- Create: `packages/ui/src/browser/infoPanel/skillsSection.ts`
- Create: `packages/ui/src/browser/infoPanel/skillsSection.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// skillsSection.test.ts
import { describe, it, expect } from 'vitest';
import { SkillsSection } from './skillsSection.js';

describe('SkillsSection', () => {
  it('starts hidden', () => {
    const section = new SkillsSection();
    expect(section.getDomNode().style.display).toBe('none');
  });

  it('shows when skill invoked', () => {
    const section = new SkillsSection();
    section.updateSkill('brainstorming', 'running');
    expect(section.getDomNode().style.display).toBe('');
  });

  it('shows active badge', () => {
    const section = new SkillsSection();
    section.updateSkill('brainstorming', 'running');
    expect(section.getDomNode().querySelector('.info-section-badge')?.textContent).toBe('1 active');
  });

  it('updates skill to completed', () => {
    const section = new SkillsSection();
    section.updateSkill('brainstorming', 'running');
    section.updateSkill('brainstorming', 'completed');
    const status = section.getDomNode().querySelector('[data-skill="brainstorming"] .info-skill-status');
    expect(status?.textContent).toBe('DONE');
  });

  it('tracks multiple skills', () => {
    const section = new SkillsSection();
    section.updateSkill('brainstorming', 'running');
    section.updateSkill('debugging', 'running');
    expect(section.getDomNode().querySelector('.info-section-badge')?.textContent).toBe('2 active');
    section.updateSkill('brainstorming', 'completed');
    expect(section.getDomNode().querySelector('.info-section-badge')?.textContent).toBe('1 active');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/ui/src/browser/infoPanel/skillsSection.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement SkillsSection**

```typescript
// skillsSection.ts
import { CollapsibleSection } from './collapsibleSection.js';
import { h } from '../dom.js';

type SkillState = 'running' | 'completed' | 'failed';

interface SkillEntry {
  name: string;
  state: SkillState;
  el: HTMLElement;
  dotEl: HTMLElement;
  statusEl: HTMLElement;
}

export class SkillsSection extends CollapsibleSection {
  private readonly _skills = new Map<string, SkillEntry>();

  constructor() {
    super('Skills', { defaultCollapsed: true });
    this.setVisible(false);
  }

  updateSkill(skillName: string, state: SkillState): void {
    let entry = this._skills.get(skillName);

    if (!entry) {
      const dotEl = h('span.info-skill-dot');
      const nameEl = h('span.info-skill-name');
      nameEl.textContent = skillName;
      const statusEl = h('span.info-skill-status');

      const el = h('div.info-skill-row', dotEl, nameEl, statusEl);
      el.setAttribute('data-skill', skillName);

      entry = { name: skillName, state, el, dotEl, statusEl };
      this._skills.set(skillName, entry);
      this.bodyElement.appendChild(el);
      this.setVisible(true);
    }

    entry.state = state;
    entry.dotEl.className = `info-skill-dot info-skill-dot--${state}`;
    entry.statusEl.className = `info-skill-status info-skill-status--${state}`;
    entry.statusEl.textContent = state === 'running' ? 'ACTIVE' : state === 'completed' ? 'DONE' : 'FAILED';

    this._updateBadge();
  }

  setSkills(skills: Array<{ name: string; state: SkillState }>): void {
    this._skills.clear();
    this.bodyElement.textContent = '';
    for (const s of skills) {
      this.updateSkill(s.name, s.state);
    }
    this.setVisible(skills.length > 0);
  }

  getSkillEntries(): Array<{ name: string; state: SkillState }> {
    return [...this._skills.values()].map(s => ({ name: s.name, state: s.state }));
  }

  private _updateBadge(): void {
    const active = [...this._skills.values()].filter(s => s.state === 'running').length;
    this.setBadge(active > 0 ? `${active} active` : '');
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/ui/src/browser/infoPanel/skillsSection.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/browser/infoPanel/skillsSection.ts packages/ui/src/browser/infoPanel/skillsSection.test.ts
git commit -m "feat: add SkillsSection widget for info panel"
```

---

### Task 6: Create UsageSection

**Files:**
- Create: `packages/ui/src/browser/infoPanel/usageSection.ts`
- Create: `packages/ui/src/browser/infoPanel/usageSection.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// usageSection.test.ts
import { describe, it, expect } from 'vitest';
import { UsageSection } from './usageSection.js';

describe('UsageSection', () => {
  it('starts hidden', () => {
    const section = new UsageSection();
    expect(section.getDomNode().style.display).toBe('none');
  });

  it('shows when quota data arrives', () => {
    const section = new UsageSection();
    section.update({ used: 642, total: 1000, remainingPercentage: 36, resetDate: '2026-03-21' });
    expect(section.getDomNode().style.display).toBe('');
  });

  it('shows used percentage badge', () => {
    const section = new UsageSection();
    section.update({ used: 642, total: 1000, remainingPercentage: 36, resetDate: '2026-03-21' });
    // Badge shows used percentage: 100 - remainingPercentage
    expect(section.getDomNode().querySelector('.info-section-badge')?.textContent).toBe('64%');
  });

  it('renders request counts', () => {
    const section = new UsageSection();
    section.update({ used: 642, total: 1000, remainingPercentage: 36, resetDate: '2026-03-21' });
    const text = section.getDomNode().querySelector('.info-usage-requests')?.textContent;
    expect(text).toContain('642');
    expect(text).toContain('1,000');
  });

  it('renders reset date', () => {
    const section = new UsageSection();
    section.update({ used: 100, total: 1000, remainingPercentage: 90, resetDate: '2026-03-21' });
    const text = section.getDomNode().querySelector('.info-usage-reset')?.textContent;
    expect(text).toContain('Mar 21');
  });

  it('sets progress bar width', () => {
    const section = new UsageSection();
    section.update({ used: 500, total: 1000, remainingPercentage: 50, resetDate: '2026-03-21' });
    const bar = section.getDomNode().querySelector('.info-usage-bar-fill') as HTMLElement;
    expect(bar?.style.width).toBe('50%');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/ui/src/browser/infoPanel/usageSection.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement UsageSection**

```typescript
// usageSection.ts
import { CollapsibleSection } from './collapsibleSection.js';
import { h } from '../dom.js';

export interface UsageData {
  used: number;
  total: number;
  remainingPercentage: number;
  resetDate?: string;
}

export class UsageSection extends CollapsibleSection {
  private readonly _barFill: HTMLElement;
  private readonly _requestsEl: HTMLElement;
  private readonly _resetEl: HTMLElement;
  private _latestData: UsageData | null = null;

  constructor() {
    super('Usage', { defaultCollapsed: true });
    this.setVisible(false);

    const barTrack = h('div.info-usage-bar-track');
    this._barFill = h('div.info-usage-bar-fill');
    barTrack.appendChild(this._barFill);

    this._requestsEl = h('span.info-usage-requests');
    this._resetEl = h('span.info-usage-reset');
    const footer = h('div.info-usage-footer', this._requestsEl, this._resetEl);

    this.bodyElement.appendChild(barTrack);
    this.bodyElement.appendChild(footer);
  }

  update(data: UsageData): void {
    this._latestData = data;
    // Use server-provided remainingPercentage to avoid rounding mismatches
    const usedPct = 100 - data.remainingPercentage;

    this._barFill.style.width = `${usedPct}%`;
    this._requestsEl.textContent = `${data.used.toLocaleString()} / ${data.total.toLocaleString()} requests`;

    if (data.resetDate) {
      const date = new Date(data.resetDate);
      const formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      this._resetEl.textContent = `Resets ${formatted}`;
    } else {
      this._resetEl.textContent = '';
    }

    this.setBadge(`${usedPct}%`);
    this.setVisible(true);
  }

  getLatestData(): UsageData | null {
    return this._latestData;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/ui/src/browser/infoPanel/usageSection.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/browser/infoPanel/usageSection.ts packages/ui/src/browser/infoPanel/usageSection.test.ts
git commit -m "feat: add UsageSection widget for info panel"
```

---

## Chunk 3: Reskin Existing Sections

### Task 7: Reskin TodoListWidget as timeline with progress ring

**Files:**
- Modify: `packages/ui/src/browser/infoPanel/todoListWidget.ts`
- Modify: `packages/ui/src/browser/infoPanel/todoListWidget.test.ts` (create if not exists, or update existing tests in `infoPanel.test.ts`)

This is the most visually complex change. The current widget uses a flat list with unicode icons. Replace with:
- A `CollapsibleSection` wrapper (title: "Progress", default expanded)
- An SVG progress ring at the top
- A connected vertical timeline with green checkmarks, purple active dots, and dim pending circles

- [ ] **Step 1: Write failing tests for the new timeline rendering**

Create `packages/ui/src/browser/infoPanel/todoListWidget.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { TodoListWidget } from './todoListWidget.js';

describe('TodoListWidget (timeline)', () => {
  it('starts hidden', () => {
    const widget = new TodoListWidget();
    expect(widget.getDomNode().style.display).toBe('none');
  });

  it('shows when todos arrive', () => {
    const widget = new TodoListWidget();
    widget.setTodos([{ id: 1, title: 'Step 1', status: 'not-started' }]);
    expect(widget.getDomNode().style.display).toBe('');
  });

  it('renders progress ring with correct count', () => {
    const widget = new TodoListWidget();
    widget.setTodos([
      { id: 1, title: 'Done', status: 'completed' },
      { id: 2, title: 'Active', status: 'in-progress' },
      { id: 3, title: 'Pending', status: 'not-started' },
    ]);
    const counter = widget.getDomNode().querySelector('.info-progress-counter');
    expect(counter?.textContent).toContain('1');
    expect(counter?.textContent).toContain('3');
  });

  it('renders completed step with checkmark class', () => {
    const widget = new TodoListWidget();
    widget.setTodos([{ id: 1, title: 'Done', status: 'completed' }]);
    expect(widget.getDomNode().querySelector('.info-timeline-node--completed')).toBeTruthy();
  });

  it('renders active step with active class', () => {
    const widget = new TodoListWidget();
    widget.setTodos([{ id: 1, title: 'Active', status: 'in-progress' }]);
    expect(widget.getDomNode().querySelector('.info-timeline-node--in-progress')).toBeTruthy();
  });

  it('renders pending step with pending class', () => {
    const widget = new TodoListWidget();
    widget.setTodos([{ id: 1, title: 'Pending', status: 'not-started' }]);
    expect(widget.getDomNode().querySelector('.info-timeline-node--not-started')).toBeTruthy();
  });

  it('sets badge to N / M', () => {
    const widget = new TodoListWidget();
    widget.setTodos([
      { id: 1, title: 'Done', status: 'completed' },
      { id: 2, title: 'Pending', status: 'not-started' },
    ]);
    const badge = widget.getDomNode().querySelector('.info-section-badge');
    expect(badge?.textContent).toBe('1 / 2');
  });

  it('starts expanded by default', () => {
    const widget = new TodoListWidget();
    expect(widget.isCollapsed).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/ui/src/browser/infoPanel/todoListWidget.test.ts`
Expected: FAIL (current widget has different class names and structure)

- [ ] **Step 3: Rewrite TodoListWidget using CollapsibleSection**

Replace the content of `todoListWidget.ts`. The new widget:
- Extends `CollapsibleSection` (title: "Progress", defaultCollapsed: false)
- Has a `_ringEl` for the SVG progress ring
- Has a `_timelineEl` container for timeline nodes
- `setTodos()` clears and re-renders both ring and timeline
- Each timeline node gets a class `info-timeline-node--{status}`
- Completed nodes: green circle with SVG checkmark + green connector line
- Active node: purple bordered circle with inner dot + card wrapper
- Pending nodes: small dim empty circle

Reference: `.superpowers/brainstorm/80423-1773615754/info-panel-timeline-v2.html` for exact colors and visual details.

Skeleton implementation:

```typescript
// todoListWidget.ts
import { CollapsibleSection } from './collapsibleSection.js';
import { h } from '../dom.js';
import type { TodoItem } from './infoPanelState.js';

const RING_RADIUS = 20;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export class TodoListWidget extends CollapsibleSection {
  private readonly _ringContainer: HTMLElement;
  private readonly _timelineEl: HTMLElement;
  private _todos: TodoItem[] = [];

  constructor() {
    super('Progress', { defaultCollapsed: false });
    this.setVisible(false);
    this._ringContainer = h('div.info-progress-ring-container');
    this._timelineEl = h('div.info-timeline');
    this.bodyElement.appendChild(this._ringContainer);
    this.bodyElement.appendChild(this._timelineEl);
  }

  setTodos(todos: TodoItem[]): void {
    this._todos = todos;
    this.setVisible(todos.length > 0);
    this._render();
  }

  private _render(): void {
    const completed = this._todos.filter(t => t.status === 'completed').length;
    const total = this._todos.length;
    this.setBadge(`${completed} / ${total}`);
    this._renderRing(completed, total);
    this._renderTimeline();
  }

  private _renderRing(completed: number, total: number): void {
    this._ringContainer.textContent = '';
    const fraction = total > 0 ? completed / total : 0;
    const offset = RING_CIRCUMFERENCE * (1 - fraction);
    // Create SVG ring using document.createElementNS
    // Background circle: r=RING_RADIUS, stroke rgba(255,255,255,0.06), stroke-width 3.5
    // Progress circle: stroke-dasharray=CIRCUMFERENCE, stroke-dashoffset=offset, stroke-linecap round
    // Counter overlay: h('div.info-progress-counter') with completed/total text
    // Use createElementNS for all SVG elements — do NOT use innerHTML
  }

  private _renderTimeline(): void {
    this._timelineEl.textContent = '';
    this._todos.forEach((todo, i) => {
      const isLast = i === this._todos.length - 1;
      const node = this._makeNode(todo, isLast);
      this._timelineEl.appendChild(node);
    });
  }

  private _makeNode(todo: TodoItem, isLast: boolean): HTMLElement {
    const node = h(`div.info-timeline-node.info-timeline-node--${todo.status}`);
    node.setAttribute('role', 'listitem');

    // Circle indicator — use createElementNS for SVG checkmark, h() for DOM elements
    const circle = h('div.info-timeline-circle');
    if (todo.status === 'completed') {
      // Green checkmark: SVG path "M2 6l3 3 5-5" via createElementNS
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '8');
      svg.setAttribute('height', '8');
      svg.setAttribute('viewBox', '0 0 12 12');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M2 6l3 3 5-5');
      path.setAttribute('stroke', '#fff');
      path.setAttribute('stroke-width', '2.2');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      path.setAttribute('fill', 'none');
      svg.appendChild(path);
      circle.appendChild(svg);
    } else if (todo.status === 'in-progress') {
      circle.appendChild(h('div.info-timeline-inner-dot'));
    }

    // Connector line (not on last node)
    if (!isLast) {
      node.appendChild(h('div.info-timeline-connector'));
    }

    // Label
    const label = h('div.info-timeline-label');
    if (todo.status === 'in-progress') {
      const card = h('div.info-timeline-active-card');
      const title = h('div.info-timeline-active-title');
      title.textContent = todo.title;
      const subtitle = h('div.info-timeline-active-subtitle');
      subtitle.textContent = 'Working on it...';
      card.appendChild(title);
      card.appendChild(subtitle);
      label.appendChild(card);
    } else {
      label.textContent = todo.title;
    }

    node.appendChild(circle);
    node.appendChild(label);
    return node;
  }
}
```

Colors and exact sizing should match the mockup. Key values:
- Completed: `#00b894` (green), circle 14px
- Active: `#6c5ce7` (purple), circle 16px with `box-shadow: 0 0 0 3px rgba(108,92,231,0.15)`
- Pending: `rgba(255,255,255,0.12)` border, circle 10px
- Connector: 2px wide, green for completed segments, `rgba(255,255,255,0.06)` for pending

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/ui/src/browser/infoPanel/todoListWidget.test.ts`
Expected: PASS

- [ ] **Step 5: Update existing infoPanel.test.ts**

The existing test at `infoPanel.test.ts` line 25–35 checks that empty state hides after `todo_list_updated`. This should still pass since `TodoListWidget.setTodos()` still gets called the same way. Verify:

Run: `npx vitest run packages/ui/src/browser/infoPanel/infoPanel.test.ts`
Expected: PASS (may need minor updates if class names changed)

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/browser/infoPanel/todoListWidget.ts packages/ui/src/browser/infoPanel/todoListWidget.test.ts
git commit -m "feat: reskin TodoListWidget as connected timeline with progress ring"
```

---

### Task 8: Wrap InputSection and OutputSection in CollapsibleSection

**Files:**
- Modify: `packages/ui/src/browser/infoPanel/inputSection.ts`
- Modify: `packages/ui/src/browser/infoPanel/outputSection.ts`

Both sections currently extend `Widget` directly. Refactor them to extend `CollapsibleSection` instead. The body content stays the same — we're just wrapping it in the collapsible container.

- [ ] **Step 1: Refactor InputSection to extend CollapsibleSection**

Change class declaration from `extends Widget` to `extends CollapsibleSection`. Constructor:
- Call `super('Input', { defaultCollapsed: true })` instead of creating manual header/body elements
- Move entry list into `this.bodyElement` instead of a custom `_bodyEl`
- Update `addEntry` to use `this.bodyElement`
- Remove manual header creation (the CollapsibleSection provides it)
- Update badge: call `this.setBadge(String(count))` when entries change

- [ ] **Step 2: Refactor OutputSection to extend CollapsibleSection**

Same pattern:
- Call `super('Output', { defaultCollapsed: true })`
- Move entry list into `this.bodyElement`
- Update badge on entry add

- [ ] **Step 3: Run existing tests**

Run: `npx vitest run packages/ui/src/browser/infoPanel/`
Expected: PASS (existing tests may need minor class name updates)

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/browser/infoPanel/inputSection.ts packages/ui/src/browser/infoPanel/outputSection.ts
git commit -m "refactor: wrap Input and Output sections in CollapsibleSection"
```

---

### Task 9: Enrich ContextSection with MCP servers and skills, wrap in CollapsibleSection

**Files:**
- Modify: `packages/ui/src/browser/infoPanel/contextSection.ts`
- Create: `packages/ui/src/browser/infoPanel/contextSection.test.ts` (if not exists, add tests for new sub-groups)

- [ ] **Step 1: Write tests for new sub-groups**

```typescript
// Add to contextSection.test.ts
import { describe, it, expect } from 'vitest';
import { ContextSection } from './contextSection.js';

describe('ContextSection', () => {
  it('renders instruction sources', () => {
    const section = new ContextSection();
    section.setSources([{ path: '/home/user/.gho/instructions.md', origin: 'user', format: 'md' }]);
    expect(section.getDomNode().querySelectorAll('.info-context-source').length).toBe(1);
  });

  it('renders registered agents', () => {
    const section = new ContextSection();
    section.setAgents([{ name: 'code-reviewer', plugin: 'review-tools' }]);
    expect(section.getDomNode().querySelectorAll('.info-context-agent').length).toBe(1);
  });

  it('renders available skills', () => {
    const section = new ContextSection();
    section.setSkills([{ name: 'brainstorming', source: 'superpowers' }]);
    expect(section.getDomNode().querySelectorAll('.info-context-skill').length).toBe(1);
  });

  it('renders MCP servers', () => {
    const section = new ContextSection();
    section.updateServer('sqlite', 'connected', 'stdio');
    expect(section.getDomNode().querySelectorAll('.info-context-server').length).toBe(1);
  });

  it('shows error for MCP server in error state', () => {
    const section = new ContextSection();
    section.updateServer('github-api', 'error', 'http', 'Connection refused');
    const errorEl = section.getDomNode().querySelector('.info-context-server-error');
    expect(errorEl?.textContent).toContain('Connection refused');
  });

  it('updates badge with total count', () => {
    const section = new ContextSection();
    section.setSources([{ path: '/a', origin: 'user', format: 'md' }]);
    section.setAgents([{ name: 'reviewer', plugin: 'tools' }]);
    section.updateServer('sqlite', 'connected', 'stdio');
    // badge should show total count
    const badge = section.getDomNode().querySelector('.info-section-badge');
    expect(badge?.textContent).toBe('3');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/ui/src/browser/infoPanel/contextSection.test.ts`
Expected: FAIL

- [ ] **Step 3: Refactor ContextSection**

- Change to extend `CollapsibleSection` (title: "Context", defaultCollapsed: true)
- Add two new sub-groups with their own sub-headers and lists:
  - **Skills** sub-group: `h4` header + `ul` list, each skill shows name + source badge
  - **MCP Servers** sub-group: `h4` header + `ul` list, each server shows status dot + name + type badge + optional error
- Add new public methods:
  - `setSkills(skills: Array<{ name: string; source: string }>): void`
  - `updateServer(name: string, status: string, type: string, error?: string): void`
  - `setServers(servers: Array<{ name: string; status: string; type: string; error?: string }>): void`
- **Important: MCP server state is global, not per-conversation.** The server list and status should NOT be cleared by `_updateVisibility()` or any per-conversation reset. Store servers in a separate `_servers` Map that persists across conversation switches. The `setSources()`, `setAgents()`, and `setSkills()` methods may be called on conversation switch; `_servers` stays.
- Update `_updateVisibility()` to check all 4 sub-groups
- Update badge to show total count across all sub-groups

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/ui/src/browser/infoPanel/contextSection.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/browser/infoPanel/contextSection.ts packages/ui/src/browser/infoPanel/contextSection.test.ts
git commit -m "feat: enrich ContextSection with MCP servers and skills sub-groups"
```

---

## Chunk 4: Wire Everything Together

### Task 10: Update InfoPanelState for new sections

**Files:**
- Modify: `packages/ui/src/browser/infoPanel/infoPanelState.ts`
- Modify: `packages/ui/src/browser/infoPanel/infoPanelState.test.ts`

- [ ] **Step 1: Add new state fields**

Add to `InfoPanelState`:

```typescript
// New per-conversation fields
private _agents: Array<{ id: string; name: string; displayName: string; state: AgentState }> = [];
private _skills: Array<{ name: string; state: SkillState }> = [];
private _usageData: UsageData | null = null;
private _collapseState: Map<string, boolean> = new Map();

// Getters
get agents(): readonly Array<...> { return this._agents; }
get skills(): readonly Array<...> { return this._skills; }
get usageData(): UsageData | null { return this._usageData; }
get collapseState(): ReadonlyMap<string, boolean> { return this._collapseState; }

// Setters
setAgents(agents: ...): void { this._agents = [...agents]; }
setSkills(skills: ...): void { this._skills = [...skills]; }
setUsageData(data: UsageData): void { this._usageData = data; }
setCollapsed(section: string, collapsed: boolean): void { this._collapseState.set(section, collapsed); }
isCollapsed(section: string): boolean | undefined { return this._collapseState.get(section); }
```

Update `clear()` to also clear agents, skills (but NOT usageData or collapseState — those persist).

- [ ] **Step 2: Write tests**

Add tests for new state fields in `infoPanelState.test.ts`:

```typescript
describe('InfoPanelState — agents', () => {
  it('stores and retrieves agent entries', () => {
    const state = new InfoPanelState();
    state.setAgents([{ id: 'tc-1', name: 'reviewer', displayName: 'Code Reviewer', state: 'running' }]);
    expect(state.agents).toHaveLength(1);
    expect(state.agents[0].state).toBe('running');
  });

  it('clears agents on clear()', () => {
    const state = new InfoPanelState();
    state.setAgents([{ id: 'tc-1', name: 'reviewer', displayName: 'Code Reviewer', state: 'running' }]);
    state.clear();
    expect(state.agents).toHaveLength(0);
  });
});

describe('InfoPanelState — skills', () => {
  it('stores and retrieves skill entries', () => {
    const state = new InfoPanelState();
    state.setSkills([{ name: 'brainstorming', state: 'running' }]);
    expect(state.skills).toHaveLength(1);
  });

  it('clears skills on clear()', () => {
    const state = new InfoPanelState();
    state.setSkills([{ name: 'brainstorming', state: 'running' }]);
    state.clear();
    expect(state.skills).toHaveLength(0);
  });
});

describe('InfoPanelState — usage', () => {
  it('stores usage data', () => {
    const state = new InfoPanelState();
    state.setUsageData({ used: 500, total: 1000, remainingPercentage: 50 });
    expect(state.usageData?.used).toBe(500);
  });

  it('preserves usage data on clear()', () => {
    const state = new InfoPanelState();
    state.setUsageData({ used: 500, total: 1000, remainingPercentage: 50 });
    state.clear();
    expect(state.usageData).not.toBeNull();
  });
});

describe('InfoPanelState — collapse state', () => {
  it('tracks collapse per section', () => {
    const state = new InfoPanelState();
    state.setCollapsed('progress', true);
    state.setCollapsed('agents', false);
    expect(state.isCollapsed('progress')).toBe(true);
    expect(state.isCollapsed('agents')).toBe(false);
  });

  it('preserves collapse state on clear()', () => {
    const state = new InfoPanelState();
    state.setCollapsed('progress', true);
    state.clear();
    expect(state.isCollapsed('progress')).toBe(true);
  });

  it('returns undefined for unset sections', () => {
    const state = new InfoPanelState();
    expect(state.isCollapsed('unknown')).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run packages/ui/src/browser/infoPanel/infoPanelState.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/browser/infoPanel/infoPanelState.ts packages/ui/src/browser/infoPanel/infoPanelState.test.ts
git commit -m "feat: extend InfoPanelState with agents, skills, usage, collapse tracking"
```

---

### Task 11: Rewrite InfoPanel to compose all 7 sections with auto-hide

**Files:**
- Modify: `packages/ui/src/browser/infoPanel/infoPanel.ts`
- Modify: `packages/ui/src/browser/infoPanel/infoPanel.test.ts`

This is the main integration task. The InfoPanel needs to:
1. Create all 7 sections (Progress, Agents, Skills, Input, Output, Context, Usage)
2. Route all event types to the correct section
3. Track collapse state per section in InfoPanelState
4. Auto-hide the entire panel when all sections are hidden
5. Auto-show when any section gets data

- [ ] **Step 1: Update tests for new structure**

Update `infoPanel.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { InfoPanel } from './infoPanel.js';

describe('InfoPanel (redesigned)', () => {
  it('creates all 7 section containers', () => {
    const panel = new InfoPanel();
    const el = panel.getDomNode();
    const sections = el.querySelectorAll('.info-section-container');
    expect(sections.length).toBe(7);
  });

  it('auto-hides when all sections empty', () => {
    const panel = new InfoPanel();
    expect(panel.getDomNode().style.display).toBe('none');
  });

  it('auto-shows when todos arrive', () => {
    const panel = new InfoPanel();
    panel.handleEvent({
      type: 'todo_list_updated',
      todos: [{ id: 1, title: 'Step 1', status: 'not-started' }],
    });
    expect(panel.getDomNode().style.display).toBe('');
  });

  it('routes skill_invoked to SkillsSection', () => {
    const panel = new InfoPanel();
    panel.handleEvent({ type: 'skill_invoked', skillName: 'brainstorming', state: 'running' });
    const skillEl = panel.getDomNode().querySelector('[data-skill="brainstorming"]');
    expect(skillEl).toBeTruthy();
  });

  it('routes subagent_started to AgentsSection', () => {
    const panel = new InfoPanel();
    panel.handleEvent({
      type: 'subagent_started',
      parentToolCallId: 'tc-1',
      name: 'reviewer',
      displayName: 'Code Reviewer',
    });
    const agentEl = panel.getDomNode().querySelector('[data-agent-id="tc-1"]');
    expect(agentEl).toBeTruthy();
  });

  it('preserves collapse state across conversation switch', () => {
    const panel = new InfoPanel();
    panel.setConversation('conv-1');
    // Add todos so Progress section is visible
    panel.handleEvent({
      type: 'todo_list_updated',
      todos: [{ id: 1, title: 'Step 1', status: 'not-started' }],
    });
    // Collapse will be tracked when user clicks header — simulate via state
    // Switch conversations and back
    panel.setConversation('conv-2');
    panel.setConversation('conv-1');
    // Todos should be restored
    const timeline = panel.getDomNode().querySelector('.info-timeline-node');
    expect(timeline).toBeTruthy();
  });

  it('has correct ARIA attributes', () => {
    const panel = new InfoPanel();
    expect(panel.getDomNode().getAttribute('role')).toBe('complementary');
    expect(panel.getDomNode().getAttribute('aria-label')).toBe('Task info');
  });
});
```

- [ ] **Step 2: Rewrite InfoPanel**

Key changes to `infoPanel.ts`:
- Replace the 4 wrapper divs with 7 section instances
- DOM structure becomes:
  ```
  div.info-panel (root)
    ├─ TodoListWidget (CollapsibleSection)
    ├─ AgentsSection (CollapsibleSection)
    ├─ SkillsSection (CollapsibleSection)
    ├─ InputSection (CollapsibleSection)
    ├─ OutputSection (CollapsibleSection)
    ├─ ContextSection (CollapsibleSection)
    └─ UsageSection (CollapsibleSection)
  ```
- No more `_emptyEl` — the panel itself hides when all sections are hidden
- `handleEvent()` adds cases for `skill_invoked`, `subagent_started`, `subagent_completed`, `subagent_failed`
- Add `handleQuotaChanged(data)` and `handleConnectorStatus(name, status, type, error)` public methods (called from workbench, not from AgentEvent)
- `_updateVisibility()` checks all 7 sections; hides panel root if all hidden
- `_rebuildSections()` restores collapse state from `InfoPanelState._collapseState`
- Subscribe to each section's `onDidToggle` to save collapse state

- [ ] **Step 3: Run tests**

Run: `npx vitest run packages/ui/src/browser/infoPanel/`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/browser/infoPanel/infoPanel.ts packages/ui/src/browser/infoPanel/infoPanel.test.ts
git commit -m "feat: rewrite InfoPanel with 7 collapsible sections and auto-hide"
```

---

### Task 12: Wire new events in workbench.ts

**Files:**
- Modify: `packages/ui/src/browser/workbench.ts`
- Modify: `packages/ui/src/browser/infoPanel/index.ts` (update barrel exports)

- [ ] **Step 1: Update barrel exports**

Add new exports to `packages/ui/src/browser/infoPanel/index.ts`:

```typescript
export { CollapsibleSection } from './collapsibleSection.js';
export { AgentsSection } from './agentsSection.js';
export { SkillsSection } from './skillsSection.js';
export { UsageSection } from './usageSection.js';
```

- [ ] **Step 2: Wire connector status events in workbench.ts**

Add IPC subscription for `CONNECTOR_STATUS_CHANGED`:

```typescript
this._ipc.on(IPC_CHANNELS.CONNECTOR_STATUS_CHANGED, (...args: unknown[]) => {
  const data = args[0] as ConnectorStatusChanged;
  this._infoPanel.handleConnectorStatus(data.name, data.status, 'stdio', data.error);
});
```

Seed from `CONNECTOR_LIST` on startup:

```typescript
const connectorList = await this._ipc.invoke(IPC_CHANNELS.CONNECTOR_LIST);
for (const server of connectorList.servers) {
  this._infoPanel.handleConnectorStatus(server.name, server.status, server.type);
}
```

- [ ] **Step 3: Wire quota events**

Add IPC subscription for `QUOTA_CHANGED`:

```typescript
this._ipc.on(IPC_CHANNELS.QUOTA_CHANGED, (...args: unknown[]) => {
  const data = args[0] as QuotaSnapshot;
  this._infoPanel.handleQuotaChanged({
    used: data.usedRequests,
    total: data.entitlementRequests,
    remainingPercentage: data.remainingPercentage,
    resetDate: data.resetDate,
  });
});
```

- [ ] **Step 4: Remove old auto-show logic**

The old `_autoShowInfoPanel()` and `_userCollapsedInfoPanel` logic can be simplified. The panel now auto-shows/hides based on section visibility. Remove the old toggle behavior if present.

- [ ] **Step 5: Update panel container visibility**

The workbench currently wraps the info panel in a container with `display: 'none'`. The InfoPanel now manages its own visibility. Add an `onDidChangeVisibility` event to InfoPanel that the workbench subscribes to, toggling the container's display. This follows the VS Code event pattern already used for `onDidRequestScrollToMessage` etc.

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/browser/workbench.ts packages/ui/src/browser/infoPanel/index.ts
git commit -m "feat: wire connector status, quota, and new section events in workbench"
```

---

## Chunk 5: CSS + E2E

### Task 13: Add CSS for all new components

**Files:**
- Modify: the CSS file that styles the info panel (find with `Glob: "**/*infoPanel*.css"` or check if styles are inline in the widget files)

All the new components need CSS. Key classes to style:

**CollapsibleSection:**
- `.info-section-container` — border, border-radius, background, margin-bottom
- `.info-section-header` — flex, padding, cursor pointer, hover state
- `.info-section-chevron` — size, color, transition for rotation
- `.info-section-chevron--collapsed` — transform: rotate(-90deg)
- `.info-section-title` — uppercase, letter-spacing, font-size, color
- `.info-section-badge` — font-size, padding, border-radius
- `.info-section-body` — padding

**Progress timeline:**
- `.info-timeline-node` — relative positioning for connector lines
- `.info-timeline-node--completed` — green checkmark styling
- `.info-timeline-node--in-progress` — purple glow, expanded card
- `.info-timeline-node--not-started` — dim circle
- `.info-progress-ring` — SVG sizing
- `.info-progress-counter` — absolute positioned text in ring center

**AgentsSection:**
- `.info-agent-card` — border, padding, flex layout
- `.info-agent-card--dimmed` — reduced opacity
- `.info-agent-dot` — width/height, border-radius
- `.info-agent-dot--running` — amber color + box-shadow glow
- `.info-agent-dot--completed` — green
- `.info-agent-dot--failed` — red
- `.info-agent-status` — font-size, padding, border-radius badge

**SkillsSection:**
- `.info-skill-row` — flex layout
- `.info-skill-dot--running` — blue + glow
- `.info-skill-dot--completed` — green
- `.info-skill-dot--failed` — red

**UsageSection:**
- `.info-usage-bar-track` — height, background, border-radius
- `.info-usage-bar-fill` — gradient, border-radius, transition
- `.info-usage-footer` — flex, justify-content space-between
- `.info-usage-requests`, `.info-usage-reset` — font-size, color

**Context sub-groups:**
- `.info-context-server` — flex layout with status dot
- `.info-context-server-error` — red text, small font
- `.info-context-skill` — flex layout with dot

- [ ] **Step 1: Find CSS location**

Run: `Glob: "**/*infoPanel*.css"` and check if styles are in a separate CSS file or inline in widget constructors. This codebase follows VS Code patterns — styles may be applied inline via `element.style` in the widget constructor, or in a shared CSS file loaded by the workbench. If no separate CSS file exists, add styles inline in each widget's constructor using `element.style` assignments, or create a new `packages/ui/src/browser/infoPanel/infoPanel.css` imported by the workbench.

- [ ] **Step 2: Add all CSS rules**

Reference the mockup at `.superpowers/brainstorm/80423-1773615754/info-panel-full-v5.html` for exact colors, spacing, and visual treatment.

- [ ] **Step 3: Run build to verify CSS compiles**

Run: `npx turbo build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add <css files>
git commit -m "style: add CSS for info panel redesign — collapsible sections, timeline, new widgets"
```

---

### Task 14: E2E tests

**Files:**
- Create or modify: `tests/e2e/info-panel.spec.ts`

- [ ] **Step 1: Write E2E test — panel auto-hides on empty conversation**

```typescript
test('info panel hidden on new conversation', async ({ page }) => {
  // Start fresh conversation
  // Assert info panel container is not visible
  const panel = page.locator('.info-panel');
  await expect(panel).not.toBeVisible();
});
```

- [ ] **Step 2: Write E2E test — panel shows when todos arrive**

```typescript
test('info panel shows progress section when todos arrive', async ({ page }) => {
  // Send a message that will trigger todo creation (e.g., "Plan a trip")
  // Wait for info panel to become visible
  // Assert Progress section is expanded
  // Assert at least one timeline node exists
  await expect(page.locator('.info-section-container').first()).toBeVisible();
  await expect(page.locator('.info-timeline-node')).toHaveCount({ minimum: 1 });
});
```

- [ ] **Step 3: Write E2E test — collapse/expand interaction**

```typescript
test('section headers toggle collapse', async ({ page }) => {
  // Trigger todos so panel is visible
  // Click the Progress section header
  // Assert body is hidden
  // Click again
  // Assert body is visible
});
```

- [ ] **Step 4: Run E2E tests**

Run: `npx playwright test tests/e2e/info-panel.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/info-panel.spec.ts
git commit -m "test: add E2E tests for info panel redesign"
```

---

### Task 15: Final verification

- [ ] **Step 1: Run full lint**

Run: `npx turbo lint`
Expected: 0 errors

- [ ] **Step 2: Run full build**

Run: `npx turbo build`
Expected: clean compilation

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: All pass

- [ ] **Step 4: Run E2E tests**

Run: `npx playwright test`
Expected: All pass

- [ ] **Step 5: Launch app and visually verify**

Use `/launch` skill. Verify:
- Panel is hidden on fresh conversation
- Send a message → panel appears with Progress section
- Sections collapse/expand on header click
- Context section shows instruction sources and MCP servers
- Visual styling matches mockups

- [ ] **Step 6: Take Playwright screenshot for evidence**

```typescript
await page.screenshot({ path: 'tests/e2e/screenshots/info-panel-redesign.png' });
```

- [ ] **Step 7: Final commit**

```bash
git add packages/ui/src/browser/infoPanel/ packages/ui/src/browser/workbench.ts packages/base/src/common/types.ts tests/e2e/info-panel.spec.ts tests/e2e/screenshots/
git commit -m "feat: info panel redesign — collapsible sections, timeline, agents, skills, usage"
```
