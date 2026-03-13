# Settings UI Design Spec

## Overview

Add a settings view to GHO Work that opens in the full content area (replacing chat) when the user clicks the gear icon in the activity bar. The settings view has a left navigation and right content area, with two initial sub-pages: Appearance and Skills.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Layout | Full content area | Settings has forms, tables, and controls that need horizontal space |
| Navigation | Activity bar toggle | Gear icon is just another activity bar item — consistent with existing pattern |
| Architecture | Shell + separate page widgets | Each page is independently testable, scales as more pages are added |
| Appearance scope | Theme only (light/dark/system) | Ship fast, add font size and other options later |
| Skills scope | View + configure paths | Browse skills by category, edit scan paths — no per-skill toggles |

## Component Structure

```
packages/ui/src/browser/settings/
  settingsPanel.ts      — Shell widget: nav list + content container
  appearancePage.ts     — Theme card selector (extends Widget)
  skillsPage.ts         — Skill browser + path configuration (extends Widget)
```

All page widgets extend `Widget` (which extends `Disposable` and provides `getDomNode()`). The shell references pages via the `Widget` base type — no separate interface needed since `Widget` already has `getDomNode()` and `dispose()`.

### SettingsPanel (shell)

- Extends `Widget`
- Owns the two-column layout: `.settings-nav` (left) + `.settings-content` (right)
- Nav items are a static list: `[{ id: 'appearance', label: 'Appearance' }, { id: 'skills', label: 'Skills' }]`
- On nav click: dispose current page, create new page widget, append `page.getDomNode()` to content container
- Receives dependencies via constructor: `IThemeService`, `IIPCRenderer`
- Passes relevant dependencies to each page's constructor
- Default page on first render: Appearance

### Workbench Integration

The current workbench layout is: `activity bar | sidebar | .workbench-main (ChatPanel)`. The activity bar drives which sidebar panel is shown (chat list, connectors). Settings needs different behavior.

When the gear icon is clicked:
1. **Hide the sidebar** — settings has its own internal nav, the sidebar adds no value
2. **Hide ChatPanel** in `.workbench-main`
3. **Show SettingsPanel** in `.workbench-main` (created lazily on first click)

When any other activity bar item is clicked (chat, connectors, etc.):
1. **Hide SettingsPanel**
2. **Show the sidebar** again
3. **Show ChatPanel** in `.workbench-main`
4. Resume normal sidebar panel switching

`SettingsPanel` is not disposed on hide — it persists so nav state and page state are preserved. Only disposed when the workbench is disposed.

### Theme Persistence

The existing `ThemeService` sets `data-theme` on the document and fires events, but does **not persist** the chosen theme. This spec requires adding persistence:

- `ThemeService.setTheme()` must also call `IIPCRenderer.invoke(IPC_CHANNELS.STORAGE_SET, { key: 'theme', value: theme })` to persist via `IStorageService`
- On app startup, `ThemeService` must read the stored theme via `IIPCRenderer.invoke(IPC_CHANNELS.STORAGE_GET, { key: 'theme' })` and apply it before first render

This requires `ThemeService` to receive `IIPCRenderer` as a constructor dependency (it currently has none).

## Appearance Page

### Layout

- Page title: "Appearance"
- Subtitle: "Customize the look and feel of the application"
- Section: "Theme" with three clickable cards

### Theme Cards

Each card shows a visual preview of the theme:

| Card | Preview | Label |
|------|---------|-------|
| Light | White background with light gray content blocks | "Light" |
| Dark | Dark background with dark gray content blocks | "Dark" |
| System | Diagonal split (light/dark) | "System" |

- Selected card has `border: 2px solid var(--brand-primary)` and a checkmark in the label
- Unselected cards have `border: 2px solid var(--border-secondary)`
- Click calls `IThemeService.setTheme(theme)` — the theme service handles persistence and CSS application
- On construction, reads `IThemeService.currentTheme` to set initial selected state
- Listens to `IThemeService.onDidChangeTheme` to update selection if theme changes externally

### Dependencies

- `IThemeService` — read current theme, set new theme, listen for changes

### Accessibility

- Theme cards have `role="radiogroup"` on the container, `role="radio"` + `aria-checked` on each card
- Arrow keys navigate between cards, Enter/Space selects
- Focus ring visible on keyboard navigation

## Skills Page

### Layout

Two sections stacked vertically:

1. **Skill Sources** — list of scan directories + add path input
2. **Installed Skills** — grouped list of discovered skills

### Skill Sources Section

- Title: "Skill Sources"
- Subtitle: "Directories where skills are loaded from"
- List of current sources, each showing:
  - Path (e.g., `skills/`, `~/.gho-work/skills/`)
  - Description — derived from the source's `id` field: built-in sources show "Built-in (bundled with app)", user sources show "User skills directory" or "Additional path"
  - Badge: `default` (gray) for sources with `priority <= 0`, `user` (amber) for sources with `priority > 0`
- User-added paths (priority > 0) show a remove button (x icon)
- Built-in paths have no remove button
- Below the list: text input + "Add" button for adding new paths

**Adding a path:**
1. Renderer sends IPC `SKILL_ADD_PATH` with `{ path: string }`
2. Main process validates the path exists on disk (via `fs.existsSync`)
3. If invalid: returns `{ error: 'Directory not found' }` — renderer shows inline error below the input
4. If duplicate: returns `{ error: 'Path already added' }` — renderer shows inline error
5. If valid: persists to `IStorageService.setSetting('skills.additionalPaths', ...)`, calls `ISkillRegistry.refresh()`, returns `{ ok: true }`
6. Renderer clears input, re-fetches sources and skill list

**Removing a path:**
1. Renderer sends IPC `SKILL_REMOVE_PATH` with `{ path: string }`
2. Main process removes from stored paths, calls `ISkillRegistry.refresh()`
3. Renderer re-fetches sources and skill list

### Installed Skills Section

- Title: "Installed Skills" with a "Rescan" button (right-aligned)
- Skills grouped by category (e.g., `install`, `auth`)
- Category header: uppercase label
- Each skill row shows:
  - Name (e.g., `gh`)
  - Description (from frontmatter)
  - Source path (right-aligned, muted text)
- Rescan button: IPC call `SKILL_RESCAN` → `ISkillRegistry.refresh()` → returns updated `SkillEntry[]` → re-render
- If no skills found: show empty state message "No skills found. Add a skill source directory above."

### Dependencies

- `IIPCRenderer` — all skill data flows through IPC since `ISkillRegistry` runs in main process

### Accessibility

- Skill sources list: `role="list"` with `role="listitem"` for each source
- Add path input: labeled with `aria-label="Additional skill path"`
- Remove buttons: `aria-label="Remove path: /path/here"`
- Rescan button: `aria-label="Rescan skill directories"`
- Skill list groups: category headers are `role="heading"` level 3

## New IPC Channels

Add to `IPC_CHANNELS` in `packages/platform/src/ipc/common/ipc.ts`:

```typescript
SKILL_LIST: 'skill:list'              // Request: void → Response: SkillEntryDTO[]
SKILL_SOURCES: 'skill:sources'        // Request: void → Response: SkillSourceDTO[]
SKILL_ADD_PATH: 'skill:add-path'      // Request: { path: string } → Response: { ok: true } | { error: string }
SKILL_REMOVE_PATH: 'skill:remove-path' // Request: { path: string } → Response: void
SKILL_RESCAN: 'skill:rescan'          // Request: void → Response: SkillEntryDTO[]
SKILL_CHANGED: 'skill:changed'        // Event (main→renderer): SkillEntryDTO[]
```

### DTO Types and Zod Schemas

Define in `packages/platform/src/ipc/common/ipc.ts` alongside existing schemas:

```typescript
// Serializable DTOs for IPC (mirrors SkillEntry/SkillSource but plain objects)
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
export const SkillAddPathResponseSchema = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ error: z.string() }),
]);
export const SkillRemovePathRequestSchema = z.object({ path: z.string() });
```

## CSS

New styles in a dedicated `apps/desktop/src/renderer/settings.css`, imported by the renderer entry point:

- `.settings-layout` — flex container, full height
- `.settings-nav` — left column, 160px wide, background `var(--bg-secondary)`, border-right
- `.settings-nav-item` — padding, border-radius, cursor pointer, hover: `var(--bg-hover)`
- `.settings-nav-item.active` — background `var(--brand-primary)`, color white
- `.settings-content` — flex: 1, padding 24px, overflow-y auto
- `.settings-page-title` — font-size `var(--font-size-xl)`, font-weight 600
- `.settings-page-subtitle` — font-size `var(--font-size-sm)`, color `var(--fg-muted)`
- `.settings-section` — margin-bottom 24px
- `.settings-section-title` — font-size `var(--font-size-base)`, font-weight 500
- `.theme-card` — width 100px, border-radius `var(--radius-lg)`, border: 2px solid `var(--border-secondary)`, cursor pointer
- `.theme-card.selected` — border-color `var(--brand-primary)`
- `.theme-card:focus-visible` — outline: 2px solid `var(--brand-primary)`, outline-offset 2px
- `.skill-source-list` — background `var(--bg-secondary)`, border-radius `var(--radius-lg)`, border
- `.skill-source-item` — flex row, padding, justify-content space-between
- `.skill-source-badge` — font-size `var(--font-size-sm)`, padding 2px 8px, border-radius `var(--radius-sm)`
- `.skill-source-badge.default` — background `var(--bg-tertiary)`, color `var(--fg-muted)`
- `.skill-source-badge.user` — background with amber tint, color `var(--fg-warning)`
- `.skill-category` — uppercase, letter-spacing, font-weight 600, color `var(--fg-muted)`
- `.skill-list-group` — background `var(--bg-secondary)`, border-radius `var(--radius-lg)`, border
- `.skill-item` — flex row, padding, border-bottom (except last)
- `.skill-path-input-error` — color `var(--fg-error)`, font-size `var(--font-size-sm)`, margin-top 4px

## Testing

- **Unit tests** (Vitest): `settingsPanel.test.ts`, `appearancePage.test.ts`, `skillsPage.test.ts`
  - SettingsPanel: nav switching mounts/unmounts correct pages, dispose cleans up active page, defaults to Appearance
  - AppearancePage: renders three theme cards, click fires theme change, selected state reflects current theme, keyboard nav works
  - SkillsPage: renders skill list from IPC data, add path calls IPC and shows error on failure, remove path calls IPC, rescan refreshes list, empty state shown when no skills
- **E2E test** (Playwright): `tests/e2e/settings.spec.ts`
  - Click gear icon → settings view appears, chat and sidebar hidden
  - Click Appearance → theme cards visible, click Dark → theme applies (data-theme attribute changes)
  - Click Skills → skill list visible
  - Click chat icon → settings hidden, sidebar and chat return

## Out of Scope

- Font size, other appearance options (future)
- Per-skill enable/disable toggles (future)
- Models, Permissions, Account, Workspace, Connectors sub-pages (future — same shell, new page widgets)
- Keyboard shortcut `Cmd+,` (can be added later to workbench keybinding handler)
