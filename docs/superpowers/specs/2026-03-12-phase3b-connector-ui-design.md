# Phase 3B: Connector UI — Design Spec

**Date:** 2026-03-12
**Status:** Approved
**Depends on:** Phase 3A (Core MCP + CLI Detection) — complete

## Goal

Build the UI layer for managing MCP connectors and CLI tools. Users can view connector status, browse and toggle tools, add/edit custom connectors, and install/authenticate CLI tools — all without leaving the chat context.

## Scope

**In scope (this phase):**
- Connector sidebar with three groups: Installed Connectors, CLI Tools, Add Custom
- Slide-over drawer panel for connector details, tool management, and configuration
- Unified tool view across all connectors
- One-click CLI tool installation and authentication
- Status indicators with actionable error banners

**Deferred:**
- MCP Registry browsing and one-click install
- Remote MCP OAuth flow
- Connector categories/tagging

## Architecture

### Layout: Sidebar + Slide-over Drawer (Option C)

The activity bar shows a Connectors icon. Clicking it activates the `ConnectorSidebarWidget` in the sidebar panel (same pattern as the existing `ConversationListPanel`).

Clicking any connector or "Add Connector" opens a `ConnectorDrawerWidget` — a 400px panel that slides in from the right, overlaying the main content area. A semi-transparent backdrop closes the drawer on click. The chat remains visible underneath (partially).

The drawer is created once by the workbench and shown/hidden via CSS transforms. It is not recreated on each open.

### Widget Hierarchy

All widgets extend `Disposable`, use `h()` for DOM creation, `Emitter<T>` for events, and `_register()` for disposable tracking.

```
Workbench
├── ActivityBar (existing — add Connectors icon)
├── Sidebar
│   └── ConnectorSidebarWidget
│       ├── Installed Connectors group
│       │   └── ConnectorListItemWidget[] (one per connector)
│       ├── CLI Tools group
│       │   └── CLIToolListItemWidget[] (one per detected tool)
│       └── "Add Connector" button
├── Main Content Area (existing — chat, etc.)
└── ConnectorDrawerWidget (overlays main content)
    ├── Header (connector name + close button)
    └── Scrollable body
        ├── StatusBannerWidget (error/warning banner, hidden when healthy)
        ├── ToolListSectionWidget (unified tools, grouped by connector)
        └── ConnectorConfigFormWidget (view/edit connector config)
```

## Sidebar Detail

### Installed Connectors Group

A list of configured MCP servers loaded via `CONNECTOR_LIST` IPC call on activation. Each row (`ConnectorListItemWidget`) shows:
- Connector name (text)
- Status dot: green (connected), yellow (initializing), red (error), gray (disconnected)
- Click target: opens the drawer for this connector

The currently-open connector gets a subtle highlight (e.g., background color).

Listens to `CONNECTOR_STATUS_CHANGED` push events to update dots in real time.

### CLI Tools Group

A list of detected CLI tools loaded via `CLI_DETECT_ALL` IPC call on activation. Each row (`CLIToolListItemWidget`) shows:
- Tool name and version (if installed)
- One of:
  - Green checkmark — installed and authenticated
  - "Authenticate" button — installed but not authenticated
  - "Install" button — not installed

**Install flow:**
1. Button changes to spinner with "Installing..."
2. `CLI_INSTALL` IPC call sends tool ID to main process
3. Main process runs install command via `execFile` (not `exec`, to prevent shell injection)
4. Success: row updates with version + green checkmark
5. Failure: row shows red "Failed" label; clicking opens drawer with error output and "Retry" / "Manual Instructions"

**Auth flow:**
1. Button changes to spinner with "Authenticating..."
2. `CLI_AUTHENTICATE` IPC call sends tool ID to main process
3. Main process runs auth command via `execFile`
4. Success/failure: row updates accordingly

Listens to `CLI_REFRESH` push events.

### Add Connector Button

Single button at the bottom of the sidebar. Opens the drawer in "new connector" mode (empty form, no status/tools sections).

## Drawer Detail

### Structure

Single scrollable view with three sections in vertical flow. No tabs.

**Animated entry:** CSS `transform: translateX(100%)` to `translateX(0)` transition. Backdrop fades in simultaneously.

**Modes:**
- **View existing connector** — Shows all three sections (status, tools, config in read-only)
- **New connector** — Shows only the config form section in edit mode

### Status Section

**When healthy (connected):**
- Single line: green dot + "Connected" text + "Disconnect" button
- No banner

**When unhealthy (error/disconnected):**
- Banner with yellow (warning) or red (error) background
- One-line error message (from `ConnectorConfig.error`)
- Action button contextual to the error:
  - Connection failed: "Reconnect"
  - Auth expired: "Re-authenticate"
  - Server crashed: "Restart"
- Below banner: "Connect" / "Disconnect" / "Test Connection" buttons

### Tools Section (Unified Tool View)

Shows ALL tools from ALL connected connectors, not just the connector that opened the drawer. Tools are grouped by connector name with collapsible group headers.

**Default state when opened for a specific connector:** That connector's group is expanded, others are collapsed.

**Each tool row:**
- Checkbox (enabled/disabled)
- Tool name (bold)
- Description (truncated, full text on hover/title attribute)

**Search/filter input** at the top of the section. Filters across all groups by tool name or description.

**Toggle behavior:** Checking/unchecking a tool calls `CONNECTOR_UPDATE` IPC with the updated `toolsConfig` for that tool's parent connector. The update is immediate (optimistic UI).

Listens to `CONNECTOR_TOOLS_CHANGED` push events.

### Config Section

**Read-only mode (existing connector):**
- Displays: name, transport type (stdio/HTTP), command or URL, status
- "Edit" button switches to edit mode

**Edit mode (existing or new connector):**

Minimal form fields:
- Name (text input, required)
- Transport type (toggle: stdio / HTTP)
- If stdio: Command (text input, required), Args (text input, comma-separated)
- If HTTP: URL (text input, required)

Advanced toggle reveals:
- Environment variables (key-value pairs, add/remove rows)
- Headers (key-value pairs, HTTP only)
- Additional args (for stdio)

Buttons: "Save" / "Cancel" (edit mode), "Add Connector" / "Cancel" (new mode)

**Save flow:**
- New connector: `CONNECTOR_ADD` IPC, sidebar updates, drawer shows the new connector's status
- Edit connector: `CONNECTOR_UPDATE` IPC, sidebar updates
- Validation: name required, command or URL required based on transport

**Delete:** "Remove Connector" button at the bottom of config section (existing connectors only). Confirmation dialog before calling `CONNECTOR_REMOVE` IPC. Drawer closes after deletion.

## IPC Additions

Phase 3A provides 10 IPC channels. Phase 3B adds two:

### CLI_INSTALL

- **Direction:** Renderer to Main to Renderer
- **Request:** `{ toolId: string }`
- **Response:** `{ success: boolean, error?: string, version?: string }`
- **Implementation:** `CLIDetectionServiceImpl.installTool(id)` runs the hardcoded install command via `execFile`. Returns the newly detected version on success.

### CLI_AUTHENTICATE

- **Direction:** Renderer to Main to Renderer
- **Request:** `{ toolId: string }`
- **Response:** `{ success: boolean, error?: string }`
- **Implementation:** `CLIDetectionServiceImpl.authenticateTool(id)` runs the auth command via `execFile`. Returns success/failure.

### Existing channels reused

| Channel | Used by |
|---------|---------|
| `CONNECTOR_LIST` | Sidebar initial load |
| `CONNECTOR_ADD` | Config form (new connector) |
| `CONNECTOR_REMOVE` | Config form (delete) |
| `CONNECTOR_UPDATE` | Config form (edit), tool toggles |
| `CONNECTOR_TEST` | Drawer status section |
| `CONNECTOR_GET_TOOLS` | Drawer tools section |
| `CONNECTOR_STATUS_CHANGED` | Sidebar dot updates, drawer banner |
| `CONNECTOR_TOOLS_CHANGED` | Drawer tools section |
| `CLI_DETECT_ALL` | Sidebar CLI group initial load |
| `CLI_REFRESH` | Sidebar CLI group updates |

## File Structure

### New files

All in `packages/ui/src/browser/connectors/`:

| File | Class | Responsibility |
|------|-------|---------------|
| `connectorSidebar.ts` | `ConnectorSidebarWidget` | Sidebar panel with three groups |
| `connectorDrawer.ts` | `ConnectorDrawerWidget` | Slide-over drawer, composes sections |
| `connectorListItem.ts` | `ConnectorListItemWidget` | Single connector row in sidebar |
| `cliToolListItem.ts` | `CLIToolListItemWidget` | Single CLI tool row with install/auth |
| `toolListSection.ts` | `ToolListSectionWidget` | Unified tool list with grouping/search |
| `connectorStatusBanner.ts` | `StatusBannerWidget` | Error/warning banner with action |
| `connectorConfigForm.ts` | `ConnectorConfigFormWidget` | Minimal form + advanced toggle |

### Modified files

| File | Change |
|------|--------|
| `packages/ui/src/browser/workbench.ts` | Add `ConnectorDrawerWidget` as workbench child |
| `packages/ui/src/browser/activityBar.ts` | Add Connectors icon, wire sidebar activation |
| `packages/ui/src/index.ts` | Export new connectors UI module |
| `packages/connectors/src/node/cliDetectionImpl.ts` | Add `installTool()` and `authenticateTool()` methods |
| `packages/connectors/src/common/cliDetection.ts` | Add install/auth methods to `ICLIDetectionService` interface |
| `packages/platform/src/ipc/common/ipc.ts` | Add `CLI_INSTALL` and `CLI_AUTHENTICATE` channels + Zod schemas |
| `packages/electron/src/main/mainProcess.ts` | Add IPC handlers for CLI_INSTALL and CLI_AUTHENTICATE |
| `packages/base/src/common/types.ts` | Add `installCommand` to `CLIToolStatus` if not already present |

## Testing Strategy

### Unit tests (Vitest, co-located)

Each widget gets tests for:
- Correct DOM structure on render
- State change responses (e.g., status dot color changes)
- Event firing on user interaction (click, toggle, form submit)

Specific coverage:
- `ConnectorConfigFormWidget`: form validation, advanced toggle, save/cancel events with correct payload
- `ToolListSectionWidget`: grouping by connector, checkbox toggle, search filtering
- `CLIToolListItemWidget`: state transitions (not installed to installing to installed, installed to authenticating to authenticated)
- `StatusBannerWidget`: visibility based on status, correct action button per error type

### Integration tests (Vitest)

- CLI install flow: mock `execFile`, verify correct command executed, version parsed on success, error message on failure
- CLI auth flow: mock `execFile`, verify correct auth command executed

### E2E tests (Playwright)

- Connector sidebar renders with Installed, CLI Tools, and Add Custom sections
- Clicking a connector opens the drawer with status, tools, and config sections
- Adding a new connector via form: fill form, save, connector appears in sidebar
- Tool enable/disable: toggle checkbox, reopen drawer, state persisted
- CLI install button triggers action (shell mocked at process level)
- Drawer closes on backdrop click
- Error banner appears when connector status is error

## CSS/Styling Notes

- Drawer: `position: fixed`, `right: 0`, `top: 0`, `height: 100%`, `width: 400px`
- Backdrop: `position: fixed`, full viewport, `background: rgba(0,0,0,0.3)`
- Transition: `transform 0.2s ease-out` for slide-in, `opacity 0.2s` for backdrop
- Status dots: 8px circles, CSS classes for colors (`.status-connected`, `.status-error`, etc.)
- Error banner: full-width within drawer, padding, icon + text + button layout
- Follow existing app color variables and font sizes
- Form inputs match existing app input styling
