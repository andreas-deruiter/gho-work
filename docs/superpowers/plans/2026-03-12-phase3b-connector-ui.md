# Phase 3B: Connector UI — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the UI layer for managing MCP connectors and CLI tools — sidebar, slide-over drawer, unified tool view, CLI install/auth, status banners.

**Architecture:** Widget-per-section approach. Each UI section is its own widget class extending `Disposable`, composed into a drawer and sidebar. IPC calls go through `window.ghoWorkIPC` to existing Phase 3A handlers plus 2 new channels. State flows one way: IPC push events -> widget updates.

**Tech Stack:** TypeScript, Electron IPC, Zod schemas, VS Code-style Widget/Disposable/Emitter patterns, `h()` DOM helper, CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-03-12-phase3b-connector-ui-design.md`

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `packages/ui/src/browser/connectors/connectorListItem.ts` | `ConnectorListItemWidget` — single connector row |
| `packages/ui/src/browser/connectors/connectorListItem.test.ts` | Unit tests for connector row |
| `packages/ui/src/browser/connectors/cliToolListItem.ts` | `CLIToolListItemWidget` — CLI tool row with install/auth |
| `packages/ui/src/browser/connectors/cliToolListItem.test.ts` | Unit tests for CLI tool row |
| `packages/ui/src/browser/connectors/connectorSidebar.ts` | `ConnectorSidebarWidget` — sidebar panel with 3 groups |
| `packages/ui/src/browser/connectors/connectorSidebar.test.ts` | Unit tests for sidebar |
| `packages/ui/src/browser/connectors/connectorStatusBanner.ts` | `StatusBannerWidget` — error/warning banner |
| `packages/ui/src/browser/connectors/connectorStatusBanner.test.ts` | Unit tests for status banner |
| `packages/ui/src/browser/connectors/toolListSection.ts` | `ToolListSectionWidget` — unified tool list with search |
| `packages/ui/src/browser/connectors/toolListSection.test.ts` | Unit tests for tool list |
| `packages/ui/src/browser/connectors/connectorConfigForm.ts` | `ConnectorConfigFormWidget` — add/edit form |
| `packages/ui/src/browser/connectors/connectorConfigForm.test.ts` | Unit tests for config form |
| `packages/ui/src/browser/connectors/connectorDrawer.ts` | `ConnectorDrawerWidget` — slide-over drawer panel |
| `packages/ui/src/browser/connectors/connectorDrawer.test.ts` | Unit tests for drawer |
| `tests/e2e/connectors-ui.spec.ts` | Playwright E2E tests for connector UI flows |

### Modified files

| File | Change |
|------|--------|
| `packages/platform/src/ipc/common/ipc.ts` | Add `CLI_INSTALL`, `CLI_AUTHENTICATE` channels + Zod schemas |
| `packages/connectors/src/common/cliDetection.ts` | Add `installTool()`, `authenticateTool()` to interface |
| `packages/connectors/src/node/cliDetectionImpl.ts` | Implement `installTool()`, `authenticateTool()` |
| `packages/connectors/src/node/__tests__/cliDetectionImpl.test.ts` | Tests for install/auth methods |
| `packages/electron/src/main/mainProcess.ts` | Add IPC handlers for CLI_INSTALL, CLI_AUTHENTICATE |
| `packages/ui/src/browser/workbench.ts` | Add sidebar panel switching + drawer |
| `packages/ui/src/index.ts` | Export new connectors UI widgets |
| `apps/desktop/src/renderer/styles.css` | CSS for all new connector UI components |

---

## Chunk 1: IPC + Service Layer

### Task 1: Add CLI_INSTALL and CLI_AUTHENTICATE IPC channels

**Files:**
- Modify: `packages/platform/src/ipc/common/ipc.ts`

- [ ] **Step 1: Add channel constants to IPC_CHANNELS**

In `packages/platform/src/ipc/common/ipc.ts`, add after the `CLI_REFRESH` line (line 41):

```typescript
  CLI_INSTALL: 'cli:install',
  CLI_AUTHENTICATE: 'cli:authenticate',
```

- [ ] **Step 2: Add Zod schemas for CLI_INSTALL and CLI_AUTHENTICATE**

Add after `CLIDetectResponseSchema` (line 274):

```typescript
export const CLIInstallRequestSchema = z.object({
  toolId: z.string(),
});
export type CLIInstallRequest = z.infer<typeof CLIInstallRequestSchema>;

export const CLIInstallResponseSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  version: z.string().optional(),
  installUrl: z.string().optional(),
});
export type CLIInstallResponse = z.infer<typeof CLIInstallResponseSchema>;

export const CLIAuthenticateRequestSchema = z.object({
  toolId: z.string(),
});
export type CLIAuthenticateRequest = z.infer<typeof CLIAuthenticateRequestSchema>;

export const CLIAuthenticateResponseSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});
export type CLIAuthenticateResponse = z.infer<typeof CLIAuthenticateResponseSchema>;
```

- [ ] **Step 3: Verify build**

Run: `cd packages/platform && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add packages/platform/src/ipc/common/ipc.ts
git commit -m "feat(platform): add CLI_INSTALL and CLI_AUTHENTICATE IPC channels"
```

---

### Task 2: Add installTool and authenticateTool to CLI detection service

**Files:**
- Modify: `packages/connectors/src/common/cliDetection.ts`
- Modify: `packages/connectors/src/node/cliDetectionImpl.ts`
- Modify: `packages/connectors/src/node/__tests__/cliDetectionImpl.test.ts`

- [ ] **Step 1: Write failing tests for installTool and authenticateTool**

Add to `packages/connectors/src/node/__tests__/cliDetectionImpl.test.ts`:

```typescript
describe('CLIDetectionServiceImpl.installTool', () => {
  it('returns the installUrl for a known tool', async () => {
    const mockExec: ExecFileFunction = vi.fn().mockRejectedValue(new Error('ENOENT'));
    const service = new CLIDetectionServiceImpl(mockExec);
    const result = await service.installTool('gh');
    expect(result.success).toBe(true);
    expect(result.installUrl).toBe('https://cli.github.com');
  });

  it('returns error for unknown tool', async () => {
    const mockExec: ExecFileFunction = vi.fn().mockRejectedValue(new Error('ENOENT'));
    const service = new CLIDetectionServiceImpl(mockExec);
    const result = await service.installTool('nonexistent');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unknown/i);
  });
});

describe('CLIDetectionServiceImpl.authenticateTool', () => {
  it('runs auth command and returns success', async () => {
    const mockExec: ExecFileFunction = vi.fn().mockResolvedValue({ stdout: 'OK', stderr: '' });
    const service = new CLIDetectionServiceImpl(mockExec);
    const result = await service.authenticateTool('gh');
    expect(result.success).toBe(true);
    // authCommand is 'gh auth login', split into ['gh', 'auth', 'login']
    expect(mockExec).toHaveBeenCalledWith('gh', ['auth', 'login']);
  });

  it('returns error when auth command fails', async () => {
    const mockExec: ExecFileFunction = vi.fn().mockRejectedValue(new Error('auth failed'));
    const service = new CLIDetectionServiceImpl(mockExec);
    const result = await service.authenticateTool('gh');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/auth failed/);
  });

  it('returns error for tool without auth command', async () => {
    const mockExec: ExecFileFunction = vi.fn();
    const service = new CLIDetectionServiceImpl(mockExec);
    const result = await service.authenticateTool('pandoc');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no auth/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/connectors && npx vitest run src/node/__tests__/cliDetectionImpl.test.ts`
Expected: FAIL -- `installTool` and `authenticateTool` not found

- [ ] **Step 3: Add method signatures to the interface**

In `packages/connectors/src/common/cliDetection.ts`, add to `ICLIDetectionService` (after `refresh()`, before event):

```typescript
  installTool(toolId: string): Promise<{ success: boolean; installUrl?: string; error?: string }>;
  authenticateTool(toolId: string): Promise<{ success: boolean; error?: string }>;
```

- [ ] **Step 4: Implement installTool in CLIDetectionServiceImpl**

In `packages/connectors/src/node/cliDetectionImpl.ts`, add method to `CLIDetectionServiceImpl`:

```typescript
  async installTool(toolId: string): Promise<{ success: boolean; installUrl?: string; error?: string }> {
    const def = CLI_TOOLS.find(t => t.id === toolId);
    if (!def) {
      return { success: false, error: `Unknown tool: ${toolId}` };
    }
    return { success: true, installUrl: def.installUrl };
  }
```

- [ ] **Step 5: Implement authenticateTool in CLIDetectionServiceImpl**

```typescript
  async authenticateTool(toolId: string): Promise<{ success: boolean; error?: string }> {
    const def = CLI_TOOLS.find(t => t.id === toolId);
    if (!def) {
      return { success: false, error: `Unknown tool: ${toolId}` };
    }
    if (!def.authCommand) {
      return { success: false, error: `No auth command for ${def.name}` };
    }
    const parts = def.authCommand.split(' ');
    try {
      await this._execFile(parts[0], parts.slice(1));
      this._cache = null;
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd packages/connectors && npx vitest run src/node/__tests__/cliDetectionImpl.test.ts`
Expected: All PASS

- [ ] **Step 7: Verify build**

Run: `cd packages/connectors && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 8: Commit**

```bash
git add packages/connectors/src/common/cliDetection.ts packages/connectors/src/node/cliDetectionImpl.ts packages/connectors/src/node/__tests__/cliDetectionImpl.test.ts
git commit -m "feat(connectors): add installTool and authenticateTool to CLI detection service"
```

---

### Task 3: Add IPC handlers for CLI_INSTALL and CLI_AUTHENTICATE

**Files:**
- Modify: `packages/electron/src/main/mainProcess.ts`

- [ ] **Step 1: Add CLI_INSTALL IPC handler**

In `mainProcess.ts`, add after the `CLI_REFRESH` handler (around line 736):

```typescript
  ipcMainAdapter.handle(IPC_CHANNELS.CLI_INSTALL, async (...args: unknown[]) => {
    if (!cliDetectionService) {
      return { success: false, error: 'Service not available' };
    }
    const request = args[0] as { toolId: string };
    const result = await cliDetectionService.installTool(request.toolId);
    if (result.success && result.installUrl) {
      await shell.openExternal(result.installUrl);
    }
    return result;
  });
```

- [ ] **Step 2: Add CLI_AUTHENTICATE IPC handler**

```typescript
  ipcMainAdapter.handle(IPC_CHANNELS.CLI_AUTHENTICATE, async (...args: unknown[]) => {
    if (!cliDetectionService) {
      return { success: false, error: 'Service not available' };
    }
    const request = args[0] as { toolId: string };
    const result = await cliDetectionService.authenticateTool(request.toolId);
    if (result.success) {
      await cliDetectionService.refresh();
    }
    return result;
  });
```

- [ ] **Step 3: Verify build**

Run: `npx turbo build`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add packages/electron/src/main/mainProcess.ts
git commit -m "feat(electron): add IPC handlers for CLI install and authenticate"
```

---

## Chunk 2: Sidebar Widgets

### Task 4: Refactor Workbench to use Sidebar panel switching

**Files:**
- Modify: `packages/ui/src/browser/workbench.ts`

The `Sidebar` class at `packages/ui/src/browser/sidebar.ts` already has `addPanel(id, element)` and `showPanel(id)`. The workbench currently bypasses it and renders `ConversationListPanel` directly. This task wires it up properly.

- [ ] **Step 1: Update Workbench to use Sidebar widget**

In `packages/ui/src/browser/workbench.ts`:

Add import:
```typescript
import { Sidebar } from './sidebar.js';
```

Add field:
```typescript
private readonly _sidebar: Sidebar;
```

In constructor, add:
```typescript
this._sidebar = this._register(new Sidebar());
```

Remove the `_sidebarEl` field and add `_sidebar` field. Update `_toggleSidebar()` to use `this._sidebar.getDomNode()` instead of `this._sidebarEl`:

```typescript
  private _toggleSidebar(): void {
    this._sidebarVisible = !this._sidebarVisible;
    this._sidebar.getDomNode().style.display = this._sidebarVisible ? '' : 'none';
  }
```

In `render()`, replace the sidebar section (lines 48-56) with:
```typescript
    // Sidebar with panel switching
    layout.sidebar.appendChild(this._sidebar.getDomNode());

    // Chat panel in sidebar (default)
    this._conversationList = this._register(new ConversationListPanel(this._ipc));
    const chatSidebarContainer = document.createElement('div');
    chatSidebarContainer.className = 'sidebar-panel-chat';
    this._conversationList.render(chatSidebarContainer);
    this._sidebar.addPanel('chat', chatSidebarContainer);

    this._conversationList.onDidSelectConversation((conversationId) => {
      void this._chatPanel.loadConversation(conversationId);
    });
    this._conversationList.onDidRequestNewConversation(() => {
      void this._createNewConversation();
    });

    // Wire activity bar to sidebar panel switching
    this._register(this._activityBar.onDidSelectItem((item) => {
      this._sidebar.showPanel(item);
    }));
```

- [ ] **Step 2: Verify build**

Run: `npx turbo build`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/browser/workbench.ts
git commit -m "refactor(ui): use Sidebar panel switching in Workbench"
```

---

### Task 5: Create ConnectorListItemWidget

**Files:**
- Create: `packages/ui/src/browser/connectors/connectorListItem.ts`
- Create: `packages/ui/src/browser/connectors/connectorListItem.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/ui/src/browser/connectors/connectorListItem.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectorListItemWidget } from './connectorListItem.js';
import type { ConnectorConfig } from '@gho-work/base';

function makeConfig(overrides: Partial<ConnectorConfig> = {}): ConnectorConfig {
  return {
    id: 'test-1',
    type: 'local_mcp',
    name: 'Test Server',
    transport: 'stdio',
    command: 'node',
    enabled: true,
    status: 'connected',
    ...overrides,
  };
}

describe('ConnectorListItemWidget', () => {
  beforeEach(() => { document.body.textContent = ''; });

  it('renders connector name', () => {
    const w = new ConnectorListItemWidget(makeConfig({ name: 'My Server' }));
    document.body.appendChild(w.getDomNode());
    expect(w.getDomNode().textContent).toContain('My Server');
    w.dispose();
  });

  it('renders green dot when connected', () => {
    const w = new ConnectorListItemWidget(makeConfig({ status: 'connected' }));
    document.body.appendChild(w.getDomNode());
    const dot = w.getDomNode().querySelector('.connector-status-dot');
    expect(dot?.classList.contains('status-connected')).toBe(true);
    w.dispose();
  });

  it('renders red dot when error', () => {
    const w = new ConnectorListItemWidget(makeConfig({ status: 'error' }));
    document.body.appendChild(w.getDomNode());
    expect(w.getDomNode().querySelector('.status-error')).toBeTruthy();
    w.dispose();
  });

  it('fires onDidClick with connector id', () => {
    const w = new ConnectorListItemWidget(makeConfig({ id: 'c1' }));
    document.body.appendChild(w.getDomNode());
    const fn = vi.fn();
    w.onDidClick(fn);
    w.getDomNode().click();
    expect(fn).toHaveBeenCalledWith('c1');
    w.dispose();
  });

  it('updateStatus changes dot class', () => {
    const w = new ConnectorListItemWidget(makeConfig({ status: 'connected' }));
    document.body.appendChild(w.getDomNode());
    w.updateStatus('error');
    expect(w.getDomNode().querySelector('.status-error')).toBeTruthy();
    w.dispose();
  });

  it('setHighlighted toggles active class', () => {
    const w = new ConnectorListItemWidget(makeConfig());
    w.setHighlighted(true);
    expect(w.getDomNode().classList.contains('active')).toBe(true);
    w.setHighlighted(false);
    expect(w.getDomNode().classList.contains('active')).toBe(false);
    w.dispose();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/ui && npx vitest run src/browser/connectors/connectorListItem.test.ts`
Expected: FAIL -- module not found

- [ ] **Step 3: Implement ConnectorListItemWidget**

Create `packages/ui/src/browser/connectors/connectorListItem.ts`:

```typescript
import { Emitter } from '@gho-work/base';
import type { Event, ConnectorConfig } from '@gho-work/base';
import { Widget } from '../widget.js';
import { h } from '../dom.js';

export class ConnectorListItemWidget extends Widget {
  private readonly _dotEl: HTMLElement;
  private _config: ConnectorConfig;

  private readonly _onDidClick = this._register(new Emitter<string>());
  readonly onDidClick: Event<string> = this._onDidClick.event;

  constructor(config: ConnectorConfig) {
    const layout = h('div.connector-list-item', [
      h('span.connector-status-dot@dot'),
      h('span.connector-list-item-name@name'),
    ]);
    super(layout.root);
    this._config = config;
    this._dotEl = layout.dot;
    layout.name.textContent = config.name;
    this._updateDot(config.status);

    this.element.setAttribute('tabindex', '0');
    this.element.setAttribute('role', 'button');
    this.element.setAttribute('aria-label', `${config.name}, ${config.status}`);

    this.listen(this.element, 'click', () => this._onDidClick.fire(this._config.id));
    this.listen(this.element, 'keydown', (e) => {
      const key = (e as KeyboardEvent).key;
      if (key === 'Enter' || key === ' ') {
        e.preventDefault();
        this._onDidClick.fire(this._config.id);
      }
    });
  }

  get connectorId(): string { return this._config.id; }

  updateStatus(status: ConnectorConfig['status']): void {
    this._config = { ...this._config, status };
    this._updateDot(status);
    this.element.setAttribute('aria-label', `${this._config.name}, ${status}`);
  }

  setHighlighted(active: boolean): void {
    this.element.classList.toggle('active', active);
  }

  private _updateDot(status: ConnectorConfig['status']): void {
    this._dotEl.className = `connector-status-dot status-${status}`;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/ui && npx vitest run src/browser/connectors/connectorListItem.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/browser/connectors/connectorListItem.ts packages/ui/src/browser/connectors/connectorListItem.test.ts
git commit -m "feat(ui): add ConnectorListItemWidget for sidebar connector rows"
```

---

### Task 6: Create CLIToolListItemWidget

**Files:**
- Create: `packages/ui/src/browser/connectors/cliToolListItem.ts`
- Create: `packages/ui/src/browser/connectors/cliToolListItem.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/ui/src/browser/connectors/cliToolListItem.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CLIToolListItemWidget } from './cliToolListItem.js';
import type { CLIToolInfo } from './cliToolListItem.js';

function makeTool(overrides: Partial<CLIToolInfo> = {}): CLIToolInfo {
  return {
    id: 'gh', name: 'GitHub CLI', installed: true, version: '2.40.0',
    authenticated: true, installUrl: 'https://cli.github.com', authCommand: 'gh auth login',
    ...overrides,
  };
}

describe('CLIToolListItemWidget', () => {
  beforeEach(() => { document.body.textContent = ''; });

  it('shows checkmark when installed and authenticated', () => {
    const w = new CLIToolListItemWidget(makeTool());
    document.body.appendChild(w.getDomNode());
    expect(w.getDomNode().querySelector('.cli-checkmark')).toBeTruthy();
    w.dispose();
  });

  it('shows Install button when not installed', () => {
    const w = new CLIToolListItemWidget(makeTool({ installed: false, version: undefined }));
    document.body.appendChild(w.getDomNode());
    expect(w.getDomNode().querySelector('button')?.textContent).toContain('Install');
    w.dispose();
  });

  it('shows Authenticate button when installed but not authed', () => {
    const w = new CLIToolListItemWidget(makeTool({ authenticated: false }));
    document.body.appendChild(w.getDomNode());
    expect(w.getDomNode().querySelector('button')?.textContent).toContain('Authenticate');
    w.dispose();
  });

  it('fires onDidRequestInstall on Install click', () => {
    const w = new CLIToolListItemWidget(makeTool({ installed: false }));
    document.body.appendChild(w.getDomNode());
    const fn = vi.fn();
    w.onDidRequestInstall(fn);
    w.getDomNode().querySelector('button')!.click();
    expect(fn).toHaveBeenCalledWith('gh');
    w.dispose();
  });

  it('fires onDidRequestAuth on Authenticate click', () => {
    const w = new CLIToolListItemWidget(makeTool({ authenticated: false }));
    document.body.appendChild(w.getDomNode());
    const fn = vi.fn();
    w.onDidRequestAuth(fn);
    w.getDomNode().querySelector('button')!.click();
    expect(fn).toHaveBeenCalledWith('gh');
    w.dispose();
  });

  it('update() re-renders state', () => {
    const w = new CLIToolListItemWidget(makeTool({ installed: false }));
    document.body.appendChild(w.getDomNode());
    expect(w.getDomNode().querySelector('button')?.textContent).toContain('Install');
    w.update(makeTool({ installed: true, authenticated: true }));
    expect(w.getDomNode().querySelector('.cli-checkmark')).toBeTruthy();
    w.dispose();
  });
});
```

- [ ] **Step 2: Implement CLIToolListItemWidget**

Create `packages/ui/src/browser/connectors/cliToolListItem.ts`:

```typescript
import { Emitter } from '@gho-work/base';
import type { Event } from '@gho-work/base';
import { Widget } from '../widget.js';
import { h } from '../dom.js';

export interface CLIToolInfo {
  id: string;
  name: string;
  installed: boolean;
  version?: string;
  authenticated?: boolean;
  installUrl: string;
  authCommand?: string;
}

export class CLIToolListItemWidget extends Widget {
  private _tool: CLIToolInfo;
  private readonly _actionEl: HTMLElement;
  private readonly _versionEl: HTMLElement;

  private readonly _onDidRequestInstall = this._register(new Emitter<string>());
  readonly onDidRequestInstall: Event<string> = this._onDidRequestInstall.event;

  private readonly _onDidRequestAuth = this._register(new Emitter<string>());
  readonly onDidRequestAuth: Event<string> = this._onDidRequestAuth.event;

  constructor(tool: CLIToolInfo) {
    const layout = h('div.cli-tool-list-item', [
      h('div.cli-tool-info', [
        h('span.cli-tool-name@name'),
        h('span.cli-tool-version@version'),
      ]),
      h('div.cli-tool-action@action'),
    ]);
    super(layout.root);
    this._tool = tool;
    this._actionEl = layout.action;
    this._versionEl = layout.version;
    layout.name.textContent = tool.name;
    this.element.setAttribute('tabindex', '0');
    this._renderAction();
  }

  get toolId(): string { return this._tool.id; }

  update(tool: CLIToolInfo): void {
    this._tool = tool;
    this._renderAction();
  }

  setLoading(label: string): void {
    this._clearAction();
    const spinner = document.createElement('span');
    spinner.className = 'cli-tool-spinner';
    spinner.textContent = label;
    this._actionEl.appendChild(spinner);
  }

  showCheckAgain(): void {
    this._clearAction();
    const btn = document.createElement('button');
    btn.className = 'cli-tool-btn';
    btn.textContent = 'Check Again';
    this.listen(btn, 'click', (e) => { e.stopPropagation(); this._onDidRequestInstall.fire(this._tool.id); });
    this._actionEl.appendChild(btn);
  }

  private _renderAction(): void {
    this._clearAction();
    this._versionEl.textContent = this._tool.version ?? '';

    if (this._tool.installed && this._tool.authenticated !== false) {
      const check = document.createElement('span');
      check.className = 'cli-checkmark';
      check.textContent = '\u2713';
      check.setAttribute('aria-label', 'Installed and ready');
      this._actionEl.appendChild(check);
    } else if (this._tool.installed && this._tool.authenticated === false) {
      const btn = document.createElement('button');
      btn.className = 'cli-tool-btn';
      btn.textContent = 'Authenticate';
      this.listen(btn, 'click', (e) => { e.stopPropagation(); this._onDidRequestAuth.fire(this._tool.id); });
      this._actionEl.appendChild(btn);
    } else {
      const btn = document.createElement('button');
      btn.className = 'cli-tool-btn';
      btn.textContent = 'Install';
      this.listen(btn, 'click', (e) => { e.stopPropagation(); this._onDidRequestInstall.fire(this._tool.id); });
      this._actionEl.appendChild(btn);
    }
  }

  private _clearAction(): void {
    while (this._actionEl.firstChild) { this._actionEl.removeChild(this._actionEl.firstChild); }
  }
}
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd packages/ui && npx vitest run src/browser/connectors/cliToolListItem.test.ts`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/browser/connectors/cliToolListItem.ts packages/ui/src/browser/connectors/cliToolListItem.test.ts
git commit -m "feat(ui): add CLIToolListItemWidget with install/auth buttons"
```

---

### Task 7: Create ConnectorSidebarWidget

**Files:**
- Create: `packages/ui/src/browser/connectors/connectorSidebar.ts`
- Create: `packages/ui/src/browser/connectors/connectorSidebar.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/ui/src/browser/connectors/connectorSidebar.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectorSidebarWidget } from './connectorSidebar.js';

function makeIPC(data: Record<string, unknown> = {}) {
  const listeners = new Map<string, Function>();
  return {
    invoke: vi.fn().mockImplementation((ch: string) => {
      if (ch === 'connector:list') return Promise.resolve(data.connectors ?? { connectors: [] });
      if (ch === 'cli:detect-all') return Promise.resolve(data.cliTools ?? { tools: [] });
      return Promise.resolve({});
    }),
    on: vi.fn().mockImplementation((ch: string, cb: Function) => { listeners.set(ch, cb); }),
    _fire: (ch: string, d: unknown) => listeners.get(ch)?.(d),
  };
}

describe('ConnectorSidebarWidget', () => {
  beforeEach(() => { document.body.textContent = ''; });

  it('renders three groups after activate', async () => {
    const ipc = makeIPC();
    const w = new ConnectorSidebarWidget(ipc as any);
    document.body.appendChild(w.getDomNode());
    await w.activate();
    expect(w.getDomNode().querySelector('.connector-group-installed')).toBeTruthy();
    expect(w.getDomNode().querySelector('.connector-group-cli')).toBeTruthy();
    expect(w.getDomNode().querySelector('.connector-add-btn')).toBeTruthy();
    w.dispose();
  });

  it('renders connector items from IPC data', async () => {
    const ipc = makeIPC({
      connectors: { connectors: [
        { id: '1', name: 'A', status: 'connected', type: 'local_mcp', transport: 'stdio', enabled: true },
      ]},
    });
    const w = new ConnectorSidebarWidget(ipc as any);
    document.body.appendChild(w.getDomNode());
    await w.activate();
    expect(w.getDomNode().querySelectorAll('.connector-list-item').length).toBe(1);
    w.dispose();
  });

  it('fires onDidSelectConnector when item clicked', async () => {
    const ipc = makeIPC({
      connectors: { connectors: [
        { id: 'c1', name: 'S', status: 'connected', type: 'local_mcp', transport: 'stdio', enabled: true },
      ]},
    });
    const w = new ConnectorSidebarWidget(ipc as any);
    document.body.appendChild(w.getDomNode());
    await w.activate();
    const fn = vi.fn();
    w.onDidSelectConnector(fn);
    (w.getDomNode().querySelector('.connector-list-item') as HTMLElement).click();
    expect(fn).toHaveBeenCalledWith('c1');
    w.dispose();
  });

  it('fires onDidRequestAddConnector on Add click', async () => {
    const ipc = makeIPC();
    const w = new ConnectorSidebarWidget(ipc as any);
    document.body.appendChild(w.getDomNode());
    await w.activate();
    const fn = vi.fn();
    w.onDidRequestAddConnector(fn);
    (w.getDomNode().querySelector('.connector-add-btn') as HTMLElement).click();
    expect(fn).toHaveBeenCalled();
    w.dispose();
  });

  it('shows empty state when no connectors', async () => {
    const ipc = makeIPC();
    const w = new ConnectorSidebarWidget(ipc as any);
    document.body.appendChild(w.getDomNode());
    await w.activate();
    expect(w.getDomNode().textContent).toContain('No connectors');
    w.dispose();
  });
});
```

- [ ] **Step 2: Implement ConnectorSidebarWidget**

Create `packages/ui/src/browser/connectors/connectorSidebar.ts`:

```typescript
import { Emitter } from '@gho-work/base';
import type { Event, ConnectorConfig } from '@gho-work/base';
import type { IIPCRenderer } from '@gho-work/platform/common';
import { IPC_CHANNELS } from '@gho-work/platform/common';
import { Widget } from '../widget.js';
import { h } from '../dom.js';
import { ConnectorListItemWidget } from './connectorListItem.js';
import { CLIToolListItemWidget } from './cliToolListItem.js';
import type { CLIToolInfo } from './cliToolListItem.js';

export class ConnectorSidebarWidget extends Widget {
  private readonly _installedEl: HTMLElement;
  private readonly _cliEl: HTMLElement;
  private readonly _items = new Map<string, ConnectorListItemWidget>();
  private readonly _cliItems = new Map<string, CLIToolListItemWidget>();

  private readonly _onDidSelectConnector = this._register(new Emitter<string>());
  readonly onDidSelectConnector: Event<string> = this._onDidSelectConnector.event;

  private readonly _onDidRequestAddConnector = this._register(new Emitter<void>());
  readonly onDidRequestAddConnector: Event<void> = this._onDidRequestAddConnector.event;

  private readonly _onDidRequestInstallCLI = this._register(new Emitter<string>());
  readonly onDidRequestInstallCLI: Event<string> = this._onDidRequestInstallCLI.event;

  private readonly _onDidRequestAuthCLI = this._register(new Emitter<string>());
  readonly onDidRequestAuthCLI: Event<string> = this._onDidRequestAuthCLI.event;

  constructor(private readonly _ipc: IIPCRenderer) {
    const layout = h('div.connector-sidebar', [
      h('div.connector-sidebar-header@header'),
      h('div.connector-group-installed@installed'),
      h('div.connector-group-cli@cli'),
      h('div.connector-sidebar-footer@footer'),
    ]);
    super(layout.root);
    layout.header.textContent = 'Connectors';

    this._installedEl = layout.installed;
    this._cliEl = layout.cli;

    const addBtn = document.createElement('button');
    addBtn.className = 'connector-add-btn';
    addBtn.textContent = '+ Add Connector';
    this.listen(addBtn, 'click', () => this._onDidRequestAddConnector.fire());
    layout.footer.appendChild(addBtn);

    // Listen for status push events
    this._ipc.on(IPC_CHANNELS.CONNECTOR_STATUS_CHANGED, (...args: unknown[]) => {
      const data = args[0] as { id: string; status: ConnectorConfig['status'] };
      this._items.get(data.id)?.updateStatus(data.status);
    });
  }

  async activate(): Promise<void> {
    // Show loading state
    this._installedEl.textContent = 'Loading...';
    this._cliEl.textContent = 'Loading...';
    await Promise.all([this._loadConnectors(), this._loadCLITools()]);
  }

  highlightConnector(id: string | null): void {
    for (const [cid, item] of this._items) { item.setHighlighted(cid === id); }
  }

  async refreshCLITools(): Promise<void> { await this._loadCLITools(); }
  async refreshConnectors(): Promise<void> { await this._loadConnectors(); }

  setCLIToolLoading(toolId: string, label: string): void {
    this._cliItems.get(toolId)?.setLoading(label);
  }

  showCLIToolCheckAgain(toolId: string): void {
    this._cliItems.get(toolId)?.showCheckAgain();
  }

  isCLIToolInstalled(toolId: string): boolean {
    // After refresh, check if the item shows as installed (has checkmark or auth button, not install button)
    const item = this._cliItems.get(toolId);
    if (!item) { return false; }
    return !!item.getDomNode().querySelector('.cli-checkmark') || !!item.getDomNode().querySelector('button')?.textContent?.includes('Authenticate');
  }

  private async _loadConnectors(): Promise<void> {
    try {
      const resp = await this._ipc.invoke<{ connectors: ConnectorConfig[] }>(IPC_CHANNELS.CONNECTOR_LIST);
      this._renderConnectors(resp.connectors);
    } catch (err) { console.error('Failed to load connectors:', err); }
  }

  private _renderConnectors(connectors: ConnectorConfig[]): void {
    for (const item of this._items.values()) { item.dispose(); }
    this._items.clear();
    while (this._installedEl.firstChild) { this._installedEl.removeChild(this._installedEl.firstChild); }

    const label = document.createElement('div');
    label.className = 'connector-group-label';
    label.textContent = 'Installed Connectors';
    this._installedEl.appendChild(label);

    if (connectors.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'connector-empty';
      empty.textContent = 'No connectors configured';
      this._installedEl.appendChild(empty);
      return;
    }

    for (const config of connectors) {
      const item = this._register(new ConnectorListItemWidget(config));
      item.onDidClick((id) => this._onDidSelectConnector.fire(id));
      this._items.set(config.id, item);
      this._installedEl.appendChild(item.getDomNode());
    }
  }

  private async _loadCLITools(): Promise<void> {
    try {
      const resp = await this._ipc.invoke<{ tools: CLIToolInfo[] }>(IPC_CHANNELS.CLI_DETECT_ALL);
      this._renderCLITools(resp.tools);
    } catch (err) { console.error('Failed to detect CLI tools:', err); }
  }

  private _renderCLITools(tools: CLIToolInfo[]): void {
    for (const item of this._cliItems.values()) { item.dispose(); }
    this._cliItems.clear();
    while (this._cliEl.firstChild) { this._cliEl.removeChild(this._cliEl.firstChild); }

    const label = document.createElement('div');
    label.className = 'connector-group-label';
    label.textContent = 'CLI Tools';
    this._cliEl.appendChild(label);

    for (const tool of tools) {
      const item = this._register(new CLIToolListItemWidget(tool));
      item.onDidRequestInstall((id) => this._onDidRequestInstallCLI.fire(id));
      item.onDidRequestAuth((id) => this._onDidRequestAuthCLI.fire(id));
      this._cliItems.set(tool.id, item);
      this._cliEl.appendChild(item.getDomNode());
    }
  }
}
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd packages/ui && npx vitest run src/browser/connectors/connectorSidebar.test.ts`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/browser/connectors/connectorSidebar.ts packages/ui/src/browser/connectors/connectorSidebar.test.ts
git commit -m "feat(ui): add ConnectorSidebarWidget with connector list and CLI tools"
```

---

## Chunk 3: Drawer Sub-components

### Task 8: Create StatusBannerWidget

**Files:**
- Create: `packages/ui/src/browser/connectors/connectorStatusBanner.ts`
- Create: `packages/ui/src/browser/connectors/connectorStatusBanner.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/ui/src/browser/connectors/connectorStatusBanner.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatusBannerWidget } from './connectorStatusBanner.js';

describe('StatusBannerWidget', () => {
  beforeEach(() => { document.body.textContent = ''; });

  it('is hidden when status is connected', () => {
    const w = new StatusBannerWidget();
    document.body.appendChild(w.getDomNode());
    w.update('connected');
    expect(w.getDomNode().style.display).toBe('none');
    w.dispose();
  });

  it('shows error banner with message', () => {
    const w = new StatusBannerWidget();
    document.body.appendChild(w.getDomNode());
    w.update('error', 'Connection refused');
    expect(w.getDomNode().style.display).not.toBe('none');
    expect(w.getDomNode().textContent).toContain('Connection refused');
    expect(w.getDomNode().classList.contains('banner-error')).toBe(true);
    w.dispose();
  });

  it('shows Reconnect button for error', () => {
    const w = new StatusBannerWidget();
    document.body.appendChild(w.getDomNode());
    w.update('error', 'Connection failed');
    expect(w.getDomNode().querySelector('.banner-action-btn')?.textContent).toContain('Reconnect');
    w.dispose();
  });

  it('fires onDidRequestAction on button click', () => {
    const w = new StatusBannerWidget();
    document.body.appendChild(w.getDomNode());
    w.update('error', 'fail');
    const fn = vi.fn();
    w.onDidRequestAction(fn);
    (w.getDomNode().querySelector('.banner-action-btn') as HTMLElement).click();
    expect(fn).toHaveBeenCalledWith('reconnect');
    w.dispose();
  });

  it('shows warning banner for disconnected', () => {
    const w = new StatusBannerWidget();
    document.body.appendChild(w.getDomNode());
    w.update('disconnected');
    expect(w.getDomNode().classList.contains('banner-warning')).toBe(true);
    w.dispose();
  });
});
```

- [ ] **Step 2: Implement StatusBannerWidget**

Create `packages/ui/src/browser/connectors/connectorStatusBanner.ts`:

```typescript
import { Emitter } from '@gho-work/base';
import type { Event, ConnectorConfig } from '@gho-work/base';
import { Widget } from '../widget.js';
import { h } from '../dom.js';

export type BannerAction = 'reconnect' | 'reauthenticate' | 'restart';

export class StatusBannerWidget extends Widget {
  private readonly _messageEl: HTMLElement;
  private readonly _actionsEl: HTMLElement;
  private _action: BannerAction = 'reconnect';

  private readonly _onDidRequestAction = this._register(new Emitter<BannerAction>());
  readonly onDidRequestAction: Event<BannerAction> = this._onDidRequestAction.event;

  constructor() {
    const layout = h('div.connector-status-banner', [
      h('span.banner-message@message'),
      h('div.banner-actions@actions'),
    ]);
    super(layout.root);
    this._messageEl = layout.message;
    this._actionsEl = layout.actions;
    this.element.style.display = 'none';
  }

  update(status: ConnectorConfig['status'], error?: string): void {
    if (status === 'connected') {
      this.element.style.display = 'none';
      return;
    }
    this.element.style.display = '';
    this.element.className = 'connector-status-banner';

    if (status === 'error') {
      this.element.classList.add('banner-error');
      this._messageEl.textContent = error ?? 'An error occurred';
      const errLower = error?.toLowerCase() ?? '';
      if (errLower.includes('auth')) { this._action = 'reauthenticate'; }
      else if (errLower.includes('crash') || errLower.includes('exit')) { this._action = 'restart'; }
      else { this._action = 'reconnect'; }
    } else {
      this.element.classList.add('banner-warning');
      this._messageEl.textContent = error ?? (status === 'disconnected' ? 'Disconnected' : 'Connecting...');
      this._action = 'reconnect';
    }

    while (this._actionsEl.firstChild) { this._actionsEl.removeChild(this._actionsEl.firstChild); }
    const btn = document.createElement('button');
    btn.className = 'banner-action-btn';
    const labels: Record<BannerAction, string> = { reconnect: 'Reconnect', reauthenticate: 'Re-authenticate', restart: 'Restart' };
    btn.textContent = labels[this._action];
    this.listen(btn, 'click', () => this._onDidRequestAction.fire(this._action));
    this._actionsEl.appendChild(btn);
  }
}
```

- [ ] **Step 3: Run tests, verify pass, commit**

Run: `cd packages/ui && npx vitest run src/browser/connectors/connectorStatusBanner.test.ts`

```bash
git add packages/ui/src/browser/connectors/connectorStatusBanner.ts packages/ui/src/browser/connectors/connectorStatusBanner.test.ts
git commit -m "feat(ui): add StatusBannerWidget for connector error display"
```

---

### Task 9: Create ToolListSectionWidget

**Files:**
- Create: `packages/ui/src/browser/connectors/toolListSection.ts`
- Create: `packages/ui/src/browser/connectors/toolListSection.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/ui/src/browser/connectors/toolListSection.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolListSectionWidget } from './toolListSection.js';

const TOOLS_A = [
  { name: 'echo', description: 'Echo a message', enabled: true },
  { name: 'add', description: 'Add two numbers', enabled: false },
];
const TOOLS_B = [
  { name: 'search', description: 'Search files', enabled: true },
];

describe('ToolListSectionWidget', () => {
  beforeEach(() => { document.body.textContent = ''; });

  it('renders tools grouped by connector', () => {
    const w = new ToolListSectionWidget();
    document.body.appendChild(w.getDomNode());
    w.setTools([
      { connectorId: 'c1', connectorName: 'A', tools: TOOLS_A },
      { connectorId: 'c2', connectorName: 'B', tools: TOOLS_B },
    ]);
    expect(w.getDomNode().querySelectorAll('.tool-group').length).toBe(2);
    expect(w.getDomNode().querySelectorAll('input[type="checkbox"]').length).toBe(3);
    w.dispose();
  });

  it('checkbox state matches enabled', () => {
    const w = new ToolListSectionWidget();
    document.body.appendChild(w.getDomNode());
    w.setTools([{ connectorId: 'c1', connectorName: 'A', tools: TOOLS_A }]);
    const cbs = w.getDomNode().querySelectorAll('input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
    expect(cbs[0].checked).toBe(true);
    expect(cbs[1].checked).toBe(false);
    w.dispose();
  });

  it('fires onDidToggleTool on checkbox change', () => {
    const w = new ToolListSectionWidget();
    document.body.appendChild(w.getDomNode());
    w.setTools([{ connectorId: 'c1', connectorName: 'A', tools: TOOLS_A }]);
    const fn = vi.fn();
    w.onDidToggleTool(fn);
    (w.getDomNode().querySelector('input[type="checkbox"]') as HTMLInputElement).click();
    expect(fn).toHaveBeenCalledWith({ connectorId: 'c1', toolName: 'echo', enabled: false });
    w.dispose();
  });

  it('filters by search text', () => {
    const w = new ToolListSectionWidget();
    document.body.appendChild(w.getDomNode());
    w.setTools([{ connectorId: 'c1', connectorName: 'A', tools: TOOLS_A }]);
    const input = w.getDomNode().querySelector('.tool-search-input') as HTMLInputElement;
    input.value = 'echo';
    input.dispatchEvent(new Event('input'));
    const visible = w.getDomNode().querySelectorAll('.tool-row:not([style*="display: none"])');
    expect(visible.length).toBe(1);
    w.dispose();
  });

  it('focuses connector group, collapses others', () => {
    const w = new ToolListSectionWidget();
    document.body.appendChild(w.getDomNode());
    w.setTools([
      { connectorId: 'c1', connectorName: 'A', tools: TOOLS_A },
      { connectorId: 'c2', connectorName: 'B', tools: TOOLS_B },
    ], 'c1');
    const groups = w.getDomNode().querySelectorAll('.tool-group');
    expect(groups[0].querySelector('.tool-group-body')?.getAttribute('style')).not.toContain('display: none');
    expect(groups[1].querySelector('.tool-group-body')?.getAttribute('style')).toContain('display: none');
    w.dispose();
  });

  it('shows empty state when no tools', () => {
    const w = new ToolListSectionWidget();
    document.body.appendChild(w.getDomNode());
    w.setTools([]);
    expect(w.getDomNode().textContent).toContain('No tools available');
    w.dispose();
  });
});
```

- [ ] **Step 2: Implement ToolListSectionWidget**

Create `packages/ui/src/browser/connectors/toolListSection.ts`:

```typescript
import { Emitter } from '@gho-work/base';
import type { Event } from '@gho-work/base';
import { Widget } from '../widget.js';
import { h } from '../dom.js';

export interface ToolInfo {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  enabled: boolean;
}

export interface ToolGroup {
  connectorId: string;
  connectorName: string;
  tools: ToolInfo[];
}

export interface ToolToggleEvent {
  connectorId: string;
  toolName: string;
  enabled: boolean;
}

export class ToolListSectionWidget extends Widget {
  private readonly _bodyEl: HTMLElement;
  private readonly _searchInput: HTMLInputElement;

  private readonly _onDidToggleTool = this._register(new Emitter<ToolToggleEvent>());
  readonly onDidToggleTool: Event<ToolToggleEvent> = this._onDidToggleTool.event;

  constructor() {
    const layout = h('div.tool-list-section', [
      h('div.tool-list-header@header'),
      h('div.tool-list-body@body'),
    ]);
    super(layout.root);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tool-search-input';
    input.placeholder = 'Filter tools...';
    input.setAttribute('aria-label', 'Filter tools');
    layout.header.appendChild(input);
    this._searchInput = input;
    this._bodyEl = layout.body;

    this.listen(input, 'input', () => this._applyFilter());
  }

  setTools(groups: ToolGroup[], focusConnectorId?: string): void {
    while (this._bodyEl.firstChild) { this._bodyEl.removeChild(this._bodyEl.firstChild); }

    if (groups.length === 0 || groups.every(g => g.tools.length === 0)) {
      const empty = document.createElement('div');
      empty.className = 'tool-list-empty';
      empty.textContent = 'No tools available \u2014 connect a connector to see its tools';
      this._bodyEl.appendChild(empty);
      return;
    }

    for (const group of groups) {
      const groupEl = document.createElement('div');
      groupEl.className = 'tool-group';
      groupEl.dataset.connectorId = group.connectorId;

      const headerBtn = document.createElement('button');
      headerBtn.className = 'tool-group-header';
      headerBtn.textContent = `${group.connectorName} (${group.tools.length})`;
      const expanded = focusConnectorId ? group.connectorId === focusConnectorId : true;
      headerBtn.setAttribute('aria-expanded', String(expanded));

      const bodyEl = document.createElement('div');
      bodyEl.className = 'tool-group-body';
      bodyEl.style.display = expanded ? '' : 'none';

      this.listen(headerBtn, 'click', () => {
        const isExp = headerBtn.getAttribute('aria-expanded') === 'true';
        headerBtn.setAttribute('aria-expanded', String(!isExp));
        bodyEl.style.display = isExp ? 'none' : '';
      });
      groupEl.appendChild(headerBtn);

      for (const tool of group.tools) {
        const row = document.createElement('div');
        row.className = 'tool-row';
        row.dataset.toolName = tool.name;
        row.dataset.searchText = `${tool.name} ${tool.description}`.toLowerCase();

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = tool.enabled;
        cb.id = `tool-${group.connectorId}-${tool.name}`;

        const label = document.createElement('label');
        label.htmlFor = cb.id;
        const nameSpan = document.createElement('span');
        nameSpan.className = 'tool-name';
        nameSpan.textContent = tool.name;
        label.appendChild(nameSpan);
        const descSpan = document.createElement('span');
        descSpan.className = 'tool-description';
        descSpan.textContent = tool.description;
        descSpan.title = tool.description;
        label.appendChild(descSpan);

        this.listen(cb, 'change', () => {
          this._onDidToggleTool.fire({ connectorId: group.connectorId, toolName: tool.name, enabled: cb.checked });
        });

        row.appendChild(cb);
        row.appendChild(label);
        bodyEl.appendChild(row);
      }
      groupEl.appendChild(bodyEl);
      this._bodyEl.appendChild(groupEl);
    }
  }

  revertToolToggle(connectorId: string, toolName: string, enabled: boolean): void {
    const row = this._bodyEl.querySelector(
      `.tool-group[data-connector-id="${connectorId}"] .tool-row[data-tool-name="${toolName}"]`
    ) as HTMLElement | null;
    const cb = row?.querySelector('input') as HTMLInputElement | null;
    if (cb) { cb.checked = enabled; }
    // Show brief inline error
    if (row) {
      const err = document.createElement('span');
      err.className = 'tool-toggle-error';
      err.textContent = 'Failed to update';
      row.appendChild(err);
      setTimeout(() => err.remove(), 3000);
    }
  }

  private _applyFilter(): void {
    const q = this._searchInput.value.toLowerCase().trim();
    for (const row of this._bodyEl.querySelectorAll('.tool-row') as NodeListOf<HTMLElement>) {
      row.style.display = !q || (row.dataset.searchText ?? '').includes(q) ? '' : 'none';
    }
  }
}
```

- [ ] **Step 3: Run tests, verify pass, commit**

Run: `cd packages/ui && npx vitest run src/browser/connectors/toolListSection.test.ts`

```bash
git add packages/ui/src/browser/connectors/toolListSection.ts packages/ui/src/browser/connectors/toolListSection.test.ts
git commit -m "feat(ui): add ToolListSectionWidget with grouped tools and search filter"
```

---

### Task 10: Create ConnectorConfigFormWidget

**Files:**
- Create: `packages/ui/src/browser/connectors/connectorConfigForm.ts`
- Create: `packages/ui/src/browser/connectors/connectorConfigForm.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/ui/src/browser/connectors/connectorConfigForm.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectorConfigFormWidget } from './connectorConfigForm.js';
import type { ConnectorConfig } from '@gho-work/base';

function makeConfig(o: Partial<ConnectorConfig> = {}): ConnectorConfig {
  return { id: 't1', type: 'local_mcp', name: 'Test', transport: 'stdio', command: 'node', args: ['s.js'], enabled: true, status: 'connected', ...o };
}

describe('ConnectorConfigFormWidget', () => {
  beforeEach(() => { document.body.textContent = ''; });

  it('renders read-only for existing connector', () => {
    const w = new ConnectorConfigFormWidget(makeConfig());
    document.body.appendChild(w.getDomNode());
    expect(w.getDomNode().textContent).toContain('Test');
    expect(w.getDomNode().querySelector('.config-edit-btn')).toBeTruthy();
    w.dispose();
  });

  it('renders edit mode for null (new connector)', () => {
    const w = new ConnectorConfigFormWidget(null);
    document.body.appendChild(w.getDomNode());
    expect(w.getDomNode().querySelector('.config-name-input')).toBeTruthy();
    w.dispose();
  });

  it('fires onDidSave with form data', () => {
    const w = new ConnectorConfigFormWidget(null);
    document.body.appendChild(w.getDomNode());
    const fn = vi.fn();
    w.onDidSave(fn);
    (w.getDomNode().querySelector('.config-name-input') as HTMLInputElement).value = 'My Server';
    (w.getDomNode().querySelector('.config-command-input') as HTMLInputElement).value = 'npx srv';
    (w.getDomNode().querySelector('.config-save-btn') as HTMLElement).click();
    expect(fn).toHaveBeenCalled();
    expect(fn.mock.calls[0][0].name).toBe('My Server');
    w.dispose();
  });

  it('fires onDidCancel on Cancel click', () => {
    const w = new ConnectorConfigFormWidget(null);
    document.body.appendChild(w.getDomNode());
    const fn = vi.fn();
    w.onDidCancel(fn);
    (w.getDomNode().querySelector('.config-cancel-btn') as HTMLElement).click();
    expect(fn).toHaveBeenCalled();
    w.dispose();
  });

  it('fires onDidDelete on Remove click (edit mode)', () => {
    const w = new ConnectorConfigFormWidget(makeConfig());
    document.body.appendChild(w.getDomNode());
    (w.getDomNode().querySelector('.config-edit-btn') as HTMLElement).click();
    const fn = vi.fn();
    w.onDidDelete(fn);
    (w.getDomNode().querySelector('.config-delete-btn') as HTMLElement).click();
    expect(fn).toHaveBeenCalledWith('t1');
    w.dispose();
  });

  it('toggles advanced section', () => {
    const w = new ConnectorConfigFormWidget(null);
    document.body.appendChild(w.getDomNode());
    (w.getDomNode().querySelector('.config-advanced-toggle') as HTMLElement).click();
    expect(w.getDomNode().querySelector('.config-advanced')?.getAttribute('style')).not.toContain('display: none');
    w.dispose();
  });

  it('switches fields for HTTP transport', () => {
    const w = new ConnectorConfigFormWidget(null);
    document.body.appendChild(w.getDomNode());
    (w.getDomNode().querySelector('input[value="streamable_http"]') as HTMLInputElement).click();
    expect(w.getDomNode().querySelector('.config-url-input')).toBeTruthy();
    w.dispose();
  });
});
```

- [ ] **Step 2: Implement ConnectorConfigFormWidget**

Create `packages/ui/src/browser/connectors/connectorConfigForm.ts`:

```typescript
import { Emitter, generateUUID } from '@gho-work/base';
import type { Event, ConnectorConfig } from '@gho-work/base';
import { Widget } from '../widget.js';

export interface ConnectorFormData {
  id: string;
  name: string;
  transport: 'stdio' | 'streamable_http';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
}

export class ConnectorConfigFormWidget extends Widget {
  private _config: ConnectorConfig | null;
  private _editing: boolean;
  private _transport: 'stdio' | 'streamable_http' = 'stdio';

  private readonly _onDidSave = this._register(new Emitter<ConnectorFormData>());
  readonly onDidSave: Event<ConnectorFormData> = this._onDidSave.event;
  private readonly _onDidCancel = this._register(new Emitter<void>());
  readonly onDidCancel: Event<void> = this._onDidCancel.event;
  private readonly _onDidDelete = this._register(new Emitter<string>());
  readonly onDidDelete: Event<string> = this._onDidDelete.event;

  constructor(config: ConnectorConfig | null) {
    const el = document.createElement('div');
    el.className = 'connector-config-form';
    super(el);
    this._config = config;
    this._editing = config === null;
    if (config) { this._transport = config.transport; }
    this._render();
  }

  private _render(): void {
    while (this.element.firstChild) { this.element.removeChild(this.element.firstChild); }
    if (this._config && !this._editing) { this._renderReadOnly(); }
    else { this._renderEdit(); }
  }

  private _renderReadOnly(): void {
    const c = this._config!;
    const fields = [
      ['Name', c.name],
      ['Transport', c.transport === 'stdio' ? 'stdio' : 'HTTP'],
      [c.transport === 'stdio' ? 'Command' : 'URL', (c.transport === 'stdio' ? c.command : c.url) ?? ''],
    ];
    for (const [label, value] of fields) {
      const row = document.createElement('div');
      row.className = 'config-field-readonly';
      const lbl = document.createElement('span');
      lbl.className = 'config-field-label';
      lbl.textContent = label;
      row.appendChild(lbl);
      const val = document.createElement('span');
      val.className = 'config-field-value';
      val.textContent = value;
      row.appendChild(val);
      this.element.appendChild(row);
    }
    const editBtn = document.createElement('button');
    editBtn.className = 'config-edit-btn';
    editBtn.textContent = 'Edit';
    this.listen(editBtn, 'click', () => { this._editing = true; this._render(); });
    this.element.appendChild(editBtn);
  }

  private _renderEdit(): void {
    const form = document.createElement('div');
    form.className = 'config-edit';

    // Name
    this._addLabel(form, 'Name');
    const nameInput = this._addInput(form, 'config-name-input', this._config?.name ?? '', 'Connector name');

    // Transport
    this._addLabel(form, 'Transport');
    const tGroup = document.createElement('div');
    tGroup.className = 'config-transport-group';
    for (const t of ['stdio', 'streamable_http'] as const) {
      const radio = document.createElement('input');
      radio.type = 'radio'; radio.name = 'transport'; radio.value = t;
      radio.checked = this._transport === t;
      const label = document.createElement('label');
      label.textContent = t === 'stdio' ? ' stdio' : ' HTTP';
      label.prepend(radio);
      this.listen(radio, 'change', () => { this._transport = t; this._render(); });
      tGroup.appendChild(label);
    }
    form.appendChild(tGroup);

    // Transport fields
    if (this._transport === 'stdio') {
      this._addLabel(form, 'Command');
      this._addInput(form, 'config-command-input', this._config?.command ?? '', 'e.g. npx my-server');
      this._addLabel(form, 'Args (comma-separated)');
      this._addInput(form, 'config-args-input', this._config?.args?.join(', ') ?? '');
    } else {
      this._addLabel(form, 'URL');
      this._addInput(form, 'config-url-input', this._config?.url ?? '', 'https://example.com/mcp');
    }

    // Advanced
    const advToggle = document.createElement('button');
    advToggle.className = 'config-advanced-toggle';
    advToggle.textContent = 'Advanced \u25B6';
    const advSection = document.createElement('div');
    advSection.className = 'config-advanced';
    advSection.style.display = 'none';
    this.listen(advToggle, 'click', () => {
      const hidden = advSection.style.display === 'none';
      advSection.style.display = hidden ? '' : 'none';
      advToggle.textContent = hidden ? 'Advanced \u25BC' : 'Advanced \u25B6';
    });
    form.appendChild(advToggle);

    this._addLabel(advSection, 'Environment Variables (KEY=VALUE per line)');
    const envInput = document.createElement('textarea');
    envInput.className = 'config-env-input'; envInput.rows = 3;
    if (this._config?.env) { envInput.value = Object.entries(this._config.env).map(([k,v]) => `${k}=${v}`).join('\n'); }
    advSection.appendChild(envInput);

    if (this._transport === 'streamable_http') {
      this._addLabel(advSection, 'Headers (KEY: VALUE per line)');
      const hInput = document.createElement('textarea');
      hInput.className = 'config-headers-input'; hInput.rows = 3;
      if (this._config?.headers) { hInput.value = Object.entries(this._config.headers).map(([k,v]) => `${k}: ${v}`).join('\n'); }
      advSection.appendChild(hInput);
    }
    form.appendChild(advSection);

    // Buttons
    const btnGroup = document.createElement('div');
    btnGroup.className = 'config-btn-group';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'config-save-btn';
    saveBtn.textContent = this._config ? 'Save' : 'Add Connector';
    this.listen(saveBtn, 'click', () => this._handleSave());
    btnGroup.appendChild(saveBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'config-cancel-btn';
    cancelBtn.textContent = 'Cancel';
    this.listen(cancelBtn, 'click', () => {
      if (this._config) { this._editing = false; this._render(); }
      this._onDidCancel.fire();
    });
    btnGroup.appendChild(cancelBtn);

    if (this._config) {
      const delBtn = document.createElement('button');
      delBtn.className = 'config-delete-btn';
      delBtn.textContent = 'Remove Connector';
      this.listen(delBtn, 'click', () => {
        if (confirm(`Remove connector "${this._config!.name}"? This cannot be undone.`)) {
          this._onDidDelete.fire(this._config!.id);
        }
      });
      btnGroup.appendChild(delBtn);
    }
    form.appendChild(btnGroup);
    this.element.appendChild(form);
  }

  private _handleSave(): void {
    const nameEl = this.element.querySelector('.config-name-input') as HTMLInputElement;
    const name = nameEl?.value.trim();
    if (!name) { nameEl?.focus(); return; }

    const data: ConnectorFormData = { id: this._config?.id ?? generateUUID(), name, transport: this._transport };

    if (this._transport === 'stdio') {
      const cmdEl = this.element.querySelector('.config-command-input') as HTMLInputElement;
      data.command = cmdEl?.value.trim();
      if (!data.command) { cmdEl?.focus(); return; }
      const argsVal = (this.element.querySelector('.config-args-input') as HTMLInputElement)?.value.trim();
      if (argsVal) { data.args = argsVal.split(',').map(s => s.trim()).filter(Boolean); }
    } else {
      const urlEl = this.element.querySelector('.config-url-input') as HTMLInputElement;
      data.url = urlEl?.value.trim();
      if (!data.url) { urlEl?.focus(); return; }
    }

    const envVal = (this.element.querySelector('.config-env-input') as HTMLTextAreaElement)?.value.trim();
    if (envVal) {
      data.env = {};
      for (const line of envVal.split('\n')) {
        const eq = line.indexOf('=');
        if (eq > 0) { data.env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim(); }
      }
    }

    const headersVal = (this.element.querySelector('.config-headers-input') as HTMLTextAreaElement)?.value.trim();
    if (headersVal) {
      data.headers = {};
      for (const line of headersVal.split('\n')) {
        const colon = line.indexOf(':');
        if (colon > 0) { data.headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim(); }
      }
    }

    this._onDidSave.fire(data);
  }

  private _addLabel(parent: HTMLElement, text: string): void {
    const label = document.createElement('label');
    label.className = 'config-label';
    label.textContent = text;
    parent.appendChild(label);
  }

  private _addInput(parent: HTMLElement, cls: string, value: string, placeholder?: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text'; input.className = cls; input.value = value;
    if (placeholder) { input.placeholder = placeholder; }
    parent.appendChild(input);
    return input;
  }
}
```

- [ ] **Step 3: Run tests, verify pass, commit**

Run: `cd packages/ui && npx vitest run src/browser/connectors/connectorConfigForm.test.ts`

```bash
git add packages/ui/src/browser/connectors/connectorConfigForm.ts packages/ui/src/browser/connectors/connectorConfigForm.test.ts
git commit -m "feat(ui): add ConnectorConfigFormWidget with add/edit/delete forms"
```

---

## Chunk 4: Drawer + Wiring + CSS + E2E

### Task 11: Create ConnectorDrawerWidget

**Files:**
- Create: `packages/ui/src/browser/connectors/connectorDrawer.ts`
- Create: `packages/ui/src/browser/connectors/connectorDrawer.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/ui/src/browser/connectors/connectorDrawer.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectorDrawerWidget } from './connectorDrawer.js';

function makeIPC() {
  return {
    invoke: vi.fn().mockResolvedValue({ connectors: [], tools: [] }),
    on: vi.fn(),
  };
}

describe('ConnectorDrawerWidget', () => {
  beforeEach(() => { document.body.textContent = ''; });

  it('is hidden by default', () => {
    const w = new ConnectorDrawerWidget(makeIPC() as any);
    document.body.appendChild(w.getDomNode());
    expect(w.getDomNode().classList.contains('drawer-open')).toBe(false);
    w.dispose();
  });

  it('shows when openForConnector called', async () => {
    const ipc = makeIPC();
    ipc.invoke.mockImplementation((ch: string) => {
      if (ch === 'connector:list') return Promise.resolve({ connectors: [{ id: 'c1', name: 'S', status: 'connected', transport: 'stdio', command: 'x', type: 'local_mcp', enabled: true }] });
      if (ch === 'connector:get-tools') return Promise.resolve({ tools: [] });
      return Promise.resolve({});
    });
    const w = new ConnectorDrawerWidget(ipc as any);
    document.body.appendChild(w.getDomNode());
    await w.openForConnector('c1');
    expect(w.getDomNode().classList.contains('drawer-open')).toBe(true);
    w.dispose();
  });

  it('shows when openForNew called', () => {
    const w = new ConnectorDrawerWidget(makeIPC() as any);
    document.body.appendChild(w.getDomNode());
    w.openForNew();
    expect(w.getDomNode().classList.contains('drawer-open')).toBe(true);
    expect(w.getDomNode().querySelector('.config-name-input')).toBeTruthy();
    w.dispose();
  });

  it('closes and fires event on close', () => {
    const w = new ConnectorDrawerWidget(makeIPC() as any);
    document.body.appendChild(w.getDomNode());
    w.openForNew();
    const fn = vi.fn();
    w.onDidClose(fn);
    w.close();
    expect(w.getDomNode().classList.contains('drawer-open')).toBe(false);
    expect(fn).toHaveBeenCalled();
    w.dispose();
  });

  it('has aria-modal and role=dialog', () => {
    const w = new ConnectorDrawerWidget(makeIPC() as any);
    document.body.appendChild(w.getDomNode());
    const drawer = w.getDomNode().querySelector('.connector-drawer-panel');
    expect(drawer?.getAttribute('role')).toBe('dialog');
    expect(drawer?.getAttribute('aria-modal')).toBe('true');
    w.dispose();
  });
});
```

- [ ] **Step 2: Implement ConnectorDrawerWidget**

Create `packages/ui/src/browser/connectors/connectorDrawer.ts`:

```typescript
import { Emitter, DisposableStore } from '@gho-work/base';
import type { Event, ConnectorConfig } from '@gho-work/base';
import type { IIPCRenderer } from '@gho-work/platform/common';
import { IPC_CHANNELS } from '@gho-work/platform/common';
import { Widget } from '../widget.js';
import { h } from '../dom.js';
import { StatusBannerWidget } from './connectorStatusBanner.js';
import { ToolListSectionWidget } from './toolListSection.js';
import type { ToolGroup, ToolToggleEvent } from './toolListSection.js';
import { ConnectorConfigFormWidget } from './connectorConfigForm.js';
import type { ConnectorFormData } from './connectorConfigForm.js';

export class ConnectorDrawerWidget extends Widget {
  private readonly _backdropEl: HTMLElement;
  private readonly _panelEl: HTMLElement;
  private readonly _headerTitleEl: HTMLElement;
  private readonly _bodyEl: HTMLElement;
  private readonly _closeBtnEl: HTMLElement;

  private readonly _contentStore = this._register(new DisposableStore());
  private _banner: StatusBannerWidget | null = null;
  private _toolList: ToolListSectionWidget | null = null;
  private _configForm: ConnectorConfigFormWidget | null = null;
  private _currentConnectorId: string | null = null;
  private _triggerElement: HTMLElement | null = null;

  private readonly _onDidClose = this._register(new Emitter<void>());
  readonly onDidClose: Event<void> = this._onDidClose.event;

  private readonly _onDidSaveConnector = this._register(new Emitter<ConnectorFormData>());
  readonly onDidSaveConnector: Event<ConnectorFormData> = this._onDidSaveConnector.event;

  private readonly _onDidDeleteConnector = this._register(new Emitter<string>());
  readonly onDidDeleteConnector: Event<string> = this._onDidDeleteConnector.event;

  constructor(private readonly _ipc: IIPCRenderer) {
    const layout = h('div.connector-drawer-container', [
      h('div.connector-drawer-backdrop@backdrop'),
      h('div.connector-drawer-panel@panel', [
        h('div.connector-drawer-header@header', [
          h('span.connector-drawer-title@title'),
          h('button.connector-drawer-close@closeBtn'),
        ]),
        h('div.connector-drawer-body@body'),
      ]),
    ]);
    super(layout.root);
    this._backdropEl = layout.backdrop;
    this._panelEl = layout.panel;
    this._headerTitleEl = layout.title;
    this._bodyEl = layout.body;
    this._closeBtnEl = layout.closeBtn;

    this._closeBtnEl.textContent = '\u00D7';
    this._closeBtnEl.setAttribute('aria-label', 'Close drawer');
    this._panelEl.setAttribute('role', 'dialog');
    this._panelEl.setAttribute('aria-modal', 'true');
    this._panelEl.setAttribute('aria-labelledby', 'drawer-title');
    this._headerTitleEl.id = 'drawer-title';

    this.listen(this._backdropEl, 'click', () => this.close());
    this.listen(this._closeBtnEl, 'click', () => this.close());
    this.listen(this.element, 'keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Escape') { this.close(); }
    });

    // Focus trap (registered once, always active when drawer is open)
    this.listen(this._panelEl, 'keydown', (e) => {
      const ke = e as KeyboardEvent;
      if (ke.key !== 'Tab') { return; }
      const focusable = this._panelEl.querySelectorAll('button, input, textarea, [tabindex]:not([tabindex="-1"])') as NodeListOf<HTMLElement>;
      if (focusable.length === 0) { return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (ke.shiftKey && document.activeElement === first) {
        ke.preventDefault(); last.focus();
      } else if (!ke.shiftKey && document.activeElement === last) {
        ke.preventDefault(); first.focus();
      }
    });

    // Listen for status changes to update banner
    this._ipc.on(IPC_CHANNELS.CONNECTOR_STATUS_CHANGED, (...args: unknown[]) => {
      const data = args[0] as { id: string; status: ConnectorConfig['status']; error?: string };
      if (data.id === this._currentConnectorId && this._banner) {
        this._banner.update(data.status, data.error);
      }
    });
  }

  async openForConnector(connectorId: string): Promise<void> {
    this._currentConnectorId = connectorId;
    this._triggerElement = document.activeElement as HTMLElement | null;
    this._clearBody();

    // Load connector data
    const listResp = await this._ipc.invoke<{ connectors: ConnectorConfig[] }>(IPC_CHANNELS.CONNECTOR_LIST);
    const connector = listResp.connectors.find(c => c.id === connectorId);
    if (!connector) { return; }

    this._headerTitleEl.textContent = connector.name;

    // Status banner
    this._banner = this._contentStore.add(new StatusBannerWidget());
    this._banner.update(connector.status, connector.error);
    this._banner.onDidRequestAction(async (action) => {
      if (action === 'reconnect' || action === 'restart') {
        await this._ipc.invoke(IPC_CHANNELS.CONNECTOR_TEST, { id: connectorId });
      } else if (action === 'reauthenticate') {
        await this._ipc.invoke(IPC_CHANNELS.CONNECTOR_UPDATE, { id: connectorId, updates: { enabled: true } });
      }
    });
    this._bodyEl.appendChild(this._banner.getDomNode());

    // Connected status line with Disconnect and Test buttons
    const statusLine = document.createElement('div');
    statusLine.className = 'drawer-status-line';
    const dot = document.createElement('span');
    dot.className = `connector-status-dot status-${connector.status}`;
    statusLine.appendChild(dot);
    const text = document.createElement('span');
    text.textContent = connector.status === 'connected' ? 'Connected' : connector.status;
    statusLine.appendChild(text);

    const statusBtns = document.createElement('div');
    statusBtns.className = 'drawer-status-btns';
    if (connector.status === 'connected') {
      const disconnBtn = document.createElement('button');
      disconnBtn.className = 'drawer-status-btn';
      disconnBtn.textContent = 'Disconnect';
      this.listen(disconnBtn, 'click', async () => {
        await this._ipc.invoke(IPC_CHANNELS.CONNECTOR_UPDATE, { id: connectorId, updates: { enabled: false } });
      });
      statusBtns.appendChild(disconnBtn);
    } else {
      const connBtn = document.createElement('button');
      connBtn.className = 'drawer-status-btn';
      connBtn.textContent = 'Connect';
      this.listen(connBtn, 'click', async () => {
        await this._ipc.invoke(IPC_CHANNELS.CONNECTOR_UPDATE, { id: connectorId, updates: { enabled: true } });
      });
      statusBtns.appendChild(connBtn);
    }
    const testBtn = document.createElement('button');
    testBtn.className = 'drawer-status-btn';
    testBtn.textContent = 'Test Connection';
    this.listen(testBtn, 'click', async () => {
      await this._ipc.invoke(IPC_CHANNELS.CONNECTOR_TEST, { id: connectorId });
    });
    statusBtns.appendChild(testBtn);
    statusLine.appendChild(statusBtns);
    this._bodyEl.appendChild(statusLine);

    // Tool list (show loading, then populate)
    this._toolList = this._contentStore.add(new ToolListSectionWidget());
    const loadingEl = document.createElement('div');
    loadingEl.className = 'tool-list-loading';
    loadingEl.textContent = 'Loading tools...';
    this._bodyEl.appendChild(loadingEl);
    await this._loadTools(connectorId);
    loadingEl.remove();
    this._toolList.onDidToggleTool((ev) => this._handleToolToggle(ev));
    this._bodyEl.appendChild(this._toolList.getDomNode());

    // Config form (read-only)
    this._configForm = this._contentStore.add(new ConnectorConfigFormWidget(connector));
    this._configForm.onDidSave((data) => this._onDidSaveConnector.fire(data));
    this._configForm.onDidDelete((id) => this._onDidDeleteConnector.fire(id));
    this._configForm.onDidCancel(() => {});
    this._bodyEl.appendChild(this._configForm.getDomNode());

    this._show();
  }

  openForNew(): void {
    this._currentConnectorId = null;
    this._triggerElement = document.activeElement as HTMLElement | null;
    this._clearBody();
    this._headerTitleEl.textContent = 'Add Connector';

    this._configForm = this._contentStore.add(new ConnectorConfigFormWidget(null));
    this._configForm.onDidSave((data) => this._onDidSaveConnector.fire(data));
    this._configForm.onDidCancel(() => this.close());
    this._bodyEl.appendChild(this._configForm.getDomNode());

    this._show();
  }

  close(): void {
    this.element.classList.remove('drawer-open');
    this._currentConnectorId = null;
    this._onDidClose.fire();
    if (this._triggerElement) {
      this._triggerElement.focus();
      this._triggerElement = null;
    }
  }

  private _show(): void {
    this.element.classList.add('drawer-open');
    // Focus first focusable element in drawer
    const firstFocusable = this._panelEl.querySelector('button, input, [tabindex]') as HTMLElement | null;
    firstFocusable?.focus();
  }

  private async _loadTools(focusConnectorId: string): Promise<void> {
    if (!this._toolList) { return; }
    try {
      const listResp = await this._ipc.invoke<{ connectors: ConnectorConfig[] }>(IPC_CHANNELS.CONNECTOR_LIST);
      const groups: ToolGroup[] = [];
      for (const c of listResp.connectors) {
        if (c.status !== 'connected') { continue; }
        try {
          const toolResp = await this._ipc.invoke<{ tools: Array<{ name: string; description: string; enabled: boolean }> }>(
            IPC_CHANNELS.CONNECTOR_GET_TOOLS, { id: c.id }
          );
          groups.push({ connectorId: c.id, connectorName: c.name, tools: toolResp.tools });
        } catch { /* skip */ }
      }
      this._toolList.setTools(groups, focusConnectorId);
    } catch (err) { console.error('Failed to load tools:', err); }
  }

  private async _handleToolToggle(ev: ToolToggleEvent): Promise<void> {
    try {
      // Build updated toolsConfig
      const listResp = await this._ipc.invoke<{ connectors: ConnectorConfig[] }>(IPC_CHANNELS.CONNECTOR_LIST);
      const connector = listResp.connectors.find(c => c.id === ev.connectorId);
      const toolsConfig = { ...(connector?.toolsConfig ?? {}), [ev.toolName]: ev.enabled };
      await this._ipc.invoke(IPC_CHANNELS.CONNECTOR_UPDATE, { id: ev.connectorId, updates: { toolsConfig } });
    } catch {
      // Revert on failure
      this._toolList?.revertToolToggle(ev.connectorId, ev.toolName, !ev.enabled);
    }
  }

  private _clearBody(): void {
    this._contentStore.clear();
    this._banner = null;
    this._toolList = null;
    this._configForm = null;
    while (this._bodyEl.firstChild) { this._bodyEl.removeChild(this._bodyEl.firstChild); }
  }
}
```

- [ ] **Step 3: Run tests, verify pass, commit**

Run: `cd packages/ui && npx vitest run src/browser/connectors/connectorDrawer.test.ts`

```bash
git add packages/ui/src/browser/connectors/connectorDrawer.ts packages/ui/src/browser/connectors/connectorDrawer.test.ts
git commit -m "feat(ui): add ConnectorDrawerWidget slide-over panel"
```

---

### Task 12: Wire sidebar + drawer into Workbench

**Files:**
- Modify: `packages/ui/src/browser/workbench.ts`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Add ConnectorSidebarWidget and ConnectorDrawerWidget to Workbench**

In `packages/ui/src/browser/workbench.ts`, add imports:

```typescript
import { ConnectorSidebarWidget } from './connectors/connectorSidebar.js';
import { ConnectorDrawerWidget } from './connectors/connectorDrawer.js';
```

Add fields:

```typescript
private _connectorSidebar!: ConnectorSidebarWidget;
private _connectorDrawer!: ConnectorDrawerWidget;
```

In `render()`, after registering the chat panel in the sidebar, add:

```typescript
    // Connector sidebar (lazy — activated on first selection)
    this._connectorSidebar = this._register(new ConnectorSidebarWidget(this._ipc));
    const connectorSidebarContainer = document.createElement('div');
    connectorSidebarContainer.className = 'sidebar-panel-connectors';
    connectorSidebarContainer.appendChild(this._connectorSidebar.getDomNode());
    this._sidebar.addPanel('connectors', connectorSidebarContainer);

    // Connector drawer (overlays main content)
    this._connectorDrawer = this._register(new ConnectorDrawerWidget(this._ipc));
    wrapper.root.appendChild(this._connectorDrawer.getDomNode());

    // Wire sidebar events to drawer
    this._connectorSidebar.onDidSelectConnector(async (id) => {
      this._connectorSidebar.highlightConnector(id);
      await this._connectorDrawer.openForConnector(id);
    });

    this._connectorSidebar.onDidRequestAddConnector(() => {
      this._connectorSidebar.highlightConnector(null);
      this._connectorDrawer.openForNew();
    });

    this._connectorDrawer.onDidClose(() => {
      this._connectorSidebar.highlightConnector(null);
    });

    // Handle CLI install from sidebar with loading states
    this._connectorSidebar.onDidRequestInstallCLI(async (toolId) => {
      this._connectorSidebar.setCLIToolLoading(toolId, 'Installing...');
      const result = await this._ipc.invoke<{ success: boolean; installUrl?: string }>(IPC_CHANNELS.CLI_INSTALL, { toolId });
      await this._connectorSidebar.refreshCLITools();
      // If tool still not detected after refresh, show "Check Again"
      if (result.success && !this._connectorSidebar.isCLIToolInstalled(toolId)) {
        this._connectorSidebar.showCLIToolCheckAgain(toolId);
      }
    });

    // Handle CLI auth from sidebar with loading states
    this._connectorSidebar.onDidRequestAuthCLI(async (toolId) => {
      this._connectorSidebar.setCLIToolLoading(toolId, 'Authenticating...');
      await this._ipc.invoke(IPC_CHANNELS.CLI_AUTHENTICATE, { toolId });
      await this._connectorSidebar.refreshCLITools();
    });

    // Handle save/delete from drawer
    this._connectorDrawer.onDidSaveConnector(async (data) => {
      const existing = await this._ipc.invoke<{ connectors: Array<{ id: string }> }>(IPC_CHANNELS.CONNECTOR_LIST);
      const isNew = !existing.connectors.some(c => c.id === data.id);
      if (isNew) {
        await this._ipc.invoke(IPC_CHANNELS.CONNECTOR_ADD, {
          id: data.id, type: 'local_mcp', name: data.name, transport: data.transport,
          command: data.command, args: data.args, url: data.url, env: data.env, headers: data.headers,
          enabled: true, status: 'disconnected',
        });
      } else {
        await this._ipc.invoke(IPC_CHANNELS.CONNECTOR_UPDATE, { id: data.id, updates: data });
      }
      await this._connectorSidebar.refreshConnectors();
    });

    this._connectorDrawer.onDidDeleteConnector(async (id) => {
      await this._ipc.invoke(IPC_CHANNELS.CONNECTOR_REMOVE, { id });
      this._connectorDrawer.close();
      await this._connectorSidebar.refreshConnectors();
    });
```

Update the activity bar handler to activate connector sidebar on first switch:

```typescript
    // Wire activity bar — activate connector sidebar lazily
    let connectorSidebarActivated = false;
    this._register(this._activityBar.onDidSelectItem(async (item) => {
      this._sidebar.showPanel(item);
      if (item === 'connectors' && !connectorSidebarActivated) {
        connectorSidebarActivated = true;
        await this._connectorSidebar.activate();
      }
    }));
```

- [ ] **Step 2: Update barrel exports**

In `packages/ui/src/index.ts`, add:

```typescript
export { ConnectorSidebarWidget } from './browser/connectors/connectorSidebar.js';
export { ConnectorDrawerWidget } from './browser/connectors/connectorDrawer.js';
export { ConnectorListItemWidget } from './browser/connectors/connectorListItem.js';
export { CLIToolListItemWidget } from './browser/connectors/cliToolListItem.js';
export { ToolListSectionWidget } from './browser/connectors/toolListSection.js';
export { StatusBannerWidget } from './browser/connectors/connectorStatusBanner.js';
export { ConnectorConfigFormWidget } from './browser/connectors/connectorConfigForm.js';
```

- [ ] **Step 3: Verify build**

Run: `npx turbo build`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/browser/workbench.ts packages/ui/src/index.ts
git commit -m "feat(ui): wire connector sidebar and drawer into workbench"
```

---

### Task 13: Add CSS for connector UI components

**Files:**
- Modify: `apps/desktop/src/renderer/styles.css`

- [ ] **Step 1: Add connector CSS to styles.css**

Append to the end of `apps/desktop/src/renderer/styles.css`:

```css
/* === Connector Sidebar === */
.connector-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
}

.connector-sidebar-header {
  padding: 12px 16px;
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--fg-primary);
  border-bottom: 1px solid var(--border-secondary);
}

.connector-group-label {
  padding: 8px 16px 4px;
  font-size: var(--font-size-sm);
  color: var(--fg-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.connector-list-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  cursor: pointer;
  color: var(--fg-primary);
}
.connector-list-item:hover { background: var(--bg-hover); }
.connector-list-item.active { background: var(--bg-active); }

.connector-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-connected { background: var(--fg-success); }
.status-initializing { background: var(--fg-warning); }
.status-error { background: var(--fg-error); }
.status-disconnected { background: var(--fg-muted); }

.connector-empty {
  padding: 8px 16px;
  color: var(--fg-muted);
  font-size: var(--font-size-sm);
}

.connector-add-btn {
  margin: 8px 16px;
  padding: 6px 12px;
  background: var(--bg-tertiary);
  color: var(--fg-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: var(--font-size-sm);
}
.connector-add-btn:hover { background: var(--bg-hover); }

/* === CLI Tool List Item === */
.cli-tool-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 16px;
  color: var(--fg-primary);
}

.cli-tool-info { display: flex; gap: 8px; align-items: center; }
.cli-tool-name { font-size: var(--font-size-base); }
.cli-tool-version { font-size: var(--font-size-sm); color: var(--fg-secondary); }

.cli-checkmark { color: var(--fg-success); font-weight: bold; }

.cli-tool-btn {
  padding: 2px 8px;
  font-size: var(--font-size-sm);
  background: var(--brand-primary);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.cli-tool-btn:hover { background: var(--brand-primary-hover); }

.cli-tool-spinner { font-size: var(--font-size-sm); color: var(--fg-secondary); }

/* === Connector Drawer === */
.connector-drawer-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 100;
}
.connector-drawer-container.drawer-open { pointer-events: auto; }

.connector-drawer-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  opacity: 0;
  transition: opacity 0.2s;
}
.drawer-open .connector-drawer-backdrop { opacity: 1; }

.connector-drawer-panel {
  position: absolute;
  top: 0;
  right: 0;
  width: 400px;
  max-width: 50vw;
  height: 100%;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border-primary);
  transform: translateX(100%);
  transition: transform 0.2s ease-out;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.drawer-open .connector-drawer-panel { transform: translateX(0); }

.connector-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-secondary);
}

.connector-drawer-title {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--fg-primary);
}

.connector-drawer-close {
  background: none;
  border: none;
  color: var(--fg-secondary);
  font-size: 18px;
  cursor: pointer;
  padding: 4px;
}
.connector-drawer-close:hover { color: var(--fg-primary); }

.connector-drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* === Status Banner === */
.connector-status-banner {
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.banner-error { background: color-mix(in srgb, var(--fg-error) 15%, transparent); color: var(--fg-error); }
.banner-warning { background: color-mix(in srgb, var(--fg-warning) 15%, transparent); color: var(--fg-warning); }
.banner-message { flex: 1; font-size: var(--font-size-sm); }
.banner-action-btn {
  padding: 2px 8px;
  font-size: var(--font-size-sm);
  background: transparent;
  border: 1px solid currentColor;
  border-radius: var(--radius-sm);
  color: inherit;
  cursor: pointer;
}

.drawer-status-line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-size-sm);
  color: var(--fg-success);
  flex-wrap: wrap;
}

.drawer-status-btns {
  display: flex;
  gap: 6px;
  margin-left: auto;
}

.drawer-status-btn {
  padding: 2px 8px;
  font-size: var(--font-size-sm);
  background: var(--bg-tertiary);
  color: var(--fg-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.drawer-status-btn:hover { background: var(--bg-hover); }

/* === Tool List Section === */
.tool-list-section { display: flex; flex-direction: column; gap: 8px; }

.tool-search-input {
  width: 100%;
  padding: 6px 8px;
  background: var(--bg-input);
  color: var(--fg-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
}

.tool-group-header {
  display: block;
  width: 100%;
  text-align: left;
  padding: 6px 0;
  background: none;
  border: none;
  color: var(--fg-secondary);
  font-size: var(--font-size-sm);
  font-weight: 600;
  cursor: pointer;
}
.tool-group-header:hover { color: var(--fg-primary); }

.tool-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}
.tool-row label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  cursor: pointer;
  flex: 1;
  min-width: 0;
}
.tool-name { font-size: var(--font-size-base); color: var(--fg-primary); font-weight: 500; }
.tool-description {
  font-size: var(--font-size-sm);
  color: var(--fg-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tool-list-empty,
.tool-list-loading {
  padding: 8px 0;
  color: var(--fg-muted);
  font-size: var(--font-size-sm);
}

.tool-toggle-error {
  font-size: var(--font-size-xs);
  color: var(--fg-error);
  margin-left: 8px;
}

/* === Config Form === */
.connector-config-form { display: flex; flex-direction: column; gap: 8px; }

.config-field-readonly {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
}
.config-field-label { color: var(--fg-secondary); font-size: var(--font-size-sm); }
.config-field-value { color: var(--fg-primary); font-size: var(--font-size-sm); }

.config-edit { display: flex; flex-direction: column; gap: 8px; }

.config-label {
  display: block;
  font-size: var(--font-size-sm);
  color: var(--fg-secondary);
  margin-top: 4px;
}

.config-edit input[type="text"],
.config-edit textarea {
  width: 100%;
  padding: 6px 8px;
  background: var(--bg-input);
  color: var(--fg-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-sm);
  font-family: var(--font-family);
  font-size: var(--font-size-sm);
}

.config-transport-group {
  display: flex;
  gap: 12px;
}
.config-transport-group label {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--fg-primary);
  font-size: var(--font-size-sm);
  cursor: pointer;
}

.config-advanced-toggle {
  background: none;
  border: none;
  color: var(--fg-accent);
  font-size: var(--font-size-sm);
  cursor: pointer;
  text-align: left;
  padding: 4px 0;
}

.config-advanced { display: flex; flex-direction: column; gap: 8px; }

.config-btn-group {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.config-save-btn {
  padding: 6px 16px;
  background: var(--brand-primary);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.config-save-btn:hover { background: var(--brand-primary-hover); }

.config-cancel-btn,
.config-edit-btn {
  padding: 6px 16px;
  background: var(--bg-tertiary);
  color: var(--fg-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.config-delete-btn {
  padding: 6px 16px;
  background: transparent;
  color: var(--fg-error);
  border: 1px solid var(--fg-error);
  border-radius: var(--radius-sm);
  cursor: pointer;
  margin-left: auto;
}
```

- [ ] **Step 2: Verify build**

Run: `npx turbo build`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/styles.css
git commit -m "feat(ui): add CSS for connector sidebar, drawer, and form components"
```

---

### Task 14: Add Playwright E2E tests for connector UI

**Files:**
- Create: `tests/e2e/connectors-ui.spec.ts`

- [ ] **Step 1: Write E2E tests**

Create `tests/e2e/connectors-ui.spec.ts`:

```typescript
import { test, expect, _electron } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const APP_PATH = path.resolve(__dirname, '../../');

test.describe('Connector UI', () => {
  let app: Awaited<ReturnType<typeof _electron.launch>>;
  let page: Awaited<ReturnType<typeof app['firstWindow']>>;

  test.beforeAll(async () => {
    // Pre-seed onboarding-complete so we skip onboarding
    const userDataDir = path.join(APP_PATH, '.test-userdata-connectors-ui');
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(path.join(userDataDir, 'onboarding-complete.json'), '{"complete":true}');

    app = await _electron.launch({
      args: [path.join(APP_PATH, 'apps/desktop'), '--mock'],
      env: { ...process.env, ELECTRON_USER_DATA_DIR: userDataDir, NODE_ENV: 'test' },
    });
    page = await app.firstWindow();
    await page.waitForSelector('.workbench', { timeout: 15000 });
  });

  test.afterAll(async () => {
    await app?.close();
  });

  test('activity bar has Connectors button', async () => {
    const btn = page.locator('.activity-bar-item[data-item="connectors"]');
    await expect(btn).toBeVisible();
  });

  test('clicking Connectors shows connector sidebar', async () => {
    await page.click('.activity-bar-item[data-item="connectors"]');
    await expect(page.locator('.connector-sidebar')).toBeVisible();
    await expect(page.locator('.connector-group-installed')).toBeVisible();
    await expect(page.locator('.connector-group-cli')).toBeVisible();
    await expect(page.locator('.connector-add-btn')).toBeVisible();
  });

  test('Add Connector opens drawer with form', async () => {
    await page.click('.connector-add-btn');
    await expect(page.locator('.connector-drawer-container.drawer-open')).toBeVisible();
    await expect(page.locator('.config-name-input')).toBeVisible();
  });

  test('drawer closes on backdrop click', async () => {
    await page.click('.connector-drawer-backdrop');
    await expect(page.locator('.connector-drawer-container.drawer-open')).not.toBeVisible();
  });

  test('drawer closes on Escape', async () => {
    await page.click('.connector-add-btn');
    await expect(page.locator('.connector-drawer-container.drawer-open')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.connector-drawer-container.drawer-open')).not.toBeVisible();
  });

  test('can add a new connector via form', async () => {
    await page.click('.connector-add-btn');
    await page.fill('.config-name-input', 'Test MCP Server');
    await page.fill('.config-command-input', 'npx test-server');
    await page.click('.config-save-btn');

    // Connector should appear in sidebar
    await expect(page.locator('.connector-list-item')).toContainText('Test MCP Server');
  });

  test('clicking connector row opens drawer with details', async () => {
    await page.click('.connector-list-item');
    await expect(page.locator('.connector-drawer-container.drawer-open')).toBeVisible();
    await expect(page.locator('.connector-drawer-title')).toContainText('Test MCP Server');
    // Drawer should have status, tools, and config sections
    await expect(page.locator('.drawer-status-line')).toBeVisible();
    await expect(page.locator('.tool-list-section')).toBeVisible();
    await expect(page.locator('.connector-config-form')).toBeVisible();
    // Close for next test
    await page.keyboard.press('Escape');
  });

  test('switching back to chat shows conversation list', async () => {
    await page.click('.activity-bar-item[data-item="chat"]');
    await expect(page.locator('.conversation-list-panel')).toBeVisible();
  });
});
```

- [ ] **Step 2: Run E2E tests**

Run: `npx playwright test tests/e2e/connectors-ui.spec.ts`
Expected: All PASS (may need to build first with `npx turbo build`)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/connectors-ui.spec.ts
git commit -m "test(e2e): add Playwright tests for connector UI flows"
```

---

### Task 15: HARD GATE — Launch app and verify connector UI

**Files:** None (verification only)

- [ ] **Step 1: Build the app**

Run: `npx turbo build`

- [ ] **Step 2: Launch the app**

Run: `npm run desktop:dev`

- [ ] **Step 3: Verify manually (or via Playwright screenshot script)**

Write a temp verification script that:
1. Launches the built app with `_electron.launch()`
2. Clicks the Connectors activity bar icon
3. Takes a screenshot of the connector sidebar
4. Clicks "Add Connector"
5. Takes a screenshot of the drawer
6. Fills the form and saves
7. Takes a screenshot showing the new connector in the sidebar
8. Read all screenshots with the Read tool to verify

Expected:
- Connector sidebar renders with Installed Connectors, CLI Tools, and Add Connector button
- Drawer slides in from the right with the config form
- New connector appears in the sidebar after save
- No console errors related to connectors

- [ ] **Step 4: Clean up temp script**

Delete the verification script after confirming.
