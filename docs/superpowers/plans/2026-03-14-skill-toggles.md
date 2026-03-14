# Skill Toggles Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-skill enable/disable toggles to the Skills settings page, persisting disabled state and passing it to the Copilot SDK.

**Architecture:** Two new IPC channels (`SKILL_TOGGLE`, `SKILL_DISABLED_LIST`) connect the renderer toggle UI to the main process, which persists the disabled list via `storageService`. On session creation, `AgentServiceImpl` reads the disabled list and passes `disabledSkills` to the SDK `SessionConfig`, plus filters skills in `_loadSkill()`. The `SkillEntryDTO` is extended with a `disabled` field so the UI knows the current state.

**Tech Stack:** TypeScript, Electron IPC, Zod schemas, Vitest

**Spec:** `docs/superpowers/specs/2026-03-14-skill-toggles-design.md`

---

## Chunk 1: IPC Channels, Schemas & Preload

### Task 1: Add IPC channels and Zod schemas

**Files:**
- Modify: `packages/platform/src/ipc/common/ipc.ts:38-44` (IPC_CHANNELS) and append after line 269

- [ ] **Step 1: Add skill toggle channels to IPC_CHANNELS**

In `packages/platform/src/ipc/common/ipc.ts`, add after line 44 (`SKILL_CHANGED`):

```typescript
  SKILL_TOGGLE: 'skill:toggle',
  SKILL_DISABLED_LIST: 'skill:disabled-list',
```

- [ ] **Step 2: Add `disabled` field to `SkillEntryDTOSchema`**

In `packages/platform/src/ipc/common/ipc.ts`, modify `SkillEntryDTOSchema` (line 242-249) to add:

```typescript
export const SkillEntryDTOSchema = z.object({
  id: z.string(),
  category: z.string(),
  name: z.string(),
  description: z.string(),
  sourceId: z.string(),
  filePath: z.string(),
  disabled: z.boolean().optional(),
});
```

- [ ] **Step 3: Add `SkillToggleRequest` schema**

Append after `SkillRemovePathRequestSchema` (line 269):

```typescript
export const SkillToggleRequestSchema = z.object({
  skillId: z.string(),
  enabled: z.boolean(),
});
export type SkillToggleRequest = z.infer<typeof SkillToggleRequestSchema>;
```

- [ ] **Step 4: Verify build**

Run: `npx turbo build --filter=@gho-work/platform`
Expected: Clean compilation

- [ ] **Step 5: Commit**

```bash
git add packages/platform/src/ipc/common/ipc.ts
git commit -m "feat: add SKILL_TOGGLE and SKILL_DISABLED_LIST IPC channels and schemas"
```

### Task 2: Add channels to preload allowlist

**Files:**
- Modify: `apps/desktop/src/preload/index.ts:9-39` (ALLOWED_INVOKE_CHANNELS)

- [ ] **Step 1: Add both channels to ALLOWED_INVOKE_CHANNELS**

In `apps/desktop/src/preload/index.ts`, add after `IPC_CHANNELS.SKILL_RESCAN` (line 38):

```typescript
  IPC_CHANNELS.SKILL_TOGGLE,
  IPC_CHANNELS.SKILL_DISABLED_LIST,
```

- [ ] **Step 2: Verify build**

Run: `npx turbo build --filter=@gho-work/desktop`
Expected: Clean compilation (electron-vite bundles the preload)

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/preload/index.ts
git commit -m "feat: add SKILL_TOGGLE and SKILL_DISABLED_LIST to preload allowlist"
```

---

## Chunk 2: Main Process Handlers

### Task 3: Add `listSkillsWithDisabledState` helper and IPC handlers

**Files:**
- Modify: `packages/electron/src/main/mainProcess.ts`

**Note on locating code:** Line numbers in `mainProcess.ts` shift frequently. Search for the handler text (e.g., `IPC_CHANNELS.SKILL_LIST`) rather than relying on line numbers.

- [ ] **Step 1: Add the helper function**

In `packages/electron/src/main/mainProcess.ts`, add a local helper inside `createMainProcess()`, after the `skillRegistry` creation (search for `const skillRegistry = new SkillRegistryImpl`):

```typescript
  function listSkillsWithDisabledState(): import('@gho-work/platform/common').SkillEntryDTO[] {
    const disabledIds: string[] = JSON.parse(storageService?.getSetting('skills.disabled') ?? '[]');
    return skillRegistry.list().map(s => ({
      ...s,
      disabled: disabledIds.includes(s.id),
    }));
  }
```

- [ ] **Step 2: Update existing SKILL_LIST handler**

Search for `IPC_CHANNELS.SKILL_LIST` and replace:

```typescript
  ipcMainAdapter.handle(IPC_CHANNELS.SKILL_LIST, async () => {
    return listSkillsWithDisabledState();
  });
```

- [ ] **Step 3: Update existing SKILL_RESCAN handler**

Search for `IPC_CHANNELS.SKILL_RESCAN` and replace:

```typescript
  ipcMainAdapter.handle(IPC_CHANNELS.SKILL_RESCAN, async () => {
    await skillRegistry.refresh();
    return listSkillsWithDisabledState();
  });
```

- [ ] **Step 4: Update existing SKILL_CHANGED broadcasts in SKILL_ADD_PATH and SKILL_REMOVE_PATH**

Search for `IPC_CHANNELS.SKILL_ADD_PATH` and `IPC_CHANNELS.SKILL_REMOVE_PATH` handlers. In both, replace:

```typescript
    ipcMainAdapter.sendToRenderer(IPC_CHANNELS.SKILL_CHANGED, skillRegistry.list());
```

with:

```typescript
    ipcMainAdapter.sendToRenderer(IPC_CHANNELS.SKILL_CHANGED, listSkillsWithDisabledState());
```

- [ ] **Step 5: Add SKILL_TOGGLE handler**

Add after the `SKILL_RESCAN` handler:

```typescript
  ipcMainAdapter.handle(IPC_CHANNELS.SKILL_TOGGLE, async (...args: unknown[]) => {
    const { skillId, enabled } = SkillToggleRequestSchema.parse(args[0]);
    const raw = storageService?.getSetting('skills.disabled');
    const disabled: string[] = raw ? JSON.parse(raw) : [];

    if (enabled) {
      const filtered = disabled.filter(id => id !== skillId);
      storageService?.setSetting('skills.disabled', JSON.stringify(filtered));
    } else {
      if (!disabled.includes(skillId)) {
        disabled.push(skillId);
        storageService?.setSetting('skills.disabled', JSON.stringify(disabled));
      }
    }

    ipcMainAdapter.sendToRenderer(IPC_CHANNELS.SKILL_CHANGED, listSkillsWithDisabledState());
    return { ok: true as const };
  });
```

- [ ] **Step 6: Add SKILL_DISABLED_LIST handler**

Add after the `SKILL_TOGGLE` handler. Note: `SkillsPage` does not currently call this channel — the disabled state is embedded in `SkillEntryDTO` via `listSkillsWithDisabledState()`. This channel exists for future consumers (e.g., other settings pages, diagnostics).

```typescript
  ipcMainAdapter.handle(IPC_CHANNELS.SKILL_DISABLED_LIST, async () => {
    const raw = storageService?.getSetting('skills.disabled');
    return raw ? JSON.parse(raw) : [];
  });
```

- [ ] **Step 7: Add SkillToggleRequestSchema import**

Add `SkillToggleRequestSchema` to the import from `@gho-work/platform/common` at the top of the file.

- [ ] **Step 8: Verify build**

Run: `npx turbo build`
Expected: Clean compilation

- [ ] **Step 9: Commit**

```bash
git add packages/electron/src/main/mainProcess.ts
git commit -m "feat: add SKILL_TOGGLE and SKILL_DISABLED_LIST handlers, merge disabled state into skill DTOs"
```

---

## Chunk 3: Agent Service Integration

### Task 4: Add `disabledSkills` to SessionConfig and SDK pass-through

**Files:**
- Modify: `packages/agent/src/common/types.ts:1-10`
- Modify: `packages/agent/src/node/copilotSDKImpl.ts:110-125,209-228`

- [ ] **Step 1: Write failing test for disabledSkills pass-through**

Create test in `packages/agent/src/__tests__/disabledSkills.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { MockCopilotSDK } from '../node/mockCopilotSDK.js';

describe('disabledSkills pass-through', () => {
  it('SessionConfig accepts disabledSkills and passes it to createSession', async () => {
    const mock = new MockCopilotSDK();
    await mock.start();
    const createSpy = vi.spyOn(mock, 'createSession');

    const config = {
      sessionId: 'test-1',
      streaming: true,
      disabledSkills: ['connectors/setup', 'auth/github'],
    };
    await mock.createSession(config);

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ disabledSkills: ['connectors/setup', 'auth/github'] }),
    );
  });

  it('SessionConfig accepts undefined disabledSkills', async () => {
    const mock = new MockCopilotSDK();
    await mock.start();
    const createSpy = vi.spyOn(mock, 'createSession');

    await mock.createSession({ sessionId: 'test-2', streaming: true });

    expect(createSpy).toHaveBeenCalledWith(
      expect.not.objectContaining({ disabledSkills: expect.anything() }),
    );
  });
});
```

Note: This tests that `SessionConfig` accepts the `disabledSkills` field and passes it through. The real SDK pass-through in `mapSessionConfig` is only exercised when the real SDK is available (not in mock mode). The type system enforces that `mapSessionConfig` maps the field correctly.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/agent/src/__tests__/disabledSkills.test.ts -v`
Expected: FAIL — `disabledSkills` is not a valid property on `SessionConfig`

- [ ] **Step 3: Add `disabledSkills` to SessionConfig**

In `packages/agent/src/common/types.ts`, add after `excludedTools` (line 9):

```typescript
  disabledSkills?: string[];
```

- [ ] **Step 4: Add `disabledSkills` to mapSessionConfig**

In `packages/agent/src/node/copilotSDKImpl.ts`, add to the return object in `mapSessionConfig` (around line 121, after `excludedTools`):

```typescript
		disabledSkills: config.disabledSkills,
```

- [ ] **Step 5: Add `disabledSkills` to resumeSession spread**

In `packages/agent/src/node/copilotSDKImpl.ts`, add to `resumeConfig` (around line 222, after `excludedTools` spread):

```typescript
			...(config?.disabledSkills ? { disabledSkills: config.disabledSkills } : {}),
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run packages/agent/src/__tests__/disabledSkills.test.ts -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/agent/src/common/types.ts packages/agent/src/node/copilotSDKImpl.ts packages/agent/src/__tests__/disabledSkills.test.ts
git commit -m "feat: add disabledSkills to SessionConfig and SDK pass-through"
```

### Task 5: Wire `getDisabledSkills` into AgentServiceImpl

**Files:**
- Modify: `packages/agent/src/node/agentServiceImpl.ts:28-33,60-68,139-141`
- Modify: `packages/agent/src/__tests__/installConversation.test.ts`

- [ ] **Step 1: Write failing test for disabled skill filtering**

Add to `packages/agent/src/__tests__/installConversation.test.ts`, after the existing tests:

```typescript
	it('filters disabled skills in _loadSkill', async () => {
		const disabledSkills = ['connectors/setup'];
		const svc = new AgentServiceImpl(
			createMockCopilotSDK() as any,
			conversationService as any,
			registry,
			undefined,
			() => disabledSkills,
		);
		const convId = await svc.createSetupConversation();
		// The setup skill is 'connectors/setup' which is disabled
		const context = svc.getInstallContext(convId);
		// When disabled, the install context should be empty string (skill not loaded)
		expect(context).toBe('');
	});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/agent/src/__tests__/installConversation.test.ts -v`
Expected: FAIL — `AgentServiceImpl` constructor doesn't accept 5th arg

- [ ] **Step 3: Add `_getDisabledSkills` to AgentServiceImpl constructor**

In `packages/agent/src/node/agentServiceImpl.ts`, modify the constructor (line 28-33):

```typescript
  constructor(
    private readonly _sdk: ICopilotSDK,
    private readonly _conversationService: IConversationService | null,
    private readonly _skillRegistry: ISkillRegistry,
    private readonly _readContextFiles?: () => Promise<string>,
    private readonly _getDisabledSkills?: () => string[],
  ) {}
```

- [ ] **Step 4: Filter in `_loadSkill`**

Replace `_loadSkill` method (line 139-141):

```typescript
  private async _loadSkill(category: string, toolId: string): Promise<string | undefined> {
    const skillId = `${category}/${toolId}`;
    const disabled = this._getDisabledSkills?.() ?? [];
    if (disabled.includes(skillId)) {
      return undefined;
    }
    return this._skillRegistry.getSkill(category, toolId);
  }
```

- [ ] **Step 5: Pass `disabledSkills` to SDK session creation**

In `executeTask()`, modify the `createSession` call (around line 60-68). Add `disabledSkills` to the config:

```typescript
        const disabledSkills = this._getDisabledSkills?.() ?? [];

        session = await this._sdk.createSession({
          model: context.model ?? 'gpt-4o',
          sessionId: context.conversationId,
          systemMessage: systemContent ? { mode: 'append', content: systemContent } : undefined,
          streaming: true,
          mcpServers,
          workingDirectory: setupOverrides?.workingDirectory,
          excludedTools: setupOverrides?.excludedTools,
          disabledSkills: disabledSkills.length > 0 ? disabledSkills : undefined,
        });
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run packages/agent/src/__tests__/installConversation.test.ts -v`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add packages/agent/src/node/agentServiceImpl.ts packages/agent/src/__tests__/installConversation.test.ts
git commit -m "feat: wire getDisabledSkills into AgentServiceImpl — filter skills and pass to SDK"
```

### Task 6: Pass `getDisabledSkills` callback from main process

**Files:**
- Modify: `packages/electron/src/main/mainProcess.ts` (around line 284, `AgentServiceImpl` construction)

- [ ] **Step 1: Update AgentServiceImpl construction**

In `packages/electron/src/main/mainProcess.ts`, find the `AgentServiceImpl` construction (around line 284):

```typescript
  const agentService = new AgentServiceImpl(sdk, conversationService, skillRegistry);
```

Replace with:

```typescript
  const getDisabledSkills = (): string[] => {
    const raw = storageService?.getSetting('skills.disabled');
    return raw ? JSON.parse(raw) : [];
  };
  const agentService = new AgentServiceImpl(sdk, conversationService, skillRegistry, undefined, getDisabledSkills);
```

Note: the 4th argument (`readContextFiles`) is currently not passed — keep it as `undefined`.

- [ ] **Step 2: Verify build**

Run: `npx turbo build`
Expected: Clean compilation

- [ ] **Step 3: Commit**

```bash
git add packages/electron/src/main/mainProcess.ts
git commit -m "feat: pass getDisabledSkills callback to AgentServiceImpl from main process"
```

---

## Chunk 4: Skills Page UI

### Task 7: Add toggle switch CSS

**Files:**
- Modify: `apps/desktop/src/renderer/styles.css`

- [ ] **Step 1: Add toggle switch and disclaimer CSS**

Append to `apps/desktop/src/renderer/styles.css`, after the existing skill source styles (or at the end of the file if no skill styles exist):

```css
/* === Skill Toggle === */
.skill-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
  margin-bottom: 6px;
}
.skill-item.disabled { opacity: 0.5; }

.skill-item-info { flex: 1; min-width: 0; }
.skill-item-name { font-size: var(--font-size-base); font-weight: 500; color: var(--fg-primary); }
.skill-item-desc { font-size: var(--font-size-sm); color: var(--fg-secondary); margin-top: 2px; }

.skill-item-actions { display: flex; align-items: center; gap: 12px; }
.skill-item-source { font-size: var(--font-size-xs); color: var(--fg-muted); }

.skill-toggle {
  width: 36px;
  height: 20px;
  border-radius: 10px;
  background: var(--bg-tertiary, #45475a);
  position: relative;
  cursor: pointer;
  border: none;
  padding: 0;
  transition: background 0.2s;
}
.skill-toggle[aria-checked="true"] {
  background: var(--brand-primary, #89b4fa);
}
.skill-toggle-knob {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--fg-muted, #6c7086);
  position: absolute;
  top: 2px;
  left: 2px;
  transition: all 0.2s;
}
.skill-toggle[aria-checked="true"] .skill-toggle-knob {
  background: white;
  left: auto;
  right: 2px;
}

.skill-toggle-disclaimer {
  padding: 8px 12px;
  margin: 8px 0;
  background: var(--bg-secondary);
  border-left: 3px solid var(--brand-primary, #89b4fa);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  color: var(--fg-secondary);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src/renderer/styles.css
git commit -m "feat: add skill toggle switch and disclaimer CSS"
```

### Task 8: Add toggle switches to SkillsPage

**Files:**
- Modify: `packages/ui/src/browser/settings/skillsPage.ts`

- [ ] **Step 1: Write failing tests for toggle behavior**

Add to `packages/ui/src/browser/settings/__tests__/skillsPage.test.ts`:

```typescript
  it('renders toggle switches for each skill', async () => {
    const ipc = createMockIPC();
    const page = new SkillsPage(ipc);
    await page.load();
    const dom = page.getDomNode();
    const toggles = dom.querySelectorAll('.skill-toggle');
    expect(toggles.length).toBe(2);
    toggles.forEach(t => {
      expect(t.getAttribute('role')).toBe('switch');
      expect(t.getAttribute('aria-checked')).toBe('true');
      expect(t.getAttribute('tabindex')).toBe('0');
    });
    page.dispose();
  });

  it('renders disabled skills with aria-checked=false and dimmed row', async () => {
    const ipc = createMockIPC();
    ipc.invoke.mockImplementation(async (channel: string) => {
      if (channel === 'skill:list') {
        return [
          { id: 'install/gh', category: 'install', name: 'gh', description: 'Install GitHub CLI', sourceId: 'bundled', filePath: '/skills/install/gh.md', disabled: true },
        ];
      }
      if (channel === 'skill:sources') { return []; }
      if (channel === 'skill:disabled-list') { return ['install/gh']; }
      return {};
    });
    const page = new SkillsPage(ipc);
    await page.load();
    const dom = page.getDomNode();
    const toggle = dom.querySelector('.skill-toggle');
    expect(toggle?.getAttribute('aria-checked')).toBe('false');
    const item = dom.querySelector('.skill-item');
    expect(item?.classList.contains('disabled')).toBe(true);
    page.dispose();
  });

  it('calls skill:toggle IPC when toggle is clicked', async () => {
    const ipc = createMockIPC();
    const page = new SkillsPage(ipc);
    await page.load();
    const dom = page.getDomNode();
    const toggle = dom.querySelector('.skill-toggle') as HTMLElement;
    toggle.click();
    expect(ipc.invoke).toHaveBeenCalledWith('skill:toggle', { skillId: 'install/gh', enabled: false });
    page.dispose();
  });

  it('shows disclaimer after first toggle', async () => {
    const ipc = createMockIPC();
    const page = new SkillsPage(ipc);
    await page.load();
    const dom = page.getDomNode();
    // No disclaimer before toggle
    expect(dom.querySelector('.skill-toggle-disclaimer')).toBeNull();
    // Click toggle
    const toggle = dom.querySelector('.skill-toggle') as HTMLElement;
    toggle.click();
    await vi.waitFor(() => {
      expect(dom.querySelector('.skill-toggle-disclaimer')).toBeTruthy();
      expect(dom.querySelector('.skill-toggle-disclaimer')?.textContent).toContain('new conversations');
    });
    page.dispose();
  });

  it('toggle responds to Enter key', async () => {
    const ipc = createMockIPC();
    const page = new SkillsPage(ipc);
    await page.load();
    const dom = page.getDomNode();
    const toggle = dom.querySelector('.skill-toggle') as HTMLElement;
    toggle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(ipc.invoke).toHaveBeenCalledWith('skill:toggle', { skillId: 'install/gh', enabled: false });
    page.dispose();
  });

  it('toggle responds to Space key', async () => {
    const ipc = createMockIPC();
    const page = new SkillsPage(ipc);
    await page.load();
    const dom = page.getDomNode();
    const toggle = dom.querySelector('.skill-toggle') as HTMLElement;
    toggle.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(ipc.invoke).toHaveBeenCalledWith('skill:toggle', { skillId: 'install/gh', enabled: false });
    page.dispose();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/ui/src/browser/settings/__tests__/skillsPage.test.ts -v`
Expected: FAIL — no `.skill-toggle` elements rendered

- [ ] **Step 3: Update `_renderSkills` to include toggle switches**

In `packages/ui/src/browser/settings/skillsPage.ts`, replace the `_renderSkills` method (lines 155-214):

```typescript
  private _renderSkills(skills: SkillEntryDTO[]): void {
    while (this._skillListEl.firstChild) {
      this._skillListEl.removeChild(this._skillListEl.firstChild);
    }

    if (skills.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'skill-empty-state';
      empty.textContent = 'No skills found. Add a skill source directory above.';
      this._skillListEl.appendChild(empty);
      return;
    }

    const grouped = new Map<string, SkillEntryDTO[]>();
    for (const skill of skills) {
      const group = grouped.get(skill.category) ?? [];
      group.push(skill);
      grouped.set(skill.category, group);
    }

    for (const [category, entries] of grouped) {
      const catHeader = document.createElement('div');
      catHeader.className = 'skill-category';
      catHeader.setAttribute('role', 'heading');
      catHeader.setAttribute('aria-level', '3');
      catHeader.textContent = category;
      this._skillListEl.appendChild(catHeader);

      const groupEl = document.createElement('div');
      groupEl.className = 'skill-list-group';

      for (const entry of entries) {
        const isDisabled = entry.disabled === true;
        const item = document.createElement('div');
        item.className = 'skill-item' + (isDisabled ? ' disabled' : '');

        const entryInfo = document.createElement('div');
        entryInfo.className = 'skill-item-info';

        const name = document.createElement('div');
        name.className = 'skill-item-name';
        name.textContent = entry.name;
        entryInfo.appendChild(name);

        const desc = document.createElement('div');
        desc.className = 'skill-item-desc';
        desc.textContent = entry.description;
        entryInfo.appendChild(desc);

        item.appendChild(entryInfo);

        const actions = document.createElement('div');
        actions.className = 'skill-item-actions';

        const source = document.createElement('div');
        source.className = 'skill-item-source';
        source.textContent = entry.sourceId;
        actions.appendChild(source);

        // Toggle switch
        const toggle = document.createElement('div');
        toggle.className = 'skill-toggle';
        toggle.setAttribute('role', 'switch');
        toggle.setAttribute('aria-checked', String(!isDisabled));
        toggle.setAttribute('aria-label', `Enable ${entry.name}`);
        toggle.setAttribute('tabindex', '0');

        const knob = document.createElement('div');
        knob.className = 'skill-toggle-knob';
        toggle.appendChild(knob);

        const handleToggle = () => {
          const currentlyEnabled = toggle.getAttribute('aria-checked') === 'true';
          void this._toggleSkill(entry.id, !currentlyEnabled);
        };
        this.listen(toggle, 'click', handleToggle);
        this.listen(toggle, 'keydown', (e: Event) => {
          const ke = e as KeyboardEvent;
          if (ke.key === 'Enter' || ke.key === ' ') {
            ke.preventDefault();
            handleToggle();
          }
        });

        actions.appendChild(toggle);
        item.appendChild(actions);
        groupEl.appendChild(item);
      }

      this._skillListEl.appendChild(groupEl);
    }
  }
```

- [ ] **Step 4: Add `_toggleSkill` method and disclaimer state**

Add a private field and methods to `SkillsPage`:

After the existing private fields (line 11), add:

```typescript
  private _disclaimerShown = false;
```

Add the toggle method after `_rescan()`:

```typescript
  private async _toggleSkill(skillId: string, enabled: boolean): Promise<void> {
    try {
      await this._ipc.invoke(IPC_CHANNELS.SKILL_TOGGLE, { skillId, enabled });
      if (!this._disclaimerShown) {
        this._disclaimerShown = true;
        this._showDisclaimer();
      }
    } catch (err) {
      console.error('[SkillsPage] Failed to toggle skill:', err);
    }
  }

  private _showDisclaimer(): void {
    const existing = this.getDomNode().querySelector('.skill-toggle-disclaimer');
    if (existing) { return; }
    const disclaimer = document.createElement('div');
    disclaimer.className = 'skill-toggle-disclaimer';
    disclaimer.textContent = 'Changes apply to new conversations. Existing conversations keep their current settings.';
    // Insert before the skill list container
    this._skillListEl.parentElement?.insertBefore(disclaimer, this._skillListEl);
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/ui/src/browser/settings/__tests__/skillsPage.test.ts -v`
Expected: All tests PASS (including new toggle tests)

- [ ] **Step 6: Run full test suite to check for regressions**

Run: `npx vitest run --changed`
Expected: All affected tests PASS

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/browser/settings/skillsPage.ts packages/ui/src/browser/settings/__tests__/skillsPage.test.ts
git commit -m "feat: add per-skill toggle switches to Skills page with disclaimer"
```

---

## Chunk 5: Integration Verification

### Task 9: Full build and lint check

**Files:** None (verification only)

- [ ] **Step 1: Run lint**

Run: `npx turbo lint`
Expected: 0 errors

- [ ] **Step 2: Run full build**

Run: `npx turbo build`
Expected: Clean compilation

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

### Task 10: Playwright E2E test

**Files:**
- Modify: `tests/e2e/settings.spec.ts`

- [ ] **Step 1: Add toggle E2E test**

Add to `tests/e2e/settings.spec.ts`:

```typescript
test('skill toggle switches are rendered and clickable', async ({ page }) => {
  // Navigate to settings
  const gearBtn = page.locator('[data-panel="settings"]');
  await gearBtn.click();

  // Navigate to Skills page
  const skillsNav = page.locator('.settings-nav-item', { hasText: 'Skills' });
  await skillsNav.click();

  // Wait for skills to load
  const toggles = page.locator('.skill-toggle');
  await expect(toggles.first()).toBeVisible({ timeout: 5000 });

  // Check initial state
  const firstToggle = toggles.first();
  await expect(firstToggle).toHaveAttribute('role', 'switch');
  await expect(firstToggle).toHaveAttribute('aria-checked', 'true');

  // Click to disable
  await firstToggle.click();

  // Verify toggle flipped
  await expect(firstToggle).toHaveAttribute('aria-checked', 'false');

  // Verify disclaimer appeared
  const disclaimer = page.locator('.skill-toggle-disclaimer');
  await expect(disclaimer).toBeVisible();
  await expect(disclaimer).toContainText('new conversations');

  // Click again to re-enable
  await firstToggle.click();
  await expect(firstToggle).toHaveAttribute('aria-checked', 'true');
});
```

- [ ] **Step 2: Run E2E tests**

Run: `npx playwright test tests/e2e/settings.spec.ts`
Expected: All settings tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/settings.spec.ts
git commit -m "test: add Playwright E2E test for skill toggle switches"
```
