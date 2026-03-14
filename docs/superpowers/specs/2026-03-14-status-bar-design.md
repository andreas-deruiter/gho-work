# Status Bar — Design Spec

**Date:** 2026-03-14
**Status:** Approved

## Overview

Replace the placeholder status bar with a fully functional widget displaying six data-driven items. Wire to real services where IPC channels exist; add minimal plumbing for agent state and SDK quota data.

## Items

### Left Side

**Workspace path**
- Icon: folder SVG (14×14)
- Text: home-relative path (e.g., `~/Projects/sales-reports`). Use `~` prefix when path starts with `$HOME`, otherwise show last 2 path segments with `…/` prefix if truncated.
- Data: invoke `WORKSPACE_GET_ROOT` IPC once on mount
- Click: emits `onDidClickItem('workspace')` — workspace picker (future)
- Tooltip: full absolute path
- Initial state: `"Loading…"` until IPC resolves; on error, show `"No workspace"`

**Connector status**
- Green/yellow/red dot indicating aggregate health
- Text: `"N connectors"` where N = total server count
- Dot color: green if all connected, yellow if some disconnected, red if all disconnected/error, hidden if N=0
- Data: invoke `CONNECTOR_LIST` on mount to seed a local `Map<string, MCPServerStatus>`. Subscribe to both `CONNECTOR_STATUS_CHANGED` (per-server updates) and `CONNECTOR_LIST_CHANGED` (server added/removed) to keep the map current. Derive aggregate state and count from the map on every change.
- Click: emits `onDidClickItem('connectors')` — workbench navigates to Settings > Connectors
- Initial state: `"…"` until first `CONNECTOR_LIST` resolves

### Right Side

**Active model**
- Text: model display name (e.g., "Claude Sonnet 4.5")
- Data: the `ModelSelector` widget in the renderer already tracks `_selectedModel` and exposes `onDidSelectModel: Event<string>`. The status bar observes this event directly — no IPC needed since both are in the renderer process. Seed from `ModelSelector.selectedModel` on mount.
- Click: emits `onDidClickItem('model')` — model selector dropdown (future)
- Initial state: show default model name from `ModelSelector`

**Agent state**
- Colored dot + text label
- States:
  - `idle` (green dot, "Agent idle") — default, when no task is active
  - `working` (pulsing yellow dot, "Agent working") — when a task is running
  - `error` (red dot, "Agent error") — when agent host is disconnected or unresponsive
- Data: subscribe to new `AGENT_STATE_CHANGED` IPC channel
- Not clickable
- Initial state: "Agent idle"

**Usage meter**
- Mini progress bar (36×4px) + percentage text (e.g., "47%")
- Visual states based on `remainingPercentage`:
  - Normal (>20% remaining): brand purple bar, default text color
  - Warning (≤20% remaining): amber bar, amber text, subtle amber background tint
  - Critical (0% remaining): red bar, red text, subtle red background tint
- Data: invoke new `QUOTA_GET` IPC on mount; subscribe to new `QUOTA_CHANGED` IPC for live updates from `assistant.usage` events
- Click: emits `onDidClickItem('usage')` — usage popover (future)
- Initial state: hidden until first quota response; if user is not authenticated, remain hidden
- ARIA: `role="meter"`, `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-label="Copilot usage"`

**User avatar**
- 18px circle with user initials, brand color background
- Data: subscribe to `AUTH_STATE_CHANGED` IPC; use first letter of `githubLogin` as initial
- Click: emits `onDidClickItem('user')` — user menu (future)
- Fallback: generic user icon SVG when not authenticated
- Initial state: generic icon until auth state resolves

## Service Plumbing

### Agent state event (new)

Add to `IAgentService` interface (`packages/agent/src/common/agent.ts`):

```typescript
readonly onDidChangeAgentState: Event<{ state: 'idle' | 'working' | 'error' }>;
```

Fire from `AgentServiceImpl`:
- `'working'` when `_activeTaskId` is set (task start)
- `'idle'` when `_activeTaskId` is cleared (task completion)
- `'error'` when the agent host connection fails

New IPC channel `AGENT_STATE_CHANGED` in `packages/platform/src/ipc/common/ipc.ts`. Main process subscribes to the service event and forwards to renderer via `webContents.send()`.

Preload allowlist: add `AGENT_STATE_CHANGED` to `validOnChannels`.

### Quota data (new)

IPC payload schema (zod, in `packages/platform/src/ipc/common/ipc.ts`):

```typescript
export const QuotaSnapshotSchema = z.object({
  /** Quota type key, e.g. 'chat', 'premium_interactions' */
  quotaType: z.string(),
  entitlementRequests: z.number(),
  usedRequests: z.number(),
  /** 0.0 to 1.0 */
  remainingPercentage: z.number(),
  overage: z.number(),
  overageAllowed: z.boolean(),
  /** ISO 8601 reset date */
  resetDate: z.string().optional(),
});

export const QuotaResultSchema = z.object({
  snapshots: z.array(QuotaSnapshotSchema),
});
```

Two new IPC channels:

- `QUOTA_GET` (invoke/handle) — calls `account.getQuota()` on the SDK RPC connection. Transforms `AccountGetQuotaResult` (keyed object) into `QuotaResultSchema` (array). Returns the result.
- `QUOTA_CHANGED` (send/on) — main process listens for `assistant.usage` events from SDK sessions, extracts `quotaSnapshots`, transforms to `QuotaResultSchema`, and forwards to renderer.

The renderer invokes `QUOTA_GET` on mount for initial state, then subscribes to `QUOTA_CHANGED` for live updates as the user makes requests. The usage meter displays the `premium_interactions` quota type (or the first available type if that key doesn't exist).

Preload allowlist: add `QUOTA_GET` to `validInvokeChannels`, `QUOTA_CHANGED` to `validOnChannels`.

## Widget Architecture

### StatusBar class

Extends `Widget` (which extends `Disposable`). Receives an `IIPCRenderer` interface as a constructor dependency for IPC access. Also receives a reference to the `ModelSelector` widget (or its `onDidSelectModel` event) for model updates.

```typescript
constructor(ipc: IIPCRenderer, modelSelector: ModelSelector)
```

The `Workbench` (which owns both the `StatusBar` and the `ModelSelector`) wires the dependency at construction time.

Owns six sub-widgets, one per item:

```
StatusBar
├── WorkspaceItem        (left)
├── ConnectorStatusItem  (left)
├── ModelItem            (right)
├── AgentStateItem       (right)
├── UsageMeterItem       (right)
└── UserAvatarItem       (right)
```

Each sub-widget:
- Extends `Disposable`
- Creates its own DOM via `h()` helper
- Has an `update(data)` method for reactive updates
- Is registered in the parent's `DisposableStore`

### Events

The `StatusBar` exposes a single event:

```typescript
readonly onDidClickItem: Event<string>;
```

Item IDs: `'workspace'`, `'connectors'`, `'model'`, `'usage'`, `'user'`.

The workbench subscribes and routes clicks. For this pass, only `'connectors'` has a real target (Settings > Connectors navigation). Others are logged but no-op.

### Data flow

```
Main Process                          Renderer
─────────────                         ────────
IAgentService.onDidChangeAgentState
  → ipcMain handler                   → StatusBar.AgentStateItem.update()
    → webContents.send(AGENT_STATE_CHANGED)

SDK account.getQuota()
  → ipcMain.handle(QUOTA_GET)         ← ipcRenderer.invoke(QUOTA_GET)
                                        → StatusBar.UsageMeterItem.update()

SDK session assistant.usage event
  → webContents.send(QUOTA_CHANGED)   → StatusBar.UsageMeterItem.update()

ModelSelector.onDidSelectModel         → StatusBar.ModelItem.update()
  (renderer-local, no IPC)

IAuthService.onDidChangeAuth
  → webContents.send(AUTH_STATE_CHANGED) → StatusBar.UserAvatarItem.update()

IMCPClientManager.onDidChangeStatus
  → webContents.send(CONNECTOR_STATUS_CHANGED) → StatusBar.ConnectorStatusItem.update()

CONNECTOR_LIST_CHANGED
  → webContents.send(...)              → StatusBar.ConnectorStatusItem re-seed map
```

## Visual Spec

- Height: 24px
- Background: `var(--bg-statusbar)` (dark, e.g., `#16162a`)
- Border-top: 1px solid `var(--border-subtle)`
- Font: 12px, color `var(--text-muted)`
- Item gap: 12px within each side
- Left/right padding: 8px
- Clickable items: cursor pointer, subtle hover highlight
- Dot indicators: 7px circle, colors: green (`#4ade80`), yellow/amber (`#facc15`), red (`#f87171`)
- Agent working dot: CSS `pulse` animation (opacity 1→0.4→1, 1.5s ease-in-out infinite)
- Progress bar: 36×4px, rounded, track `rgba(255,255,255,0.1)`, fill color varies by state
- Avatar: 18px circle, `var(--brand-primary)` background, white 9px bold text

### Accessibility

- Status bar container: `role="status"`, `aria-label="Status bar"`
- Dynamic items (agent state, usage meter): `aria-live="polite"` so screen readers announce changes
- Colored dots: paired with text labels (not color-only)
- Usage meter: `role="meter"` with `aria-valuenow`/`aria-valuemin`/`aria-valuemax`
- Clickable items: `role="button"`, `tabindex="0"`, keyboard-activatable via Enter/Space

## Not in Scope

- Usage popover widget
- Workspace picker dialog
- Model selector dropdown
- User menu
- Task queue indicator
- Status bar item reordering or customization
