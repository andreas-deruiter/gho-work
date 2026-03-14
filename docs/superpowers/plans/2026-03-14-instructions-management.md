# Instructions Management Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a user-configurable instructions file (`~/.gho-work/gho-instructions.md`) that the agent reads at every conversation start, with a Settings UI to manage the file path.

**Architecture:** Three layers — IPC channel definitions and zod schemas in `packages/platform`, a Settings page widget in `packages/ui`, and main process handlers + agent callback wiring in `packages/electron` and `apps/desktop`. Follows existing patterns from Skills/Connectors features.

**Tech Stack:** TypeScript, Electron IPC, zod, SQLite (via SqliteStorageService), Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-03-14-instructions-management-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `packages/platform/src/ipc/common/ipc.ts` | Add 3 IPC channel constants + zod schemas |
| Create | `packages/ui/src/browser/settings/instructionsPage.ts` | Instructions settings page widget |
| Modify | `packages/ui/src/browser/settings/settingsPanel.ts` | Add Instructions tab to nav |
| Modify | `packages/electron/src/main/mainProcess.ts` | IPC handlers + agent callback wiring + template creation |
| Modify | `apps/desktop/src/preload/index.ts` | Whitelist new IPC channels |
| Modify | `apps/desktop/src/renderer/styles.css` | Add CSS classes for status indicator and tips card |
| Modify | `tests/e2e/settings.spec.ts` | Add E2E test case for Instructions tab |

---

## Chunk 1: IPC Channels & Schemas

### Task 1: Add IPC Channel Constants and Zod Schemas

**Files:**
- Modify: `packages/platform/src/ipc/common/ipc.ts`

- [ ] **Step 1: Add channel constants to `IPC_CHANNELS`**

In `packages/platform/src/ipc/common/ipc.ts`, add these entries to the `IPC_CHANNELS` object, after the `DIALOG_OPEN_FOLDER` line (line 62):

```typescript
  DIALOG_OPEN_FILE: 'dialog:open-file',
  // Instructions channels
  INSTRUCTIONS_GET_PATH: 'instructions:get-path',
  INSTRUCTIONS_SET_PATH: 'instructions:set-path',
```

- [ ] **Step 2: Add zod schemas**

At the end of `packages/platform/src/ipc/common/ipc.ts` (after the `QuotaResultSchema` block, line 466), add:

```typescript
// --- Instructions schemas ---

export const InstructionsPathResponseSchema = z.object({
  path: z.string(),
  exists: z.boolean(),
  lineCount: z.number(),
  isDefault: z.boolean(),
});
export type InstructionsPathResponse = z.infer<typeof InstructionsPathResponseSchema>;

export const InstructionsSetPathRequestSchema = z.object({
  path: z.string(),
});
export type InstructionsSetPathRequest = z.infer<typeof InstructionsSetPathRequestSchema>;

export const DialogOpenFileRequestSchema = z.object({
  filters: z.array(z.object({
    name: z.string(),
    extensions: z.array(z.string()),
  })).optional(),
});
export type DialogOpenFileRequest = z.infer<typeof DialogOpenFileRequestSchema>;

export const DialogOpenFileResponseSchema = z.object({
  path: z.string().nullable(),
});
export type DialogOpenFileResponse = z.infer<typeof DialogOpenFileResponseSchema>;
```

- [ ] **Step 3: Verify the barrel export**

Check that `packages/platform/src/ipc/common/ipc.ts` is already re-exported from `packages/platform/common/index.ts` (it is — all schemas are exported from there). No changes needed.

- [ ] **Step 4: Build to verify**

Run: `npx turbo build --filter=@gho-work/platform`
Expected: Clean compilation, 0 errors.

- [ ] **Step 5: Commit**

```bash
git add packages/platform/src/ipc/common/ipc.ts
git commit -m "feat: add IPC channels and zod schemas for instructions management"
```

---

### Task 2: Whitelist New Channels in Preload

**Files:**
- Modify: `apps/desktop/src/preload/index.ts`

- [ ] **Step 1: Add channels to `ALLOWED_INVOKE_CHANNELS`**

In `apps/desktop/src/preload/index.ts`, add these three entries to the `ALLOWED_INVOKE_CHANNELS` array (after the `DIALOG_OPEN_FOLDER` entry, line 51):

```typescript
  IPC_CHANNELS.DIALOG_OPEN_FILE,
  IPC_CHANNELS.INSTRUCTIONS_GET_PATH,
  IPC_CHANNELS.INSTRUCTIONS_SET_PATH,
```

- [ ] **Step 2: Build to verify**

Run: `npx turbo build --filter=gho-work-desktop`
Expected: Clean compilation.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/preload/index.ts
git commit -m "feat: whitelist instructions IPC channels in preload"
```

---

## Chunk 2: Main Process Handlers

### Task 3: Add IPC Handlers and Template Creation

**Files:**
- Modify: `packages/electron/src/main/mainProcess.ts`

- [ ] **Step 1: Add helper constants and imports**

Near the top of `packages/electron/src/main/mainProcess.ts`, after the existing imports, add:

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
```

If `fs` and `path` are already imported, skip this step. Check first.

- [ ] **Step 2: Add the instructions helper functions**

Add these after the `getDisabledSkills` closure (around line 305) and before the `AgentServiceImpl` construction (line 306):

```typescript
  const DEFAULT_INSTRUCTIONS_PATH = path.join(os.homedir(), '.gho-work', 'gho-instructions.md');
  const MAX_INSTRUCTIONS_SIZE = 50 * 1024; // 50KB

  const getInstructionsPath = (): string => {
    const custom = storageService?.getSetting('instructions.filePath');
    return custom || DEFAULT_INSTRUCTIONS_PATH;
  };

  const validateInstructionsFile = async (filePath: string): Promise<{ path: string; exists: boolean; lineCount: number; isDefault: boolean }> => {
    const isDefault = filePath === DEFAULT_INSTRUCTIONS_PATH;
    try {
      const content = await fs.promises.readFile(filePath, { encoding: 'utf-8' });
      const lineCount = content.split('\n').length;
      return { path: filePath, exists: true, lineCount, isDefault };
    } catch {
      return { path: filePath, exists: false, lineCount: 0, isDefault };
    }
  };

  const readInstructionsFile = async (): Promise<string> => {
    const filePath = getInstructionsPath();
    try {
      const content = await fs.promises.readFile(filePath, { encoding: 'utf-8' });
      if (content.length > MAX_INSTRUCTIONS_SIZE) {
        console.warn(`Instructions file exceeds 50KB (${content.length} bytes), truncating`);
        return content.slice(0, MAX_INSTRUCTIONS_SIZE) + '\n\n[Instructions truncated — file exceeds 50KB]';
      }
      return content;
    } catch {
      return '';
    }
  };
```

- [ ] **Step 3: Wire the `_readContextFiles` callback**

Change the `AgentServiceImpl` construction (line 306) from:

```typescript
  const agentService = new AgentServiceImpl(sdk, conversationService, skillRegistry, undefined, getDisabledSkills);
```

to:

```typescript
  const agentService = new AgentServiceImpl(sdk, conversationService, skillRegistry, readInstructionsFile, getDisabledSkills);
```

- [ ] **Step 4: Add template creation on startup**

Add this after the agent service construction:

```typescript
  // Create default instructions template on first launch
  try {
    if (!fs.existsSync(DEFAULT_INSTRUCTIONS_PATH)) {
      fs.mkdirSync(path.dirname(DEFAULT_INSTRUCTIONS_PATH), { recursive: true });
      fs.writeFileSync(DEFAULT_INSTRUCTIONS_PATH, `# GHO Work Instructions

<!--
  This file contains instructions for the GHO Work AI agent.
  The agent reads this file at the start of every new conversation.

  You can edit this file with any text editor.
  To change its location, go to Settings > Instructions in GHO Work.
-->

## About Me
<!-- Describe your role, preferences, and how you'd like the agent to behave -->

## Conventions
<!-- Add any conventions, tools, or workflows the agent should follow -->
`, { encoding: 'utf-8' });
      console.log('Created default instructions file at', DEFAULT_INSTRUCTIONS_PATH);
    }
  } catch (err) {
    console.warn('Failed to create default instructions template:', err);
  }
```

- [ ] **Step 5: Add IPC handlers for instructions**

Add these alongside the other IPC handlers (after the `DIALOG_OPEN_FOLDER` handler, around line 1095):

```typescript
  ipcMainAdapter.handle(IPC_CHANNELS.DIALOG_OPEN_FILE, async (...args: unknown[]) => {
    const { dialog } = await import('electron');
    const req = args[0] as { filters?: Array<{ name: string; extensions: string[] }> } | undefined;
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: 'Select file',
      filters: req?.filters,
    });
    return { path: result.canceled ? null : result.filePaths[0] ?? null };
  });

  ipcMainAdapter.handle(IPC_CHANNELS.INSTRUCTIONS_GET_PATH, async () => {
    return validateInstructionsFile(getInstructionsPath());
  });

  ipcMainAdapter.handle(IPC_CHANNELS.INSTRUCTIONS_SET_PATH, async (...args: unknown[]) => {
    const { path: newPath } = args[0] as { path: string };
    if (newPath) {
      storageService?.setSetting('instructions.filePath', newPath);
    } else {
      // Reset to default: clear the setting (empty string is falsy, so getInstructionsPath returns default)
      storageService?.setSetting('instructions.filePath', '');
    }
    return validateInstructionsFile(getInstructionsPath());
  });
```

- [ ] **Step 6: Build to verify**

Run: `npx turbo build`
Expected: Clean compilation across all packages.

- [ ] **Step 7: Commit**

```bash
git add packages/electron/src/main/mainProcess.ts
git commit -m "feat: add instructions file reading, template creation, and IPC handlers"
```

---

## Chunk 3: Settings UI

### Task 4: Create the Instructions Settings Page

**Files:**
- Create: `packages/ui/src/browser/settings/instructionsPage.ts`

- [ ] **Step 1: Create the InstructionsPage widget**

Create `packages/ui/src/browser/settings/instructionsPage.ts`:

```typescript
import type { IIPCRenderer } from '@gho-work/platform/common';
import { IPC_CHANNELS } from '@gho-work/platform/common';
import type { InstructionsPathResponse } from '@gho-work/platform/common';
import { Widget } from '../widget.js';
import { h } from '../dom.js';

export class InstructionsPage extends Widget {
  private readonly _pathInputEl: HTMLInputElement;
  private readonly _statusEl: HTMLElement;
  private readonly _statusDotEl: HTMLElement;
  private readonly _statusTextEl: HTMLElement;

  constructor(private readonly _ipc: IIPCRenderer) {
    const layout = h('div.settings-page-instructions', [
      h('h2.settings-page-title@title'),
      h('p.settings-page-subtitle@subtitle'),
      h('div.settings-section@fileSection'),
      h('div.settings-section@tipsSection'),
    ]);
    super(layout.root);

    layout.title.textContent = 'Instructions';
    layout.subtitle.textContent =
      'Configure the instructions file that the agent reads at the start of every conversation';

    // --- Instructions File section ---
    const sectionTitle = document.createElement('div');
    sectionTitle.className = 'settings-section-title';
    sectionTitle.textContent = 'Instructions File';
    layout.fileSection.appendChild(sectionTitle);

    const sectionSubtitle = document.createElement('div');
    sectionSubtitle.className = 'settings-section-subtitle';
    sectionSubtitle.textContent =
      'A markdown file with instructions, conventions, and context for the agent';
    layout.fileSection.appendChild(sectionSubtitle);

    // Path input row
    const inputRow = document.createElement('div');
    inputRow.className = 'skill-path-input-row';

    this._pathInputEl = document.createElement('input');
    this._pathInputEl.type = 'text';
    this._pathInputEl.className = 'skill-path-input';
    this._pathInputEl.readOnly = true;
    this._pathInputEl.style.fontFamily = "'SF Mono', 'Menlo', 'Monaco', monospace";
    this._pathInputEl.setAttribute('aria-label', 'Instructions file path');
    inputRow.appendChild(this._pathInputEl);

    const browseBtn = document.createElement('button');
    browseBtn.className = 'skill-path-browse-btn';
    browseBtn.textContent = 'Browse';
    browseBtn.setAttribute('aria-label', 'Browse for instructions file');
    this.listen(browseBtn, 'click', () => void this._browsePath());
    inputRow.appendChild(browseBtn);

    const resetBtn = document.createElement('button');
    resetBtn.className = 'skill-path-browse-btn';
    resetBtn.textContent = 'Reset';
    resetBtn.setAttribute('aria-label', 'Reset to default instructions path');
    this.listen(resetBtn, 'click', () => void this._resetPath());
    inputRow.appendChild(resetBtn);

    layout.fileSection.appendChild(inputRow);

    // Status indicator
    this._statusEl = document.createElement('div');
    this._statusEl.className = 'instructions-status';

    this._statusDotEl = document.createElement('span');
    this._statusDotEl.className = 'instructions-status-dot';
    this._statusEl.appendChild(this._statusDotEl);

    this._statusTextEl = document.createElement('span');
    this._statusEl.appendChild(this._statusTextEl);

    layout.fileSection.appendChild(this._statusEl);

    // --- Tips section ---
    const tipsCard = document.createElement('div');
    tipsCard.className = 'instructions-tips';

    const tipsTitle = document.createElement('div');
    tipsTitle.className = 'settings-section-title';
    tipsTitle.textContent = 'Tips';
    tipsCard.appendChild(tipsTitle);

    const tipsList = document.createElement('ul');
    tipsList.className = 'instructions-tips-list';
    const tips = [
      'Edit this file with any text editor — changes take effect on the next conversation',
      'Use markdown formatting for structure and clarity',
      'Reference other files with relative paths from your home directory',
    ];
    for (const tip of tips) {
      const li = document.createElement('li');
      li.textContent = tip;
      tipsList.appendChild(li);
    }
    tipsCard.appendChild(tipsList);
    layout.tipsSection.appendChild(tipsCard);
  }

  async load(): Promise<void> {
    try {
      const result = (await this._ipc.invoke(
        IPC_CHANNELS.INSTRUCTIONS_GET_PATH,
      )) as InstructionsPathResponse;
      this._updateUI(result);
    } catch (err) {
      console.error('[InstructionsPage] Failed to load instructions path:', err);
    }
  }

  private _updateUI(result: InstructionsPathResponse): void {
    this._pathInputEl.value = result.path;
    if (result.exists) {
      this._statusDotEl.style.background = 'var(--color-success, #a6e3a1)';
      this._statusTextEl.style.color = 'var(--color-success, #a6e3a1)';
      this._statusTextEl.textContent = `File found — ${result.lineCount} lines`;
    } else {
      this._statusDotEl.style.background = 'var(--color-error, #f38ba8)';
      this._statusTextEl.style.color = 'var(--color-error, #f38ba8)';
      this._statusTextEl.textContent =
        'File not found — agent will run without instructions';
    }
  }

  private async _browsePath(): Promise<void> {
    try {
      const result = (await this._ipc.invoke(IPC_CHANNELS.DIALOG_OPEN_FILE, {
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      })) as { path: string | null };
      if (result.path) {
        const updated = (await this._ipc.invoke(
          IPC_CHANNELS.INSTRUCTIONS_SET_PATH,
          { path: result.path },
        )) as InstructionsPathResponse;
        this._updateUI(updated);
      }
    } catch (err) {
      console.error('[InstructionsPage] Failed to browse for instructions file:', err);
    }
  }

  private async _resetPath(): Promise<void> {
    try {
      const result = (await this._ipc.invoke(
        IPC_CHANNELS.INSTRUCTIONS_SET_PATH,
        { path: '' },
      )) as InstructionsPathResponse;
      this._updateUI(result);
    } catch (err) {
      console.error('[InstructionsPage] Failed to reset instructions path:', err);
    }
  }
}
```

- [ ] **Step 2: Add CSS classes for instructions page**

In `apps/desktop/src/renderer/styles.css`, add these rules (at the end of the settings section):

```css
/* --- Instructions page --- */
.instructions-status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  font-size: 12px;
}

.instructions-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.instructions-tips {
  margin-top: 24px;
  padding: 16px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.6;
  background: var(--color-surface, rgba(255, 255, 255, 0.03));
}

.instructions-tips .settings-section-title {
  margin-bottom: 8px;
}

.instructions-tips-list {
  margin: 0;
  padding-left: 16px;
}
```

- [ ] **Step 3: Build to verify**

Run: `npx turbo build --filter=@gho-work/ui`
Expected: Clean compilation.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/browser/settings/instructionsPage.ts apps/desktop/src/renderer/styles.css
git commit -m "feat: create InstructionsPage settings widget with CSS classes"
```

---

### Task 5: Add Instructions Tab to Settings Panel

**Files:**
- Modify: `packages/ui/src/browser/settings/settingsPanel.ts`

- [ ] **Step 1: Import InstructionsPage**

In `packages/ui/src/browser/settings/settingsPanel.ts`, add this import after the `AppearancePage` import (line 5):

```typescript
import { InstructionsPage } from './instructionsPage.js';
```

- [ ] **Step 2: Add nav item**

Update the `NAV_ITEMS` array (line 15-20) to insert the Instructions tab between General and Skills:

```typescript
const NAV_ITEMS: NavItem[] = [
  { id: 'appearance', label: 'General' },
  { id: 'instructions', label: 'Instructions' },
  { id: 'skills', label: 'Skills' },
  { id: 'plugins', label: 'Plugins' },
  { id: 'connectors', label: 'Connectors' },
];
```

- [ ] **Step 3: Add case to `_showPage` switch**

In the `_showPage` method, add a case for `'instructions'` before the `'skills'` case (around line 74):

```typescript
      case 'instructions': {
        const instructionsPage = new InstructionsPage(this._ipc);
        void instructionsPage.load();
        page = instructionsPage;
        break;
      }
```

- [ ] **Step 4: Build to verify**

Run: `npx turbo build`
Expected: Clean compilation across all packages.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/browser/settings/settingsPanel.ts
git commit -m "feat: add Instructions tab to settings panel"
```

---

## Chunk 4: Testing

### Task 6: E2E Test for Instructions Settings

Add test cases to the existing `tests/e2e/settings.spec.ts` file, which already has the Electron launch setup, onboarding seeding, and `openSettings()` helper.

**Files:**
- Modify: `tests/e2e/settings.spec.ts`

- [ ] **Step 1: Add Instructions tab test case**

Add this test to the existing `test.describe` block in `tests/e2e/settings.spec.ts`:

```typescript
test('Instructions tab shows file path and status', async () => {
  await openSettings();

  // Click Instructions tab
  const instructionsTab = page.locator('.settings-nav-item:has-text("Instructions")');
  await expect(instructionsTab).toBeVisible();
  await instructionsTab.click();

  // Verify page title
  await expect(page.locator('.settings-page-title:has-text("Instructions")')).toBeVisible();

  // Verify path input shows a path ending in gho-instructions.md
  const pathInput = page.locator('.skill-path-input[aria-label="Instructions file path"]');
  await expect(pathInput).toBeVisible();
  const pathValue = await pathInput.inputValue();
  expect(pathValue).toContain('gho-instructions.md');

  // Verify status indicator is visible (green = found, since template was created at startup)
  const statusText = page.locator('.instructions-status span:last-child');
  await expect(statusText).toBeVisible();
  const statusContent = await statusText.textContent();
  expect(statusContent).toMatch(/File found/);

  // Verify Browse and Reset buttons exist
  await expect(page.locator('button:has-text("Browse")')).toBeVisible();
  await expect(page.locator('button:has-text("Reset")')).toBeVisible();

  // Verify Tips section
  await expect(page.locator('text=Edit this file with any text editor')).toBeVisible();
});
```

- [ ] **Step 2: Run E2E tests**

Run: `npx playwright test tests/e2e/settings.spec.ts`
Expected: All settings tests pass, including the new Instructions tab test.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/settings.spec.ts
git commit -m "test: add E2E test for Instructions settings tab"
```

---

## Chunk 5: Final Verification

### Task 8: HARD GATE — Launch App and Verify

- [ ] **Step 1: Launch the app**

Run: `npm run desktop:dev` (or the equivalent dev script)
Navigate to Settings > Instructions.

- [ ] **Step 2: Screenshot verification with Playwright**

Take a Playwright screenshot of the Instructions settings page to verify:
- Tab is visible and clickable
- Path shows `~/.gho-work/gho-instructions.md` (or absolute equivalent)
- Status shows green "File found" (since template was created on first launch)
- Browse and Reset buttons are rendered
- Tips section is visible

- [ ] **Step 3: Verify agent reads instructions**

1. Edit `~/.gho-work/gho-instructions.md` to add a test instruction like: `Always greet the user by saying "Hello from instructions!"`
2. Start a new conversation
3. Verify the agent's response reflects the instruction

- [ ] **Step 4: Final commit if any fixes needed**

If any fixes were made during verification, commit them.
