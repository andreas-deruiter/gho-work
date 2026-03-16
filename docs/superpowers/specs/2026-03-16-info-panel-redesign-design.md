# Info Panel Redesign

**Date:** 2026-03-16
**Status:** Draft

## Problem

The info panel is a key feature of GHO Work but currently looks unexciting. It uses flat, unstyled lists with no visual hierarchy. Users can't distinguish between active and completed items at a glance, and there's no way to manage screen real estate by collapsing sections they don't need. Several data sources that are already flowing through the system (subagents, skills, MCP server status, quota usage) aren't surfaced in the panel at all.

## Design Summary

Redesign the info panel as a collection of **collapsible mini-panels** (sections), each with a header containing a chevron toggle, title, and summary badge. The todo/progress section gets a **connected vertical timeline** with a progress ring. Four new sections surface data that already flows through the event system. The panel auto-hides when all sections are empty and auto-shows when any section has data.

## Visual Design

### Mockups

Interactive mockups created during brainstorming are at:
- `.superpowers/brainstorm/80423-1773615754/info-panel-full-v5.html` — Full 8-section layout (final visual reference, though section count was later refined to 7)
- `.superpowers/brainstorm/80423-1773615754/info-panel-collapsible-v3.html` — Collapse/expand interaction demo
- `.superpowers/brainstorm/80423-1773615754/info-panel-timeline-v2.html` — Timeline progression states

### Collapsible Section Pattern

Every section follows the same structure:

```
┌─────────────────────────────────────┐
│ ▼  SECTION TITLE          badge    │  ← header (always visible when section shown)
│                                     │
│  section content...                 │  ← body (hidden when collapsed)
│                                     │
└─────────────────────────────────────┘
```

- **Header**: chevron (▼ expanded, ▶ collapsed) + uppercase title + optional count/status badge
- **Body**: section-specific content, hidden when collapsed
- **Container**: subtle border (`rgba(255,255,255,0.06)`), rounded corners (`10px`), dark background (`rgba(255,255,255,0.02)`)
- **Chevron rotation**: CSS transition (`transform: rotate(-90deg)`) on collapse
- **Badges remain visible when collapsed** so users can see summary info without expanding

### Progress Timeline

The Progress section uses a connected vertical timeline instead of a flat list:

- **Progress ring** at the top: circular SVG with green→purple gradient fill, showing N/M counter in the center
- **Completed steps**: green filled circle with white rounded checkmark (SVG), strikethrough label, green connector line below
- **Active step**: purple bordered circle with inner dot and outer glow (`box-shadow`), expanded into a highlighted card with purple border
- **Pending steps**: small empty circle with dim border, dimmed label text
- **Connector lines**: 2px vertical lines joining circles; green for completed segments, dim for pending segments

## Sections

### 1. Progress

**Data source:** `todo_list_updated` agent event (existing)
**Default state:** Expanded
**Visibility:** Hidden until first todo arrives
**Content:** Progress ring + connected vertical timeline of todo items

Each todo item maps to a timeline node:
- `status: 'completed'` → green checkmark circle + strikethrough text
- `status: 'in-progress'` → purple active circle + expanded card with "Working on it..." subtitle
- `status: 'not-started'` → empty dim circle + dim text

The progress ring shows `completedCount / totalCount` and fills proportionally.

**Collapsed header badge:** `"N / M"` (e.g., `"3 / 5"`)

### 2. Agents

**Data source:** `subagent_started`, `subagent_completed`, `subagent_failed` agent events (existing but not currently shown in info panel)
**Default state:** Collapsed
**Visibility:** Hidden until first subagent event
**Content:** List of subagent cards showing name and status

Each subagent has a card with:
- Status dot: amber (running), green (completed), red (failed)
- Name
- Status badge: `RUNNING` / `DONE` / `FAILED`
- Optional status text line (e.g., description of what it's doing — from the `displayName` field if available)

Completed agents are dimmed. Running agents have a glowing status dot.

**Collapsed header badge:** `"N running"` or `"all done"` when none are running

**Bug to fix:** The type definitions in `types.ts` have duplicate conflicting variants for subagent events (Variant A with `subagentId`/`subagentName` and Variant B with `parentToolCallId`/`name`/`displayName`). The SDK emits Variant B but `chatPanel.ts` reads Variant A fields. As part of this redesign:
1. Choose Variant B (SDK-aligned): `parentToolCallId`, `name`, `displayName`
2. Remove Variant A type definitions (lines 156, 158 in types.ts)
3. Remove duplicate unreachable case handlers in `agentServiceImpl.ts` (lines 315-327)
4. Update `chatPanel.ts` to use Variant B field names

### 3. Skills

**Data source:** `skill_invoked` agent event (existing but not currently shown in info panel)
**Default state:** Collapsed
**Visibility:** Hidden until first skill event
**Content:** List of skill entries showing name and state

Each skill shows:
- Status dot: blue (active/running), green (completed), red (failed)
- Skill name
- Status badge: `ACTIVE` / `DONE` / `FAILED`

States from the event: `'running' | 'completed' | 'failed'`

**Collapsed header badge:** `"N active"` or hidden count when none active

### 4. Input

**Data source:** `tool_call_start` events for read-type tools + `attachment_added` events (existing)
**Default state:** Collapsed
**Visibility:** Hidden until first entry
**Content:** Chronological list of files read and tools used

Each entry shows:
- Icon: 📄 (file) or ⚙ (tool)
- Name (filename or tool description)
- Access count badge (only if count > 1, e.g., `"×3"`)
- Clickable → scrolls to corresponding message in chat

No changes to data model — purely visual reskin into collapsible mini-panel.

**Collapsed header badge:** total entry count

### 5. Output

**Data source:** `tool_call_result` events with `fileMeta` (existing)
**Default state:** Collapsed
**Visibility:** Hidden until first entry
**Content:** List of files produced or modified

Each entry shows:
- Icon: 📄
- Filename (clickable → scrolls to chat message, full path as tooltip)
- Action badge: `new` (purple) or `edited` (green)
- File size
- Reveal icon: 📂 (opens in system file explorer)

No changes to data model — purely visual reskin.

**Collapsed header badge:** total file count

### 6. Context

**Data source:** `context_loaded` agent event + `CONNECTOR_STATUS_CHANGED` IPC event + skill registry data (existing)
**Default state:** Collapsed
**Visibility:** Hidden until context_loaded fires
**Content:** Four sub-groups showing all loaded resources:

#### 6a. Instruction Sources
- Badge showing origin (`user` / `project`)
- File path

#### 6b. Registered Agents
- Agent name
- Plugin badge

#### 6c. Available Skills
Requires wiring: the skill registry data needs to be included in the `context_loaded` event payload. Currently `context_loaded` only carries `sources` and `agents`.

**Change needed:** Extend the `context_loaded` event type to include `skills: Array<{ name: string; source: string }>` and emit skill data from the agent service alongside instruction sources and registered agents.

#### 6d. MCP Servers
- Status dot: green (connected), red (error), gray (disconnected), amber (initializing)
- Server name
- Type badge: `stdio` / `http`
- Error message (if status is `error`)

Requires wiring: the info panel needs to subscribe to `CONNECTOR_STATUS_CHANGED` and seed from `CONNECTOR_LIST` on creation, similar to how the workbench already does for the status bar.

**Collapsed header badge:** total count of sources + agents + skills + servers

### 7. Usage

**Data source:** `QUOTA_CHANGED` IPC event (existing, carries `usedRequests`, `entitlementRequests`, `remainingPercentage`, `resetDate`)
**Default state:** Collapsed
**Visibility:** Hidden until first quota event
**Content:**
- Quota progress bar (green→amber gradient, filling left to right)
- Text: `"N / M requests"` on left, `"Resets <date>"` on right

When collapsed, the header shows an inline mini progress bar (48px wide) next to the percentage badge.

**Collapsed header badge:** remaining percentage (e.g., `"64%"`)

## Panel Visibility

- The info panel is **always part of the layout** (no user toggle to show/hide)
- The panel **auto-hides** when all 7 sections are hidden (no data to display)
- The panel **auto-shows** when any section receives data
- Individual sections hide/show independently based on whether they have data
- User collapse/expand state is **per-conversation** (stored in `InfoPanelState`)

## Architecture

### Files to Create

| File | Purpose |
|------|---------|
| `packages/ui/src/browser/infoPanel/agentsSection.ts` | Subagent status section |
| `packages/ui/src/browser/infoPanel/skillsSection.ts` | Skill status section |
| `packages/ui/src/browser/infoPanel/mcpSection.ts` | MCP server status helper, composed into ContextSection (global state, not per-conversation) |
| `packages/ui/src/browser/infoPanel/usageSection.ts` | Quota usage section |

### Files to Modify

| File | Changes |
|------|---------|
| `packages/ui/src/browser/infoPanel/infoPanel.ts` | Add new sections, implement auto-hide logic, add collapsible container pattern |
| `packages/ui/src/browser/infoPanel/infoPanelState.ts` | Track collapse state per section per conversation, track agents/skills/usage state |
| `packages/ui/src/browser/infoPanel/todoListWidget.ts` | Reskin as timeline with progress ring |
| `packages/ui/src/browser/infoPanel/inputSection.ts` | Wrap in collapsible container |
| `packages/ui/src/browser/infoPanel/outputSection.ts` | Wrap in collapsible container |
| `packages/ui/src/browser/infoPanel/contextSection.ts` | Add MCP servers and skills sub-groups, wrap in collapsible container |
| `packages/ui/src/browser/workbench.ts` | Wire new events to info panel (subagent, skill, connector status, quota) |
| `packages/base/src/common/types.ts` | Fix duplicate subagent event variants, extend context_loaded with skills |
| `packages/agent/src/node/agentServiceImpl.ts` | Remove duplicate subagent case handlers, emit skills in context_loaded |
| `packages/ui/src/browser/chatPanel.ts` | Update subagent field references to Variant B |

### Collapsible Section Base

Extract a reusable `CollapsibleSection` widget or mixin that all 7 sections use:

```
CollapsibleSection {
  header: { chevron, title, badge }
  body: { content slot }
  collapsed: boolean
  visible: boolean (auto-hide when no data)

  toggle(): void
  setBadge(text: string): void
  setVisible(visible: boolean): void
}
```

Each concrete section extends or wraps this, providing its own body content and badge logic.

### Event Wiring

New event subscriptions needed in the info panel (via workbench or direct IPC):

| Event | Handler |
|-------|---------|
| `skill_invoked` | → `SkillsSection.updateSkill(name, state)` |
| `subagent_started` | → `AgentsSection.addAgent(id, name, displayName)` |
| `subagent_completed` | → `AgentsSection.updateAgent(id, 'completed')` |
| `subagent_failed` | → `AgentsSection.updateAgent(id, 'failed', error)` |
| `CONNECTOR_STATUS_CHANGED` | → `ContextSection.updateServer(name, status, error)` |
| `QUOTA_CHANGED` | → `UsageSection.update(used, total, remaining, resetDate)` |

### State Persistence

`InfoPanelState` (per-conversation) needs to track:
- Collapse state per section (map of section name → boolean)
- Subagent entries (for conversation switch restore)
- Skill entries (for conversation switch restore)
- Usage snapshot (latest quota data)

MCP server status is global (not per-conversation) — seed from `CONNECTOR_LIST` on panel creation.

## Testing

### Unit Tests

- `CollapsibleSection`: toggle, badge update, visibility
- `AgentsSection`: add/update/complete agents, badge text
- `SkillsSection`: add/update skills, state transitions
- `UsageSection`: quota bar rendering, percentage display
- `TodoListWidget` (reskinned): timeline rendering, progress ring calculation
- `InfoPanel`: auto-hide when all sections empty, auto-show on first data
- `InfoPanelState`: collapse state persistence across conversation switches

### E2E Tests (Playwright)

- Verify panel auto-hides on empty conversation
- Send a message that triggers todos → verify panel appears with expanded Progress section
- Verify collapse/expand interaction on section headers
- Verify panel persists across conversation switches

## Out of Scope

- Drag-to-reorder sections
- User preferences for section order
- Custom color themes for the timeline
- Animation/transition effects beyond chevron rotation
- Per-section pinning or detaching
