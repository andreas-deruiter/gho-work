# Status Bar Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder status bar with six data-driven items wired to real services via IPC.

**Architecture:** The StatusBar widget owns six sub-widgets (Disposable pattern), each with an `update()` method. New IPC channels for agent state and quota data connect main process services to the renderer. The workbench wires IPC subscriptions and routes status bar click events. The model item observes `ModelSelector.onDidSelectModel` directly in the renderer (no IPC needed).

**Parallelization:** Chunks 1 (service plumbing) and 2 (widgets) are independent and can run in parallel via subagents. Chunk 3 (wiring) depends on both.

**Tech Stack:** TypeScript, Electron IPC, zod schemas, Copilot SDK `account.getQuota()`, VS Code-style Widget/Disposable/Event/Emitter patterns.

**Spec:** `docs/superpowers/specs/2026-03-14-status-bar-design.md`

**Security note:** All SVG icons must be created via DOM methods (`document.createElementNS`), not `innerHTML`. This prevents XSS vectors even though icons are static.

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `packages/ui/src/browser/statusBar/statusBar.ts` | Main StatusBar widget — owns sub-widgets, exposes `onDidClickItem` |
| `packages/ui/src/browser/statusBar/workspaceItem.ts` | Workspace path display |
| `packages/ui/src/browser/statusBar/connectorStatusItem.ts` | Connector count + aggregate dot |
| `packages/ui/src/browser/statusBar/modelItem.ts` | Active model name |
| `packages/ui/src/browser/statusBar/agentStateItem.ts` | Agent idle/working/error indicator |
| `packages/ui/src/browser/statusBar/usageMeterItem.ts` | Usage progress bar + percentage |
| `packages/ui/src/browser/statusBar/userAvatarItem.ts` | User avatar circle |
| `packages/ui/src/browser/statusBar/icons.ts` | SVG icon factory functions (DOM-based, no innerHTML) |
| `packages/ui/src/test/browser/statusBar.test.ts` | Tests for all status bar items |

### Modified files
| File | Changes |
|------|---------|
| `packages/platform/src/ipc/common/ipc.ts` | Add `AGENT_STATE_CHANGED`, `QUOTA_GET`, `QUOTA_CHANGED` channels + zod schemas |
| `packages/agent/src/common/agent.ts` | Add `onDidChangeAgentState` event to `IAgentService` |
| `packages/agent/src/node/agentServiceImpl.ts` | Fire agent state events |
| `packages/electron/src/main/mainProcess.ts` | Wire new IPC handlers for agent state + quota |
| `apps/desktop/src/preload/index.ts` | Add new channels to allowlists |
| `packages/ui/src/browser/workbench.ts` | Replace placeholder status bar with new widget, wire IPC |
| `packages/ui/src/index.ts` | Update StatusBar export path |
| `apps/desktop/src/renderer/styles.css` | Add status bar CSS |
| `packages/ui/src/browser/statusBar.ts` | Delete (replaced by statusBar/ directory) |

---

## Chunk 1: Service Plumbing

### Task 1: Add IPC channels and schemas

**Files:**
- Modify: `packages/platform/src/ipc/common/ipc.ts`
- Create: `packages/platform/src/ipc/common/ipc.test.ts`

- [ ] **Step 1: Write failing test for new schemas**

Create `packages/platform/src/ipc/common/ipc.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { AgentStateChangedSchema, QuotaSnapshotSchema, QuotaResultSchema } from './ipc.js';

describe('AgentStateChangedSchema', () => {
  it('should validate idle state', () => {
    expect(AgentStateChangedSchema.parse({ state: 'idle' })).toEqual({ state: 'idle' });
  });
  it('should validate working state', () => {
    expect(AgentStateChangedSchema.parse({ state: 'working' })).toEqual({ state: 'working' });
  });
  it('should validate error state', () => {
    expect(AgentStateChangedSchema.parse({ state: 'error' })).toEqual({ state: 'error' });
  });
  it('should reject invalid state', () => {
    expect(() => AgentStateChangedSchema.parse({ state: 'unknown' })).toThrow();
  });
});

describe('QuotaResultSchema', () => {
  it('should validate a quota result', () => {
    const data = {
      snapshots: [{
        quotaType: 'premium_interactions',
        entitlementRequests: 300,
        usedRequests: 158,
        remainingPercentage: 0.47,
        overage: 0,
        overageAllowed: false,
      }],
    };
    expect(QuotaResultSchema.parse(data)).toEqual(data);
  });
  it('should accept optional resetDate', () => {
    const data = {
      snapshots: [{
        quotaType: 'chat',
        entitlementRequests: 100,
        usedRequests: 10,
        remainingPercentage: 0.9,
        overage: 0,
        overageAllowed: true,
        resetDate: '2026-04-01T00:00:00Z',
      }],
    };
    expect(QuotaResultSchema.parse(data)).toEqual(data);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/platform/src/ipc/common/ipc.test.ts`
Expected: FAIL — schemas not exported

- [ ] **Step 3: Add channels and schemas to ipc.ts**

Add to `IPC_CHANNELS` object:

```typescript
// Agent state
AGENT_STATE_CHANGED: 'agent:state-changed',
// Quota
QUOTA_GET: 'quota:get',
QUOTA_CHANGED: 'quota:changed',
```

Add schemas after existing schemas:

```typescript
// --- Agent state schema ---
export const AgentStateChangedSchema = z.object({
  state: z.enum(['idle', 'working', 'error']),
});
export type AgentStateChanged = z.infer<typeof AgentStateChangedSchema>;

// --- Quota schemas ---
export const QuotaSnapshotSchema = z.object({
  quotaType: z.string(),
  entitlementRequests: z.number(),
  usedRequests: z.number(),
  remainingPercentage: z.number(),
  overage: z.number(),
  overageAllowed: z.boolean(),
  resetDate: z.string().optional(),
});
export type QuotaSnapshot = z.infer<typeof QuotaSnapshotSchema>;

export const QuotaResultSchema = z.object({
  snapshots: z.array(QuotaSnapshotSchema),
});
export type QuotaResult = z.infer<typeof QuotaResultSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/platform/src/ipc/common/ipc.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/platform/src/ipc/common/ipc.ts packages/platform/src/ipc/common/ipc.test.ts
git commit -m "feat(platform): add IPC channels and schemas for agent state and quota"
```

### Task 2: Add agent state event to IAgentService

**Files:**
- Modify: `packages/agent/src/common/agent.ts`
- Modify: `packages/agent/src/node/agentServiceImpl.ts`
- Create or modify: `packages/agent/src/test/agentServiceImpl.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { AgentServiceImpl } from '../node/agentServiceImpl.js';

describe('AgentServiceImpl.onDidChangeAgentState', () => {
  it('should fire working when task starts and idle when done', async () => {
    const mockSDK = {
      createSession: vi.fn().mockResolvedValue({
        on: vi.fn((cb) => {
          setTimeout(() => cb({ type: 'session.idle', data: {} }), 10);
          return () => {};
        }),
        send: vi.fn().mockResolvedValue(undefined),
        abort: vi.fn(),
      }),
    };
    const mockSkillRegistry = { getSkill: vi.fn() };

    const service = new AgentServiceImpl(
      mockSDK as any,
      null,
      mockSkillRegistry as any,
    );

    const states: string[] = [];
    service.onDidChangeAgentState(e => states.push(e.state));

    for await (const _e of service.executeTask('test', { conversationId: 'c1', model: 'gpt-4o' })) {
      // consume events
    }

    expect(states).toContain('working');
    expect(states[states.length - 1]).toBe('idle');
  });

  it('should fire error when task throws', async () => {
    const mockSDK = {
      createSession: vi.fn().mockRejectedValue(new Error('Agent host disconnected')),
    };
    const mockSkillRegistry = { getSkill: vi.fn() };

    const service = new AgentServiceImpl(
      mockSDK as any,
      null,
      mockSkillRegistry as any,
    );

    const states: string[] = [];
    service.onDidChangeAgentState(e => states.push(e.state));

    const events: any[] = [];
    for await (const e of service.executeTask('test', { conversationId: 'c2', model: 'gpt-4o' })) {
      events.push(e);
    }

    expect(states).toContain('working');
    // After error, should fire idle (cleanup) — error state is for host disconnection
    expect(states[states.length - 1]).toBe('idle');
    expect(events.some(e => e.type === 'error')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/agent/src/test/agentServiceImpl.test.ts`
Expected: FAIL — `onDidChangeAgentState` not defined

- [ ] **Step 3: Add event to interface**

In `packages/agent/src/common/agent.ts`:

```typescript
import { createServiceIdentifier } from '@gho-work/base';
import type { AgentContext, AgentEvent, Event } from '@gho-work/base';
import type { MCPServerConfig, MessageOptions } from './types.js';

export type AgentState = 'idle' | 'working' | 'error';

export interface IAgentService {
  readonly onDidChangeAgentState: Event<{ state: AgentState }>;
  executeTask(prompt: string, context: AgentContext, mcpServers?: Record<string, MCPServerConfig>, attachments?: MessageOptions['attachments']): AsyncIterable<AgentEvent>;
  cancelTask(taskId: string): void;
  getActiveTaskId(): string | null;
  createSetupConversation(): Promise<string>;
  getInstallContext(conversationId: string): string | undefined;
}

export const IAgentService = createServiceIdentifier<IAgentService>('IAgentService');
```

- [ ] **Step 4: Implement in AgentServiceImpl**

Add `Emitter` import and event to `AgentServiceImpl`:

```typescript
import { generateUUID, Emitter } from '@gho-work/base';
import type { Event } from '@gho-work/base';
import type { AgentState } from '../common/agent.js';
```

Add to class body:

```typescript
private readonly _onDidChangeAgentState = new Emitter<{ state: AgentState }>();
readonly onDidChangeAgentState: Event<{ state: AgentState }> = this._onDidChangeAgentState.event;
```

In `executeTask`, fire `'working'` after setting `_activeTaskId`:

```typescript
this._activeTaskId = taskId;
this._onDidChangeAgentState.fire({ state: 'working' });
```

In the `finally` block, fire `'idle'`:

```typescript
finally {
  this._activeTaskId = null;
  this._activeSession = null;
  this._onDidChangeAgentState.fire({ state: 'idle' });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run packages/agent/src/test/agentServiceImpl.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/common/agent.ts packages/agent/src/node/agentServiceImpl.ts packages/agent/src/test/agentServiceImpl.test.ts
git commit -m "feat(agent): add onDidChangeAgentState event to IAgentService"
```

### Task 3: Wire IPC handlers in main process + preload

**Files:**
- Modify: `packages/electron/src/main/mainProcess.ts`
- Modify: `apps/desktop/src/preload/index.ts`

- [ ] **Step 1: Add agent state forwarding to mainProcess.ts**

After `agentService` is created and registered in `services.set(IAgentService, agentService)`, add:

```typescript
agentService.onDidChangeAgentState((state) => {
  if (!mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.AGENT_STATE_CHANGED, state);
  }
});
```

- [ ] **Step 2: Add quota IPC handlers to mainProcess.ts**

Add `QUOTA_GET` handler. Check how the SDK's RPC is accessible — look at `ICopilotSDK` for a `getRpc()` or similar method. If the RPC is only available via active sessions, use `copilotSDK.getRpc?.()` with a graceful fallback:

```typescript
ipcMainAdapter.handle(IPC_CHANNELS.QUOTA_GET, async () => {
  try {
    const rpc = copilotSDK.getRpc?.();
    if (!rpc) { return { snapshots: [] }; }
    const result = await rpc.account.getQuota();
    return {
      snapshots: Object.entries(result.quotaSnapshots).map(([key, snap]) => ({
        quotaType: key,
        entitlementRequests: snap.entitlementRequests,
        usedRequests: snap.usedRequests,
        remainingPercentage: snap.remainingPercentage,
        overage: snap.overage,
        overageAllowed: snap.overageAllowedWithExhaustedQuota,
        resetDate: snap.resetDate,
      })),
    };
  } catch (err) {
    console.warn('[MainProcess] Failed to get quota:', err);
    return { snapshots: [] };
  }
});
```

Note: If `getRpc()` doesn't exist on `ICopilotSDK`, add it. The SDK's `createClient()` returns a connection that exposes `account.getQuota()`. Check `packages/agent/src/common/copilotSDK.ts` and `packages/agent/src/node/copilotSDKImpl.ts` for the current interface and add the method there.

- [ ] **Step 3: Forward quota from assistant.usage events**

Add a required `onDidChangeQuota` event to `IAgentService` (not optional — VS Code convention requires all interface members to be present):

```typescript
readonly onDidChangeQuota: Event<{ snapshots: Array<{ quotaType: string; remainingPercentage: number; entitlementRequests: number; usedRequests: number; overage: number; overageAllowed: boolean; resetDate?: string }> }>;
```

In `AgentServiceImpl`, add an Emitter for this event. In `_mapEvent`, add a case for `assistant.usage`:

```typescript
case 'assistant.usage': {
  const quotaSnapshots = data.quotaSnapshots as Record<string, any> | undefined;
  if (quotaSnapshots) {
    this._onDidChangeQuota.fire({
      snapshots: Object.entries(quotaSnapshots).map(([key, snap]) => ({
        quotaType: key,
        remainingPercentage: snap.remainingPercentage ?? 0,
        entitlementRequests: snap.entitlementRequests ?? 0,
        usedRequests: snap.usedRequests ?? 0,
        overage: snap.overage ?? 0,
        overageAllowed: snap.overageAllowedWithExhaustedQuota ?? false,
        resetDate: snap.resetDate,
      })),
    });
  }
  return null; // don't emit as AgentEvent
}
```

Then subscribe in mainProcess.ts:

```typescript
agentService.onDidChangeQuota((quota) => {
  if (!mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.QUOTA_CHANGED, quota);
  }
});
```

- [ ] **Step 4: Add channels to preload allowlists**

In `apps/desktop/src/preload/index.ts`:

Add to `ALLOWED_INVOKE_CHANNELS`:
```typescript
IPC_CHANNELS.QUOTA_GET,
```

Add to `ALLOWED_LISTEN_CHANNELS`:
```typescript
IPC_CHANNELS.AGENT_STATE_CHANGED,
IPC_CHANNELS.QUOTA_CHANGED,
```

- [ ] **Step 5: Type check**

Run: `npx turbo build`
Expected: clean compilation

- [ ] **Step 6: Commit**

```bash
git add packages/electron/src/main/mainProcess.ts apps/desktop/src/preload/index.ts packages/agent/src/common/agent.ts packages/agent/src/node/agentServiceImpl.ts
git commit -m "feat(electron): wire agent state and quota IPC handlers"
```

---

## Chunk 2: Status Bar Widget

### Task 4: Create SVG icon helpers

**Files:**
- Create: `packages/ui/src/browser/statusBar/icons.ts`

- [ ] **Step 1: Create icon factory functions**

All SVG icons must use `document.createElementNS` (not innerHTML) for security:

```typescript
const SVG_NS = 'http://www.w3.org/2000/svg';

function createSvg(width: number, height: number): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  return svg;
}

export function createFolderIcon(): SVGSVGElement {
  const svg = createSvg(14, 14);
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z');
  svg.appendChild(path);
  return svg;
}

export function createUserIcon(): SVGSVGElement {
  const svg = createSvg(14, 14);
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2');
  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '7');
  circle.setAttribute('r', '4');
  svg.appendChild(path);
  svg.appendChild(circle);
  return svg;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/ui/src/browser/statusBar/icons.ts
git commit -m "feat(ui): add SVG icon factory for status bar (DOM-based, no innerHTML)"
```

### Task 5: Create sub-widget files

**Files:**
- Create: `packages/ui/src/browser/statusBar/workspaceItem.ts`
- Create: `packages/ui/src/browser/statusBar/connectorStatusItem.ts`
- Create: `packages/ui/src/browser/statusBar/modelItem.ts`
- Create: `packages/ui/src/browser/statusBar/agentStateItem.ts`
- Create: `packages/ui/src/browser/statusBar/usageMeterItem.ts`
- Create: `packages/ui/src/browser/statusBar/userAvatarItem.ts`
- Create: `packages/ui/src/test/browser/statusBar.test.ts`

- [ ] **Step 1: Write tests for all sub-widgets**

Create `packages/ui/src/test/browser/statusBar.test.ts` with tests for all 6 sub-widgets. Each test verifies:
- DOM structure renders correctly
- `update()` changes displayed data
- Click events fire (for clickable items)
- Edge cases (null data, empty arrays, boundary values)
- ARIA attributes present

See the spec for exact data types per item. Key test cases:

**WorkspaceItem:** renders path with `~` prefix when under $HOME, shows last 2 path segments with `…/` prefix for non-home paths, shows "No workspace" for null, shows "Loading…" as initial state, tooltip is full path, click fires event.

**ConnectorStatusItem:** green dot when all connected, yellow when mixed, red when all disconnected/error, hidden when 0 servers, singular "1 connector" text, shows "…" as initial/loading state before first data.

**ModelItem:** displays model name, click fires event.

**AgentStateItem:** idle=green dot, working=yellow+pulse, error=red, `aria-live="polite"`.

**UsageMeterItem:** percentage display, warning at <=20%, critical at 0%, hidden when `visible: false`, `role="meter"` with aria values.

**UserAvatarItem:** shows initial letter when authenticated, SVG icon when not, click fires event.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/ui/src/test/browser/statusBar.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 3: Implement all six sub-widgets**

Each sub-widget follows the pattern from the spec:
- Extends `Disposable`
- Creates DOM via `h()` helper
- Clickable items expose `onDidClick: Event<void>` via `Emitter`
- Has `update(data)` method
- SVG icons use factory functions from `icons.ts`
- Keyboard accessible: `role="button"`, `tabindex="0"`, Enter/Space handlers

Implement files in this order (no dependencies between them):
1. `workspaceItem.ts` — uses `createFolderIcon()` from icons.ts
2. `connectorStatusItem.ts` — manages local status map, derives aggregate dot color
3. `modelItem.ts` — simplest, just text display
4. `agentStateItem.ts` — state config map, toggles dot CSS classes
5. `usageMeterItem.ts` — progress bar fill width, CSS class toggling for warning/critical
6. `userAvatarItem.ts` — uses `createUserIcon()` from icons.ts for fallback

- [ ] **Step 4: Run tests and lint**

Run: `npx vitest run packages/ui/src/test/browser/statusBar.test.ts && npx turbo lint`
Expected: PASS, 0 lint errors

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/browser/statusBar/ packages/ui/src/test/browser/statusBar.test.ts
git commit -m "feat(ui): add status bar sub-widgets with tests"
```

### Task 6: Create main StatusBar widget

**Files:**
- Create: `packages/ui/src/browser/statusBar/statusBar.ts`
- Delete: `packages/ui/src/browser/statusBar.ts` (old file)
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Write test for main StatusBar**

Add to `packages/ui/src/test/browser/statusBar.test.ts`:

Test that:
- Left and right sections render with all 6 sub-items
- `onDidClickItem` fires correct item ID when sub-item clicked
- `role="status"` and `aria-label="Status bar"` present
- `updateXxx()` proxy methods work (e.g., `updateWorkspace()` updates workspace item)
- All sub-widgets disposed when StatusBar is disposed

- [ ] **Step 2: Implement StatusBar**

Create `packages/ui/src/browser/statusBar/statusBar.ts`:

Extends `Widget`. Constructor creates all 6 sub-widgets, appends to left/right containers, routes click events to a single `onDidClickItem: Event<StatusBarItemId>` emitter. Exposes proxy update methods: `updateWorkspace()`, `updateConnectors()`, `updateModel()`, `updateAgentState()`, `updateUsage()`, `updateUser()`.

- [ ] **Step 3: Delete old statusBar.ts and update exports**

```bash
rm packages/ui/src/browser/statusBar.ts
```

Update `packages/ui/src/index.ts` to export from new path.

- [ ] **Step 4: Run tests and type check**

Run: `npx vitest run packages/ui/src/test/browser/statusBar.test.ts && npx turbo build`
Expected: PASS, clean build

- [ ] **Step 5: Commit**

```bash
git rm packages/ui/src/browser/statusBar.ts
git add packages/ui/src/browser/statusBar/statusBar.ts packages/ui/src/index.ts packages/ui/src/test/browser/statusBar.test.ts
git commit -m "feat(ui): create StatusBar widget with sub-widgets and click events"
```

---

## Chunk 3: Wiring and Styling

### Task 7: Wire status bar in workbench

**Files:**
- Modify: `packages/ui/src/browser/workbench.ts`
- Modify: `packages/ui/src/test/browser/workbench.test.ts`

- [ ] **Step 1: Update StatusBar import**

```typescript
import { StatusBar } from './statusBar/statusBar.js';
```

- [ ] **Step 2: Replace placeholder items with IPC wiring**

In `render()`, replace lines 197-198 (`addLeftItem('Ready')`, `addRightItem('Copilot SDK')`) with:

**Workspace path:** async invoke `WORKSPACE_GET_ROOT`, call `updateWorkspace()`.

**Connectors:** seed from `CONNECTOR_LIST`, subscribe to `CONNECTOR_STATUS_CHANGED` and `CONNECTOR_LIST_CHANGED`. Maintain local `Map<string, status>`, call `updateConnectors()` on every change.

**Auth/user:** subscribe to `AUTH_STATE_CHANGED`, seed from `AUTH_STATE`, call `updateUser()`.

**Agent state:** subscribe to `AGENT_STATE_CHANGED`, call `updateAgentState()`.

**Model:** observe `ModelSelector.onDidSelectModel` directly in the renderer process (no IPC needed — both widgets are in the same process). The workbench already owns both `ModelSelector` and `StatusBar`. Seed with `ModelSelector.selectedModel` on mount, then subscribe to `onDidSelectModel` for live updates. This matches the spec: "The status bar observes this event directly."

Note: `ModelSelector` is currently created inside `ChatPanel`. To observe it from `Workbench`, either (a) expose it as a property of `ChatPanel`, or (b) pass the `onDidSelectModel` event through `ChatPanel`. Option (a) is simpler.

**Quota:** async invoke `QUOTA_GET`, subscribe to `QUOTA_CHANGED`, call `updateUsage()`. Look for `premium_interactions` quota type, fall back to first snapshot.

**Click routing:** subscribe to `onDidClickItem`. For `'connectors'`, navigate to Settings > Connectors panel.

- [ ] **Step 3: Remove old StatusBar tests from workbench.test.ts**

Remove the `describe('StatusBar')` block (lines 52-71) from `workbench.test.ts` — those tests are superseded by the new `statusBar.test.ts`.

- [ ] **Step 4: Type check and test**

Run: `npx turbo build && npx vitest run`
Expected: clean build, all tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/browser/workbench.ts packages/ui/src/test/browser/workbench.test.ts
git commit -m "feat(ui): wire status bar items to IPC data sources in workbench"
```

### Task 8: Add CSS styling

**Files:**
- Modify: `apps/desktop/src/renderer/styles.css`

- [ ] **Step 1: Add status bar styles**

Add CSS for:
- `.status-bar` — flex row, 24px height, dark background, border-top
- `.status-bar-left`, `.status-bar-right` — flex with 12px gap
- `.status-bar-item` — inline-flex, 5px gap, nowrap
- `.status-bar-item[role="button"]` — cursor pointer, hover highlight, focus-visible outline
- `.sb-dot` — 7px circle; `.green`, `.yellow`, `.red` color variants
- `.sb-dot.pulse` — keyframe animation (opacity 1 to 0.4, 1.5s ease-in-out)
- `.sb-usage-bar` — 36x4px track; `.sb-usage-fill` — colored fill with transition
- `.sb-usage.usage-warning` — amber tint; `.sb-usage.usage-critical` — red tint
- `.sb-user` — 18px circle; `.sb-user-avatar` — brand bg, white text
- `.sb-model` — secondary text color
- `.sb-workspace-icon` — flex container for SVG alignment

See spec Visual Spec section for exact values.

- [ ] **Step 2: Run lint**

Run: `npx turbo lint`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/styles.css
git commit -m "style: add status bar CSS with dot indicators, usage meter, and avatar"
```

### Task 9: Build, test, and launch verification

- [ ] **Step 1: Full build**

Run: `npx turbo build`
Expected: clean compilation

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: all tests pass

- [ ] **Step 3: Launch app and verify (HARD GATE)**

Run: `npm run desktop:dev`

Verify all 6 items:
- Status bar renders at bottom, 24px tall, dark background
- Left: folder icon + workspace path (~ prefixed), connector dot + count
- Right: model name, agent state green dot + "Agent idle", user avatar
- Usage meter hidden if not authenticated, visible with percentage if authenticated
- Click connector status → navigates to Settings > Connectors
- Send a message → agent state changes to yellow "Agent working" → back to green "Agent idle"

- [ ] **Step 4: Playwright self-verification screenshot**

Write a temp Playwright script using `_electron.launch()` to screenshot the status bar. Verify:
- Status bar visible at bottom of window
- Expected items present in left and right sections
- Clean up temp script after verification

- [ ] **Step 5: Run lint**

Run: `npx turbo lint`
Expected: 0 errors

- [ ] **Step 6: Final commit**

Stage only the files modified in this plan (do not use `git add -A`):

```bash
git add packages/ui/src/browser/statusBar/ packages/ui/src/browser/workbench.ts packages/ui/src/index.ts packages/ui/src/test/browser/ packages/platform/src/ipc/common/ packages/agent/src/ packages/electron/src/main/mainProcess.ts apps/desktop/src/preload/index.ts apps/desktop/src/renderer/styles.css
git commit -m "feat: complete status bar implementation with data-driven items"
```
