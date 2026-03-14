# Settings UI Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a settings view with Appearance (theme switching) and Skills (skill browser + path config) pages, accessible via the gear icon in the activity bar.

**Architecture:** Settings is a full-content-area view that replaces chat when the gear icon is clicked. A `SettingsPanel` shell widget manages a left nav and right content area, mounting/unmounting separate page widgets (`AppearancePage`, `SkillsPage`). Theme persistence is added to `ThemeService`. Skill data flows via IPC from the main process `ISkillRegistry`.

**Tech Stack:** TypeScript, Electron IPC, Zod schemas, Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-03-14-settings-ui-design.md`

---

## Chunk 1: IPC Channels & Schemas

### Task 1: Add skill IPC channels and Zod schemas

**Files:**
- Modify: `packages/platform/src/ipc/common/ipc.ts:6-38` (IPC_CHANNELS) and append schemas after line 231

- [ ] **Step 1: Add skill channels to IPC_CHANNELS**

Add after the connector channels block (line 37) in `packages/platform/src/ipc/common/ipc.ts`:

```typescript
  // Skill channels
  SKILL_LIST: 'skill:list',
  SKILL_SOURCES: 'skill:sources',
  SKILL_ADD_PATH: 'skill:add-path',
  SKILL_REMOVE_PATH: 'skill:remove-path',
  SKILL_RESCAN: 'skill:rescan',
  SKILL_CHANGED: 'skill:changed',
```

- [ ] **Step 2: Add Zod schemas and DTO types**

Append after line 231 (after `ConnectorSetupResponse`) in `packages/platform/src/ipc/common/ipc.ts`:

```typescript
// --- Skill schemas ---

export const SkillEntryDTOSchema = z.object({
  id: z.string(),
  category: z.string(),
  name: z.string(),
  description: z.string(),
  sourceId: z.string(),
  filePath: z.string(),
});
export type SkillEntryDTO = z.infer<typeof SkillEntryDTOSchema>;

export const SkillSourceDTOSchema = z.object({
  id: z.string(),
  priority: z.number(),
  basePath: z.string(),
});
export type SkillSourceDTO = z.infer<typeof SkillSourceDTOSchema>;

export const SkillAddPathRequestSchema = z.object({ path: z.string() });
export type SkillAddPathRequest = z.infer<typeof SkillAddPathRequestSchema>;

export const SkillAddPathResponseSchema = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ error: z.string() }),
]);
export type SkillAddPathResponse = z.infer<typeof SkillAddPathResponseSchema>;

export const SkillRemovePathRequestSchema = z.object({ path: z.string() });
export type SkillRemovePathRequest = z.infer<typeof SkillRemovePathRequestSchema>;
```

- [ ] **Step 3: Verify build**

Run: `npx turbo build --filter=@gho-work/platform`
Expected: Clean build, no errors

- [ ] **Step 4: Commit**

```bash
git add packages/platform/src/ipc/common/ipc.ts
git commit -m "feat: add skill IPC channels and Zod schemas for settings UI"
```

---

## Chunk 2: Theme Persistence

### Task 2: Add persistence to ThemeService

**Files:**
- Modify: `packages/ui/src/browser/theme.ts` (add IPC-based persistence)
- Test: `packages/ui/src/browser/__tests__/theme.test.ts` (new)

- [ ] **Step 1: Write failing tests for theme persistence**

Create `packages/ui/src/browser/__tests__/theme.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThemeService } from '../theme.js';

function createMockIPC() {
  const stored: Record<string, string> = {};
  return {
    invoke: vi.fn(async (channel: string, ...args: unknown[]) => {
      if (channel === 'storage:get') {
        const { key } = args[0] as { key: string };
        return { value: stored[key] ?? null };
      }
      if (channel === 'storage:set') {
        const { key, value } = args[0] as { key: string; value: string };
        stored[key] = value;
        return {};
      }
      return {};
    }),
    on: vi.fn(),
    removeListener: vi.fn(),
  };
}

describe('ThemeService', () => {
  let ipc: ReturnType<typeof createMockIPC>;

  beforeEach(() => {
    ipc = createMockIPC();
    document.documentElement.setAttribute('data-theme', 'system');
  });

  it('defaults to system theme', () => {
    const service = new ThemeService(ipc);
    expect(service.currentTheme).toBe('system');
  });

  it('persists theme on setTheme', () => {
    const service = new ThemeService(ipc);
    service.setTheme('dark');
    expect(ipc.invoke).toHaveBeenCalledWith('storage:set', { key: 'theme', value: 'dark' });
  });

  it('fires onDidChangeTheme event', () => {
    const service = new ThemeService(ipc);
    const handler = vi.fn();
    service.onDidChangeTheme(handler);
    service.setTheme('light');
    expect(handler).toHaveBeenCalledWith('light');
  });

  it('loads persisted theme on init', async () => {
    ipc.invoke.mockResolvedValueOnce({ value: 'dark' });
    const service = new ThemeService(ipc);
    await service.init();
    expect(service.currentTheme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('stays system if no persisted theme', async () => {
    ipc.invoke.mockResolvedValueOnce({ value: null });
    const service = new ThemeService(ipc);
    await service.init();
    expect(service.currentTheme).toBe('system');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/ui/src/browser/__tests__/theme.test.ts`
Expected: FAIL — ThemeService constructor doesn't accept IPC argument

- [ ] **Step 3: Update ThemeService to accept IPC and persist**

Replace `packages/ui/src/browser/theme.ts` entirely:

```typescript
import { Disposable, Emitter, createServiceIdentifier } from '@gho-work/base';
import type { Event } from '@gho-work/base';
import type { IIPCRenderer } from '@gho-work/platform/common';
import { IPC_CHANNELS } from '@gho-work/platform/common';

export type ThemeKind = 'light' | 'dark' | 'system';

export interface IThemeService {
  readonly currentTheme: ThemeKind;
  readonly onDidChangeTheme: Event<ThemeKind>;
  setTheme(theme: ThemeKind): void;
  init(): Promise<void>;
}

export const IThemeService = createServiceIdentifier<IThemeService>('IThemeService');

export class ThemeService extends Disposable implements IThemeService {
  private _currentTheme: ThemeKind = 'system';
  private readonly _onDidChangeTheme = this._register(new Emitter<ThemeKind>());
  readonly onDidChangeTheme: Event<ThemeKind> = this._onDidChangeTheme.event;

  constructor(private readonly _ipc: IIPCRenderer) {
    super();
  }

  get currentTheme(): ThemeKind {
    return this._currentTheme;
  }

  async init(): Promise<void> {
    try {
      const result = await this._ipc.invoke<{ value: string | null }>(
        IPC_CHANNELS.STORAGE_GET,
        { key: 'theme' },
      );
      if (result.value === 'light' || result.value === 'dark' || result.value === 'system') {
        this._currentTheme = result.value;
      }
    } catch (err) {
      console.warn('[ThemeService] Failed to load persisted theme:', err);
    }
    this._applyTheme(this._currentTheme);
  }

  setTheme(theme: ThemeKind): void {
    this._currentTheme = theme;
    this._applyTheme(theme);
    this._onDidChangeTheme.fire(theme);
    void this._ipc.invoke(IPC_CHANNELS.STORAGE_SET, { key: 'theme', value: theme }).catch((err) => {
      console.warn('[ThemeService] Failed to persist theme:', err);
    });
  }

  private _applyTheme(theme: ThemeKind): void {
    const resolved =
      theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : theme;
    document.documentElement.setAttribute('data-theme', resolved);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/ui/src/browser/__tests__/theme.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Fix ThemeService construction sites**

The `ThemeService` constructor now requires `IIPCRenderer`. Run `grep -rn "new ThemeService" packages/ apps/` to find all construction sites and update each one to pass `ipc`.

- [ ] **Step 6: Verify full build**

Run: `npx turbo build`
Expected: Clean build

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/browser/theme.ts packages/ui/src/browser/__tests__/theme.test.ts
git commit -m "feat: add IPC-based persistence to ThemeService"
```

---

### Task 3: Add STORAGE_GET / STORAGE_SET IPC handlers (if missing)

The spec assumes `STORAGE_GET` and `STORAGE_SET` channels are handled in the main process. The channels are defined in `IPC_CHANNELS` (lines 21-22) but may not have handlers in `mainProcess.ts`.

**Files:**
- Modify: `packages/electron/src/main/mainProcess.ts` (add storage handlers if missing)

- [ ] **Step 1: Check if handlers exist**

Run: `grep -n 'STORAGE_GET\|STORAGE_SET' packages/electron/src/main/mainProcess.ts`

If handlers exist, skip this task entirely.

- [ ] **Step 2: Add storage IPC handlers**

Add after the auth handlers section (~line 503) in `packages/electron/src/main/mainProcess.ts`:

```typescript
  // --- Storage handlers ---
  ipcMainAdapter.handle(IPC_CHANNELS.STORAGE_GET, async (...args: unknown[]) => {
    const { key } = args[0] as { key: string };
    const value = storageService?.getSetting(key) ?? null;
    return { value };
  });

  ipcMainAdapter.handle(IPC_CHANNELS.STORAGE_SET, async (...args: unknown[]) => {
    const { key, value } = args[0] as { key: string; value: string };
    storageService?.setSetting(key, value);
    return {};
  });
```

- [ ] **Step 3: Verify build**

Run: `npx turbo build --filter=@gho-work/electron`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add packages/electron/src/main/mainProcess.ts
git commit -m "feat: add STORAGE_GET/SET IPC handlers for settings persistence"
```

---

## Chunk 3: Settings Panel Shell

### Task 4: Create SettingsPanel widget

**Files:**
- Create: `packages/ui/src/browser/settings/settingsPanel.ts`
- Test: `packages/ui/src/browser/settings/__tests__/settingsPanel.test.ts` (new)

- [ ] **Step 1: Write failing tests for SettingsPanel**

Create `packages/ui/src/browser/settings/__tests__/settingsPanel.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsPanel } from '../settingsPanel.js';

function createMockIPC() {
  return {
    invoke: vi.fn().mockResolvedValue({}),
    on: vi.fn(),
    removeListener: vi.fn(),
  };
}

function createMockThemeService() {
  return {
    currentTheme: 'system' as const,
    onDidChangeTheme: vi.fn(() => ({ dispose: vi.fn() })),
    setTheme: vi.fn(),
    init: vi.fn(),
  };
}

describe('SettingsPanel', () => {
  let ipc: ReturnType<typeof createMockIPC>;
  let themeService: ReturnType<typeof createMockThemeService>;

  beforeEach(() => {
    ipc = createMockIPC();
    themeService = createMockThemeService();
  });

  it('renders nav with Appearance and Skills items', () => {
    const panel = new SettingsPanel(ipc, themeService);
    const dom = panel.getDomNode();
    const navItems = dom.querySelectorAll('.settings-nav-item');
    expect(navItems.length).toBe(2);
    expect(navItems[0].textContent).toBe('Appearance');
    expect(navItems[1].textContent).toBe('Skills');
    panel.dispose();
  });

  it('defaults to Appearance page', () => {
    const panel = new SettingsPanel(ipc, themeService);
    const dom = panel.getDomNode();
    const activeNav = dom.querySelector('.settings-nav-item.active');
    expect(activeNav?.textContent).toBe('Appearance');
    const content = dom.querySelector('.settings-content');
    expect(content?.querySelector('.theme-card')).toBeTruthy();
    panel.dispose();
  });

  it('switches to Skills page on nav click', () => {
    const panel = new SettingsPanel(ipc, themeService);
    const dom = panel.getDomNode();
    const navItems = dom.querySelectorAll('.settings-nav-item');
    (navItems[1] as HTMLElement).click();
    const activeNav = dom.querySelector('.settings-nav-item.active');
    expect(activeNav?.textContent).toBe('Skills');
    const content = dom.querySelector('.settings-content');
    expect(content?.querySelector('.skill-source-list')).toBeTruthy();
    panel.dispose();
  });

  it('disposes active page when switching', () => {
    const panel = new SettingsPanel(ipc, themeService);
    const dom = panel.getDomNode();
    const content = dom.querySelector('.settings-content')!;
    const initialChild = content.firstElementChild;
    const navItems = dom.querySelectorAll('.settings-nav-item');
    (navItems[1] as HTMLElement).click();
    expect(content.firstElementChild).not.toBe(initialChild);
    panel.dispose();
  });

  it('cleans up on dispose', () => {
    const panel = new SettingsPanel(ipc, themeService);
    panel.dispose();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/ui/src/browser/settings/__tests__/settingsPanel.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create SettingsPanel implementation**

Create `packages/ui/src/browser/settings/settingsPanel.ts`:

```typescript
import type { IIPCRenderer } from '@gho-work/platform/common';
import { Widget } from '../widget.js';
import { h } from '../dom.js';
import type { IThemeService } from '../theme.js';
import { AppearancePage } from './appearancePage.js';
import { SkillsPage } from './skillsPage.js';

interface NavItem {
  id: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'skills', label: 'Skills' },
];

export class SettingsPanel extends Widget {
  private _activePage: Widget | undefined;
  private _activeNavId: string = 'appearance';
  private readonly _contentEl: HTMLElement;
  private readonly _navItemEls: Map<string, HTMLElement> = new Map();

  constructor(
    private readonly _ipc: IIPCRenderer,
    private readonly _themeService: IThemeService,
  ) {
    const layout = h('div.settings-layout', [
      h('div.settings-nav@nav'),
      h('div.settings-content@content'),
    ]);
    super(layout.root);

    this._contentEl = layout.content;

    for (const item of NAV_ITEMS) {
      const el = document.createElement('div');
      el.className = 'settings-nav-item';
      el.textContent = item.label;
      el.dataset.id = item.id;
      this.listen(el, 'click', () => this._showPage(item.id));
      layout.nav.appendChild(el);
      this._navItemEls.set(item.id, el);
    }

    this._showPage('appearance');
  }

  private _showPage(id: string): void {
    if (id === this._activeNavId && this._activePage) {
      return;
    }

    if (this._activePage) {
      this._activePage.dispose();
      this._activePage = undefined;
    }

    while (this._contentEl.firstChild) {
      this._contentEl.removeChild(this._contentEl.firstChild);
    }

    this._activeNavId = id;
    for (const [navId, el] of this._navItemEls) {
      el.classList.toggle('active', navId === id);
    }

    let page: Widget;
    switch (id) {
      case 'skills': {
        const skillsPage = new SkillsPage(this._ipc);
        void skillsPage.load();
        page = skillsPage;
        break;
      }
      case 'appearance':
      default:
        page = new AppearancePage(this._themeService);
        break;
    }

    this._activePage = page;
    this._contentEl.appendChild(page.getDomNode());
  }

  override dispose(): void {
    this._activePage?.dispose();
    this._activePage = undefined;
    super.dispose();
  }
}
```

Note: This depends on `AppearancePage` and `SkillsPage` which are created in Tasks 5 and 6. For now, create stub files so the SettingsPanel tests can pass.

- [ ] **Step 4: Create stub AppearancePage**

Create `packages/ui/src/browser/settings/appearancePage.ts`:

```typescript
import { Widget } from '../widget.js';
import { h } from '../dom.js';
import type { IThemeService } from '../theme.js';

export class AppearancePage extends Widget {
  constructor(_themeService: IThemeService) {
    const layout = h('div.settings-page-appearance', [
      h('div.theme-card'),
    ]);
    super(layout.root);
  }
}
```

- [ ] **Step 5: Create stub SkillsPage**

Create `packages/ui/src/browser/settings/skillsPage.ts`:

```typescript
import type { IIPCRenderer } from '@gho-work/platform/common';
import { Widget } from '../widget.js';
import { h } from '../dom.js';

export class SkillsPage extends Widget {
  constructor(_ipc: IIPCRenderer) {
    const layout = h('div.settings-page-skills', [
      h('div.skill-source-list'),
    ]);
    super(layout.root);
  }

  async load(): Promise<void> {
    // Stub — implemented in Task 6
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run packages/ui/src/browser/settings/__tests__/settingsPanel.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 7: Verify build**

Run: `npx turbo build --filter=@gho-work/ui`
Expected: Clean build

- [ ] **Step 8: Commit**

```bash
git add packages/ui/src/browser/settings/
git commit -m "feat: add SettingsPanel shell with nav switching and stub pages"
```

---

## Chunk 4: Appearance Page

### Task 5: Implement AppearancePage with theme cards

**Files:**
- Modify: `packages/ui/src/browser/settings/appearancePage.ts` (replace stub)
- Test: `packages/ui/src/browser/settings/__tests__/appearancePage.test.ts` (new)

- [ ] **Step 1: Write failing tests**

Create `packages/ui/src/browser/settings/__tests__/appearancePage.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { AppearancePage } from '../appearancePage.js';
import type { ThemeKind } from '../../theme.js';

function createMockThemeService(initial: ThemeKind = 'system') {
  const listeners: Array<(theme: ThemeKind) => void> = [];
  return {
    currentTheme: initial,
    onDidChangeTheme: vi.fn((handler: (theme: ThemeKind) => void) => {
      listeners.push(handler);
      return { dispose: vi.fn() };
    }),
    setTheme: vi.fn((theme: ThemeKind) => {
      listeners.forEach((l) => l(theme));
    }),
    init: vi.fn(),
    _fire(theme: ThemeKind) {
      listeners.forEach((l) => l(theme));
    },
  };
}

describe('AppearancePage', () => {
  it('renders three theme cards', () => {
    const ts = createMockThemeService();
    const page = new AppearancePage(ts);
    const cards = page.getDomNode().querySelectorAll('.theme-card');
    expect(cards.length).toBe(3);
    page.dispose();
  });

  it('marks current theme as selected', () => {
    const ts = createMockThemeService('dark');
    const page = new AppearancePage(ts);
    const selected = page.getDomNode().querySelector('.theme-card.selected');
    expect(selected?.getAttribute('data-theme')).toBe('dark');
    page.dispose();
  });

  it('calls setTheme on card click', () => {
    const ts = createMockThemeService('system');
    const page = new AppearancePage(ts);
    const cards = page.getDomNode().querySelectorAll('.theme-card');
    const lightCard = Array.from(cards).find((c) => c.getAttribute('data-theme') === 'light');
    (lightCard as HTMLElement).click();
    expect(ts.setTheme).toHaveBeenCalledWith('light');
    page.dispose();
  });

  it('updates selected state when theme changes externally', () => {
    const ts = createMockThemeService('system');
    const page = new AppearancePage(ts);
    ts._fire('light');
    const selected = page.getDomNode().querySelector('.theme-card.selected');
    expect(selected?.getAttribute('data-theme')).toBe('light');
    page.dispose();
  });

  it('has accessible radiogroup structure', () => {
    const ts = createMockThemeService('dark');
    const page = new AppearancePage(ts);
    const dom = page.getDomNode();
    const group = dom.querySelector('[role="radiogroup"]');
    expect(group).toBeTruthy();
    const radios = dom.querySelectorAll('[role="radio"]');
    expect(radios.length).toBe(3);
    const checked = dom.querySelector('[aria-checked="true"]');
    expect(checked?.getAttribute('data-theme')).toBe('dark');
    page.dispose();
  });

  it('arrow keys move focus between cards', () => {
    const ts = createMockThemeService('system');
    const page = new AppearancePage(ts);
    const dom = page.getDomNode();
    const cards = dom.querySelectorAll('.theme-card') as NodeListOf<HTMLElement>;
    // Focus first card and press ArrowRight
    cards[0].focus();
    cards[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(cards[1]);
    // Press ArrowRight again
    cards[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(cards[2]);
    // Wrap around
    cards[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(cards[0]);
    page.dispose();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/ui/src/browser/settings/__tests__/appearancePage.test.ts`
Expected: FAIL — stub AppearancePage has no theme cards or logic

- [ ] **Step 3: Implement AppearancePage**

Replace `packages/ui/src/browser/settings/appearancePage.ts`:

```typescript
import { Widget } from '../widget.js';
import { h } from '../dom.js';
import type { IThemeService, ThemeKind } from '../theme.js';

const THEMES: Array<{ id: ThemeKind; label: string }> = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
];

export class AppearancePage extends Widget {
  private readonly _cardEls: Map<ThemeKind, HTMLElement> = new Map();

  constructor(private readonly _themeService: IThemeService) {
    const layout = h('div.settings-page-appearance', [
      h('h2.settings-page-title@title'),
      h('p.settings-page-subtitle@subtitle'),
      h('div.settings-section@section'),
    ]);
    super(layout.root);

    layout.title.textContent = 'Appearance';
    layout.subtitle.textContent = 'Customize the look and feel of the application';

    const sectionTitle = document.createElement('div');
    sectionTitle.className = 'settings-section-title';
    sectionTitle.textContent = 'Theme';
    layout.section.appendChild(sectionTitle);

    const cardContainer = document.createElement('div');
    cardContainer.className = 'theme-card-group';
    cardContainer.setAttribute('role', 'radiogroup');
    cardContainer.setAttribute('aria-label', 'Theme selection');
    layout.section.appendChild(cardContainer);

    for (const theme of THEMES) {
      const card = document.createElement('div');
      card.className = 'theme-card';
      card.setAttribute('data-theme', theme.id);
      card.setAttribute('role', 'radio');
      card.setAttribute('tabindex', '0');

      const preview = document.createElement('div');
      preview.className = 'theme-card-preview';
      this._buildPreview(preview, theme.id);
      card.appendChild(preview);

      const label = document.createElement('div');
      label.className = 'theme-card-label';
      label.textContent = theme.label;
      card.appendChild(label);

      this.listen(card, 'click', () => this._themeService.setTheme(theme.id));
      this.listen(card, 'keydown', (e) => {
        const key = (e as KeyboardEvent).key;
        if (key === 'Enter' || key === ' ') {
          e.preventDefault();
          this._themeService.setTheme(theme.id);
        } else if (key === 'ArrowRight' || key === 'ArrowDown') {
          e.preventDefault();
          const cards = Array.from(this._cardEls.values());
          const idx = cards.indexOf(card);
          const next = cards[(idx + 1) % cards.length];
          next.focus();
        } else if (key === 'ArrowLeft' || key === 'ArrowUp') {
          e.preventDefault();
          const cards = Array.from(this._cardEls.values());
          const idx = cards.indexOf(card);
          const prev = cards[(idx - 1 + cards.length) % cards.length];
          prev.focus();
        }
      });

      cardContainer.appendChild(card);
      this._cardEls.set(theme.id, card);
    }

    this._updateSelected(this._themeService.currentTheme);

    this._register(this._themeService.onDidChangeTheme((theme) => {
      this._updateSelected(theme);
    }));
  }

  private _buildPreview(container: HTMLElement, themeId: ThemeKind): void {
    if (themeId === 'light') {
      container.style.background = '#f5f5f5';
      const bar1 = document.createElement('div');
      Object.assign(bar1.style, { background: '#fff', borderRadius: '3px', height: '8px', marginBottom: '4px', width: '70%' });
      const bar2 = document.createElement('div');
      Object.assign(bar2.style, { background: '#e5e5e5', borderRadius: '3px', height: '8px', width: '50%' });
      container.append(bar1, bar2);
    } else if (themeId === 'dark') {
      container.style.background = '#1a1a2e';
      const bar1 = document.createElement('div');
      Object.assign(bar1.style, { background: '#2a2a4a', borderRadius: '3px', height: '8px', marginBottom: '4px', width: '70%' });
      const bar2 = document.createElement('div');
      Object.assign(bar2.style, { background: '#2a2a4a', borderRadius: '3px', height: '8px', width: '50%' });
      container.append(bar1, bar2);
    } else {
      container.style.background = 'linear-gradient(135deg, #f5f5f5 50%, #1a1a2e 50%)';
    }
  }

  private _updateSelected(theme: ThemeKind): void {
    for (const [id, el] of this._cardEls) {
      const isSelected = id === theme;
      el.classList.toggle('selected', isSelected);
      el.setAttribute('aria-checked', String(isSelected));
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/ui/src/browser/settings/__tests__/appearancePage.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/browser/settings/appearancePage.ts packages/ui/src/browser/settings/__tests__/appearancePage.test.ts
git commit -m "feat: implement AppearancePage with theme card selector"
```

---

## Chunk 5: Skills Page

### Task 6: Implement SkillsPage with skill browser and path config

**Files:**
- Modify: `packages/ui/src/browser/settings/skillsPage.ts` (replace stub)
- Test: `packages/ui/src/browser/settings/__tests__/skillsPage.test.ts` (new)

- [ ] **Step 1: Write failing tests**

Create `packages/ui/src/browser/settings/__tests__/skillsPage.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { SkillsPage } from '../skillsPage.js';

function createMockIPC(data?: {
  skills?: Array<{ id: string; category: string; name: string; description: string; sourceId: string; filePath: string }>;
  sources?: Array<{ id: string; priority: number; basePath: string }>;
}) {
  const skills = data?.skills ?? [
    { id: 'install/gh', category: 'install', name: 'gh', description: 'Install GitHub CLI', sourceId: 'bundled', filePath: '/skills/install/gh.md' },
    { id: 'auth/gh', category: 'auth', name: 'gh', description: 'Authenticate with GitHub', sourceId: 'bundled', filePath: '/skills/auth/gh.md' },
  ];
  const sources = data?.sources ?? [
    { id: 'bundled', priority: 0, basePath: 'skills/' },
    { id: 'user', priority: 10, basePath: '~/.gho-work/skills/' },
  ];

  return {
    invoke: vi.fn(async (channel: string, ..._args: unknown[]) => {
      if (channel === 'skill:list') {
        return skills;
      }
      if (channel === 'skill:sources') {
        return sources;
      }
      if (channel === 'skill:add-path') {
        return { ok: true };
      }
      if (channel === 'skill:remove-path') {
        return {};
      }
      if (channel === 'skill:rescan') {
        return skills;
      }
      return {};
    }),
    on: vi.fn(),
    removeListener: vi.fn(),
  };
}

describe('SkillsPage', () => {
  it('renders page title and subtitle', () => {
    const ipc = createMockIPC();
    const page = new SkillsPage(ipc);
    const dom = page.getDomNode();
    expect(dom.querySelector('.settings-page-title')?.textContent).toBe('Skills');
    expect(dom.querySelector('.settings-page-subtitle')?.textContent).toContain('skill');
    page.dispose();
  });

  it('renders skill sources after load', async () => {
    const ipc = createMockIPC();
    const page = new SkillsPage(ipc);
    await page.load();
    const dom = page.getDomNode();
    const sources = dom.querySelectorAll('.skill-source-item');
    expect(sources.length).toBe(2);
    page.dispose();
  });

  it('renders skills grouped by category after load', async () => {
    const ipc = createMockIPC();
    const page = new SkillsPage(ipc);
    await page.load();
    const dom = page.getDomNode();
    const categories = dom.querySelectorAll('.skill-category');
    expect(categories.length).toBe(2);
    const items = dom.querySelectorAll('.skill-item');
    expect(items.length).toBe(2);
    page.dispose();
  });

  it('shows remove button only for user paths (priority > 0)', async () => {
    const ipc = createMockIPC();
    const page = new SkillsPage(ipc);
    await page.load();
    const dom = page.getDomNode();
    const removeBtns = dom.querySelectorAll('.skill-source-remove');
    expect(removeBtns.length).toBe(1);
    page.dispose();
  });

  it('calls skill:add-path IPC when adding a path', async () => {
    const ipc = createMockIPC();
    const page = new SkillsPage(ipc);
    await page.load();
    const dom = page.getDomNode();
    const input = dom.querySelector('.skill-path-input') as HTMLInputElement;
    const addBtn = dom.querySelector('.skill-path-add-btn') as HTMLButtonElement;
    input.value = '/new/path';
    addBtn.click();
    expect(ipc.invoke).toHaveBeenCalledWith('skill:add-path', { path: '/new/path' });
    page.dispose();
  });

  it('shows error when add-path fails', async () => {
    const ipc = createMockIPC();
    ipc.invoke.mockImplementation(async (channel: string) => {
      if (channel === 'skill:add-path') {
        return { error: 'Directory not found' };
      }
      if (channel === 'skill:list') {
        return [];
      }
      if (channel === 'skill:sources') {
        return [];
      }
      return {};
    });
    const page = new SkillsPage(ipc);
    await page.load();
    const dom = page.getDomNode();
    const input = dom.querySelector('.skill-path-input') as HTMLInputElement;
    const addBtn = dom.querySelector('.skill-path-add-btn') as HTMLButtonElement;
    input.value = '/bad/path';
    addBtn.click();
    await vi.waitFor(() => {
      const error = dom.querySelector('.skill-path-input-error');
      expect(error?.textContent).toBe('Directory not found');
    });
    page.dispose();
  });

  it('calls skill:rescan IPC on rescan click', async () => {
    const ipc = createMockIPC();
    const page = new SkillsPage(ipc);
    await page.load();
    const dom = page.getDomNode();
    const rescanBtn = dom.querySelector('.skill-rescan-btn') as HTMLButtonElement;
    rescanBtn.click();
    expect(ipc.invoke).toHaveBeenCalledWith('skill:rescan');
    page.dispose();
  });

  it('shows empty state when no skills', async () => {
    const ipc = createMockIPC({ skills: [], sources: [] });
    const page = new SkillsPage(ipc);
    await page.load();
    const dom = page.getDomNode();
    const empty = dom.querySelector('.skill-empty-state');
    expect(empty).toBeTruthy();
    page.dispose();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/ui/src/browser/settings/__tests__/skillsPage.test.ts`
Expected: FAIL — stub SkillsPage has no real implementation

- [ ] **Step 3: Implement SkillsPage**

Replace `packages/ui/src/browser/settings/skillsPage.ts`:

```typescript
import type { IIPCRenderer } from '@gho-work/platform/common';
import { IPC_CHANNELS } from '@gho-work/platform/common';
import type { SkillEntryDTO, SkillSourceDTO } from '@gho-work/platform/common';
import { Widget } from '../widget.js';
import { h } from '../dom.js';

export class SkillsPage extends Widget {
  private readonly _sourceListEl: HTMLElement;
  private readonly _skillListEl: HTMLElement;
  private readonly _inputEl: HTMLInputElement;
  private readonly _errorEl: HTMLElement;

  constructor(private readonly _ipc: IIPCRenderer) {
    const layout = h('div.settings-page-skills', [
      h('h2.settings-page-title@title'),
      h('p.settings-page-subtitle@subtitle'),
      h('div.settings-section@sourcesSection'),
      h('div.settings-section@skillsSection'),
    ]);
    super(layout.root);

    layout.title.textContent = 'Skills';
    layout.subtitle.textContent = 'Manage agent skills and skill source directories';

    // --- Skill Sources section ---
    const sourcesTitle = document.createElement('div');
    sourcesTitle.className = 'settings-section-title';
    sourcesTitle.textContent = 'Skill Sources';
    layout.sourcesSection.appendChild(sourcesTitle);

    const sourcesSubtitle = document.createElement('div');
    sourcesSubtitle.className = 'settings-section-subtitle';
    sourcesSubtitle.textContent = 'Directories where skills are loaded from';
    layout.sourcesSection.appendChild(sourcesSubtitle);

    this._sourceListEl = document.createElement('div');
    this._sourceListEl.className = 'skill-source-list';
    this._sourceListEl.setAttribute('role', 'list');
    layout.sourcesSection.appendChild(this._sourceListEl);

    const inputRow = document.createElement('div');
    inputRow.className = 'skill-path-input-row';

    this._inputEl = document.createElement('input');
    this._inputEl.type = 'text';
    this._inputEl.className = 'skill-path-input';
    this._inputEl.placeholder = 'Add additional skill path...';
    this._inputEl.setAttribute('aria-label', 'Additional skill path');
    inputRow.appendChild(this._inputEl);

    const addBtn = document.createElement('button');
    addBtn.className = 'skill-path-add-btn';
    addBtn.textContent = 'Add';
    this.listen(addBtn, 'click', () => void this._addPath());
    inputRow.appendChild(addBtn);

    layout.sourcesSection.appendChild(inputRow);

    this._errorEl = document.createElement('div');
    this._errorEl.className = 'skill-path-input-error';
    this._errorEl.style.display = 'none';
    layout.sourcesSection.appendChild(this._errorEl);

    // --- Installed Skills section ---
    const skillsHeader = document.createElement('div');
    skillsHeader.className = 'settings-section-header';

    const skillsTitle = document.createElement('div');
    skillsTitle.className = 'settings-section-title';
    skillsTitle.textContent = 'Installed Skills';
    skillsHeader.appendChild(skillsTitle);

    const rescanBtn = document.createElement('button');
    rescanBtn.className = 'skill-rescan-btn';
    rescanBtn.textContent = '\u21bb Rescan';
    rescanBtn.setAttribute('aria-label', 'Rescan skill directories');
    this.listen(rescanBtn, 'click', () => void this._rescan());
    skillsHeader.appendChild(rescanBtn);

    layout.skillsSection.appendChild(skillsHeader);

    this._skillListEl = document.createElement('div');
    this._skillListEl.className = 'skill-list-container';
    layout.skillsSection.appendChild(this._skillListEl);

    const onSkillChanged = (...args: unknown[]) => {
      const skills = args[0] as SkillEntryDTO[];
      this._renderSkills(skills);
    };
    this._ipc.on(IPC_CHANNELS.SKILL_CHANGED, onSkillChanged);
    this._register({ dispose: () => this._ipc.removeListener(IPC_CHANNELS.SKILL_CHANGED, onSkillChanged) });
  }

  async load(): Promise<void> {
    try {
      const [sources, skills] = await Promise.all([
        this._ipc.invoke<SkillSourceDTO[]>(IPC_CHANNELS.SKILL_SOURCES),
        this._ipc.invoke<SkillEntryDTO[]>(IPC_CHANNELS.SKILL_LIST),
      ]);
      this._renderSources(sources);
      this._renderSkills(skills);
    } catch (err) {
      console.error('[SkillsPage] Failed to load skill data:', err);
    }
  }

  private _renderSources(sources: SkillSourceDTO[]): void {
    while (this._sourceListEl.firstChild) {
      this._sourceListEl.removeChild(this._sourceListEl.firstChild);
    }

    for (const source of sources) {
      const item = document.createElement('div');
      item.className = 'skill-source-item';
      item.setAttribute('role', 'listitem');

      const info = document.createElement('div');
      info.className = 'skill-source-info';

      const pathEl = document.createElement('div');
      pathEl.className = 'skill-source-path';
      pathEl.textContent = source.basePath;
      info.appendChild(pathEl);

      const descEl = document.createElement('div');
      descEl.className = 'skill-source-desc';
      descEl.textContent = source.priority <= 0 ? 'Built-in (bundled with app)' : 'User skills directory';
      info.appendChild(descEl);

      item.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'skill-source-actions';

      const badge = document.createElement('span');
      badge.className = source.priority <= 0 ? 'skill-source-badge default' : 'skill-source-badge user';
      badge.textContent = source.priority <= 0 ? 'default' : 'user';
      actions.appendChild(badge);

      if (source.priority > 0) {
        const removeBtn = document.createElement('button');
        removeBtn.className = 'skill-source-remove';
        removeBtn.textContent = '\u00d7';
        removeBtn.setAttribute('aria-label', `Remove path: ${source.basePath}`);
        this.listen(removeBtn, 'click', () => void this._removePath(source.basePath));
        actions.appendChild(removeBtn);
      }

      item.appendChild(actions);
      this._sourceListEl.appendChild(item);
    }
  }

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
        const item = document.createElement('div');
        item.className = 'skill-item';

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

        const source = document.createElement('div');
        source.className = 'skill-item-source';
        source.textContent = entry.sourceId;
        item.appendChild(source);

        groupEl.appendChild(item);
      }

      this._skillListEl.appendChild(groupEl);
    }
  }

  private async _addPath(): Promise<void> {
    const pathValue = this._inputEl.value.trim();
    if (!pathValue) {
      return;
    }

    this._errorEl.style.display = 'none';

    try {
      const result = await this._ipc.invoke<{ ok?: true; error?: string }>(
        IPC_CHANNELS.SKILL_ADD_PATH,
        { path: pathValue },
      );

      if ('error' in result && result.error) {
        this._errorEl.textContent = result.error;
        this._errorEl.style.display = '';
        return;
      }

      this._inputEl.value = '';
      await this.load();
    } catch (err) {
      this._errorEl.textContent = 'Failed to add path';
      this._errorEl.style.display = '';
      console.error('[SkillsPage] Failed to add path:', err);
    }
  }

  private async _removePath(pathToRemove: string): Promise<void> {
    try {
      await this._ipc.invoke(IPC_CHANNELS.SKILL_REMOVE_PATH, { path: pathToRemove });
      await this.load();
    } catch (err) {
      console.error('[SkillsPage] Failed to remove path:', err);
    }
  }

  private async _rescan(): Promise<void> {
    try {
      const skills = await this._ipc.invoke<SkillEntryDTO[]>(IPC_CHANNELS.SKILL_RESCAN);
      this._renderSkills(skills);
    } catch (err) {
      console.error('[SkillsPage] Failed to rescan:', err);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/ui/src/browser/settings/__tests__/skillsPage.test.ts`
Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/browser/settings/skillsPage.ts packages/ui/src/browser/settings/__tests__/skillsPage.test.ts
git commit -m "feat: implement SkillsPage with skill browser and path configuration"
```

---

## Chunk 6: Skill IPC Handlers

### Task 7: Add skill IPC handlers in main process

**Files:**
- Modify: `packages/electron/src/main/mainProcess.ts` (add handlers after connector handlers)

- [ ] **Step 1: Add skill IPC handlers**

Add after the connector handler section in `packages/electron/src/main/mainProcess.ts`. The `skillRegistry` variable (line 263) and `storageService` variable (line 96) are already in scope. Import `SkillSource` from `@gho-work/agent` at the top of the file.

```typescript
  // --- Skill handlers ---
  ipcMainAdapter.handle(IPC_CHANNELS.SKILL_LIST, async () => {
    return skillRegistry.list();
  });

  ipcMainAdapter.handle(IPC_CHANNELS.SKILL_SOURCES, async () => {
    return skillSources;
  });

  ipcMainAdapter.handle(IPC_CHANNELS.SKILL_ADD_PATH, async (...args: unknown[]) => {
    const { path: newPath } = args[0] as { path: string };

    // Validate path exists
    if (!fs.existsSync(newPath)) {
      return { error: 'Directory not found' };
    }

    // Check for duplicates
    const existing = storageService?.getSetting('skills.additionalPaths');
    const paths: string[] = existing ? JSON.parse(existing) : [];
    if (paths.includes(newPath) || skillSources.some((s) => s.basePath === newPath)) {
      return { error: 'Path already added' };
    }

    paths.push(newPath);
    storageService?.setSetting('skills.additionalPaths', JSON.stringify(paths));

    skillSources.push({ id: `additional-${paths.length}`, priority: 20, basePath: newPath });
    await skillRegistry.refresh();

    ipcMainAdapter.sendToRenderer(IPC_CHANNELS.SKILL_CHANGED, skillRegistry.list());
    return { ok: true as const };
  });

  ipcMainAdapter.handle(IPC_CHANNELS.SKILL_REMOVE_PATH, async (...args: unknown[]) => {
    const { path: removePath } = args[0] as { path: string };

    const existing = storageService?.getSetting('skills.additionalPaths');
    const paths: string[] = existing ? JSON.parse(existing) : [];
    const filtered = paths.filter((p) => p !== removePath);
    storageService?.setSetting('skills.additionalPaths', JSON.stringify(filtered));

    const idx = skillSources.findIndex((s) => s.basePath === removePath && s.priority > 0);
    if (idx >= 0) {
      skillSources.splice(idx, 1);
    }
    await skillRegistry.refresh();

    ipcMainAdapter.sendToRenderer(IPC_CHANNELS.SKILL_CHANGED, skillRegistry.list());
  });

  ipcMainAdapter.handle(IPC_CHANNELS.SKILL_RESCAN, async () => {
    await skillRegistry.refresh();
    return skillRegistry.list();
  });
```

**Pre-flight checks:**
- Verify `fs` is already imported at the top of `mainProcess.ts` (it should be — `import * as fs from 'node:fs'` or similar). If not, add it.
- Verify `skillSources` is mutable — `buildSkillSources()` returns a plain array, but if it's declared as `const skillSources = buildSkillSources(...)` the reference is const while the array contents are mutable (`.push()` works). If for some reason it's frozen, spread into a mutable copy: `const skillSources: SkillSource[] = [...buildSkillSources(...)]`.
- The `ipcMainAdapter.sendToRenderer()` method is already available in scope (used by connector handlers).

- [ ] **Step 2: Load persisted additional paths on startup**

After `const skillSources = buildSkillSources(...)` (line 258), add:

```typescript
  // Load persisted additional skill paths
  const additionalPathsRaw = storageService?.getSetting('skills.additionalPaths');
  if (additionalPathsRaw) {
    try {
      const additionalPaths: string[] = JSON.parse(additionalPathsRaw);
      for (let i = 0; i < additionalPaths.length; i++) {
        if (fs.existsSync(additionalPaths[i])) {
          skillSources.push({ id: `additional-${i + 1}`, priority: 20, basePath: additionalPaths[i] });
        }
      }
    } catch (err) {
      console.warn('[main] Failed to load additional skill paths:', err);
    }
  }
```

- [ ] **Step 3: Verify build**

Run: `npx turbo build --filter=@gho-work/electron`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add packages/electron/src/main/mainProcess.ts
git commit -m "feat: add skill list/sources/add/remove/rescan IPC handlers"
```

---

## Chunk 7: Workbench Integration & CSS

### Task 8: Wire SettingsPanel into workbench

**Files:**
- Modify: `packages/ui/src/browser/workbench.ts` (add settings panel toggling)
- Modify: `packages/ui/src/index.ts` (export SettingsPanel if needed)

- [ ] **Step 1: Add imports and instance variables**

In `packages/ui/src/browser/workbench.ts`, add import at top:

```typescript
import { SettingsPanel } from './settings/settingsPanel.js';
import { ThemeService } from './theme.js';
```

Add instance variables after the existing ones (around line 24):

```typescript
  private _settingsPanel: SettingsPanel | undefined;
  private _themeService!: ThemeService;
  private _mainEl!: HTMLElement;
```

- [ ] **Step 2: Create ThemeService in render()**

In the `render()` method, before creating ChatPanel (line 88), add:

```typescript
    this._themeService = this._register(new ThemeService(this._ipc));
    void this._themeService.init();
```

- [ ] **Step 3: Store reference to main element**

After `layout.main` is used (line 48), store reference:

```typescript
    this._mainEl = layout.main;
```

- [ ] **Step 4: Update onDidSelectItem handler**

Replace the existing `onDidSelectItem` handler (lines 79-85). **Important:** The replacement must preserve the `connectorSidebarActivated` guard variable that is a local `let` inside `render()` — the new handler uses it in the `else` branch:

```typescript
    this._register(this._activityBar.onDidSelectItem(async (item) => {
      if (item === 'settings') {
        this._sidebar.getDomNode().style.display = 'none';
        this._chatPanel.getDomNode().style.display = 'none';

        if (!this._settingsPanel) {
          this._settingsPanel = this._register(new SettingsPanel(this._ipc, this._themeService));
        }
        this._settingsPanel.getDomNode().style.display = '';
        if (!this._mainEl.contains(this._settingsPanel.getDomNode())) {
          this._mainEl.appendChild(this._settingsPanel.getDomNode());
        }
      } else {
        this._sidebar.getDomNode().style.display = '';
        this._chatPanel.getDomNode().style.display = '';
        if (this._settingsPanel) {
          this._settingsPanel.getDomNode().style.display = 'none';
        }

        this._sidebar.showPanel(item);
        if (item === 'connectors' && !connectorSidebarActivated) {
          connectorSidebarActivated = true;
          await this._connectorSidebar.activate();
        }
      }
    }));
```

- [ ] **Step 5: Export SettingsPanel from packages/ui**

Check `packages/ui/src/index.ts` and add export if needed:

```typescript
export { SettingsPanel } from './browser/settings/settingsPanel.js';
```

- [ ] **Step 6: Verify build**

Run: `npx turbo build`
Expected: Clean build

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/browser/workbench.ts packages/ui/src/index.ts
git commit -m "feat: wire SettingsPanel into workbench with activity bar toggling"
```

---

### Task 9: Add settings CSS

**Files:**
- Create: `apps/desktop/src/renderer/settings.css`
- Modify: `apps/desktop/src/renderer/main.ts:8` (add import)

- [ ] **Step 1: Create settings.css**

Create `apps/desktop/src/renderer/settings.css`. Use CSS custom properties from `styles.css` — never hardcode hex values. Full content:

```css
/* Settings panel layout */
.settings-layout { display: flex; height: 100%; }

.settings-nav {
  width: 160px;
  background: var(--bg-secondary);
  padding: 16px;
  border-right: 1px solid var(--border-primary);
  flex-shrink: 0;
}

.settings-nav-item {
  padding: 6px 10px;
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  color: var(--fg-secondary);
  cursor: pointer;
  margin-bottom: 2px;
}
.settings-nav-item:hover { background: var(--bg-hover); }
.settings-nav-item.active { background: var(--brand-primary); color: #fff; }

.settings-content { flex: 1; padding: 24px; overflow-y: auto; }

.settings-page-title {
  font-size: var(--font-size-xl);
  font-weight: 600;
  color: var(--fg-primary);
  margin: 0 0 4px 0;
}
.settings-page-subtitle {
  font-size: var(--font-size-sm);
  color: var(--fg-muted);
  margin: 0 0 24px 0;
}

.settings-section { margin-bottom: 24px; }
.settings-section-title {
  font-size: var(--font-size-base);
  font-weight: 500;
  color: var(--fg-secondary);
  margin-bottom: 8px;
}
.settings-section-subtitle {
  font-size: var(--font-size-sm);
  color: var(--fg-muted);
  margin-bottom: 12px;
}
.settings-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

/* Theme cards */
.theme-card-group { display: flex; gap: 12px; }
.theme-card {
  width: 100px;
  border-radius: var(--radius-lg);
  border: 2px solid var(--border-secondary);
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.15s;
}
.theme-card:hover { border-color: var(--border-primary); }
.theme-card.selected { border-color: var(--brand-primary); }
.theme-card:focus-visible { outline: 2px solid var(--brand-primary); outline-offset: 2px; }
.theme-card-preview { height: 60px; padding: 8px; }
.theme-card-label {
  padding: 6px 8px;
  font-size: var(--font-size-sm);
  text-align: center;
  color: var(--fg-secondary);
}
.theme-card.selected .theme-card-label {
  color: var(--fg-primary);
  background: rgba(99, 102, 241, 0.1);
}

/* Skill sources */
.skill-source-list {
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-primary);
  padding: 12px;
  margin-bottom: 8px;
}
.skill-source-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
}
.skill-source-item + .skill-source-item { margin-top: 8px; }
.skill-source-path { font-size: var(--font-size-sm); color: var(--fg-primary); }
.skill-source-desc { font-size: var(--font-size-sm); color: var(--fg-muted); }
.skill-source-actions { display: flex; align-items: center; gap: 8px; }
.skill-source-badge {
  font-size: var(--font-size-sm);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
}
.skill-source-badge.default { background: var(--bg-tertiary); color: var(--fg-muted); }
.skill-source-badge.user { background: rgba(245, 158, 11, 0.1); color: var(--fg-warning); }
.skill-source-remove {
  background: transparent;
  border: none;
  color: var(--fg-muted);
  cursor: pointer;
  font-size: 16px;
  padding: 0 4px;
  line-height: 1;
}
.skill-source-remove:hover { color: var(--fg-error); }

/* Add path input */
.skill-path-input-row { display: flex; gap: 8px; margin-top: 8px; }
.skill-path-input {
  flex: 1;
  background: var(--bg-input);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  padding: 6px 10px;
  color: var(--fg-primary);
  font-size: var(--font-size-sm);
  font-family: var(--font-family);
}
.skill-path-input::placeholder { color: var(--fg-muted); }
.skill-path-add-btn {
  background: var(--brand-primary);
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  padding: 6px 14px;
  font-size: var(--font-size-sm);
  cursor: pointer;
}
.skill-path-add-btn:hover { opacity: 0.9; }
.skill-path-input-error {
  color: var(--fg-error);
  font-size: var(--font-size-sm);
  margin-top: 4px;
}

/* Skill list */
.skill-category {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--fg-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
  margin-top: 12px;
}
.skill-list-group {
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-primary);
  margin-bottom: 12px;
}
.skill-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
}
.skill-item + .skill-item { border-top: 1px solid var(--border-primary); }
.skill-item-name { font-size: var(--font-size-sm); color: var(--fg-primary); }
.skill-item-desc { font-size: var(--font-size-sm); color: var(--fg-muted); }
.skill-item-source { font-size: var(--font-size-sm); color: var(--fg-muted); }
.skill-empty-state {
  color: var(--fg-muted);
  font-size: var(--font-size-sm);
  padding: 16px;
  text-align: center;
}

/* Rescan button */
.skill-rescan-btn {
  background: transparent;
  border: 1px solid var(--border-primary);
  color: var(--fg-secondary);
  border-radius: var(--radius-md);
  padding: 4px 10px;
  font-size: var(--font-size-sm);
  cursor: pointer;
}
.skill-rescan-btn:hover { background: var(--bg-hover); }
```

- [ ] **Step 2: Import settings.css in renderer entry**

Add to `apps/desktop/src/renderer/main.ts` after line 8:

```typescript
import './settings.css';
```

- [ ] **Step 3: Verify build**

Run: `npx turbo build`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/settings.css apps/desktop/src/renderer/main.ts
git commit -m "feat: add settings panel CSS styles"
```

---

## Chunk 8: E2E Test

### Task 10: Add Playwright E2E test for settings

**Files:**
- Create: `tests/e2e/settings.spec.ts`

- [ ] **Step 1: Create E2E test**

Create `tests/e2e/settings.spec.ts`. The test should:

1. Launch the Electron app via `_electron.launch()`
2. Wait for workbench to render
3. Click gear icon → verify settings view appears, chat and sidebar hidden
4. Verify Appearance is the default page with three theme cards
5. Click Dark theme card → verify `data-theme="dark"` on html element
6. Click Skills nav item → verify skill list is visible
7. Click chat icon → verify chat returns, settings hidden, sidebar visible

Adapt the test setup from existing E2E tests in `tests/e2e/` (check the actual app launch pattern used there — it may differ from the standard `_electron.launch()`).

- [ ] **Step 2: Run E2E test**

Run: `npx turbo build && npx playwright test tests/e2e/settings.spec.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/settings.spec.ts
git commit -m "test: add Playwright E2E tests for settings UI"
```

---

## Chunk 9: Verification

### Task 11: HARD GATE — Launch app and verify settings UI

- [ ] **Step 1: Build the app**

Run: `npx turbo build`

- [ ] **Step 2: Launch the app**

Run: `npm run desktop:dev`

- [ ] **Step 3: Verify the complete flow**

1. Click gear icon → settings view appears, sidebar and chat hidden
2. Appearance page is default → three theme cards visible
3. Click "Dark" → theme changes immediately, card shows selected
4. Click "Light" → theme changes, card updates
5. Click "System" → theme follows OS preference
6. Click "Skills" in nav → skills page appears with sources and skill list
7. Click chat icon → returns to chat, sidebar visible again
8. Click gear again → settings remembers last page (Skills)

- [ ] **Step 4: Self-verify with Playwright screenshot script**

Write a temp script using `_electron.launch()` that navigates through settings, takes screenshots at each checkpoint, and view them with Read tool. Delete the script after verification.

- [ ] **Step 5: Run full test suite**

Run: `npx turbo lint && npx turbo build && npx vitest run && npx playwright test`
Expected: All quality gates pass

- [ ] **Step 6: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address issues found during settings UI verification"
```
