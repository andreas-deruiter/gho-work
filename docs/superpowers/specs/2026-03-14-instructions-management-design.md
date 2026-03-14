# Instructions Management — Design Spec

## Summary

Add a user-configurable instructions file that the GHO Work agent reads at the start of every new conversation. The file lives at `~/.gho-work/gho-instructions.md` by default, with a Settings UI to change the path.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | Single global file, no workspace layering | GHO Work operates from home directory, not per-workspace |
| Path override | User can point to a different file via Settings | Flexibility without complexity; the file can reference others internally |
| Editing | External editor only | Target users have preferred editors; agent can also help edit via conversation |
| Read timing | Once per conversation start | Balances freshness with simplicity; mid-conversation edits are rare |
| Missing file | Template on first launch; indicator if later missing | Discoverability for new users, graceful degradation for misconfiguration |
| Settings placement | Dedicated "Instructions" tab | First-class concept, easy to find |

## Data Model & Storage

- **Setting key:** `instructions.filePath`
- **Default value:** `~/.gho-work/gho-instructions.md` (resolved to absolute path at runtime)
- **Storage:** SQLite `settings` table via `SqliteStorageService.setSetting()`
- **Value:** absolute path string. When absent from the database, the default applies.
- **Reset behavior:** Setting the value to empty string in SQLite (no `deleteSetting` API exists). The getter treats falsy values as "use default," so the effect is the same as key deletion.

The file itself is plain markdown, owned by the user. GHO Work never writes to it except for the one-time template creation on first launch.

## Template Creation

On first launch, if `~/.gho-work/gho-instructions.md` doesn't exist, create it:

```markdown
# GHO Work Instructions

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
```

- Created once, never overwritten by the app
- If the user changes the path to a non-existent file, no template is created at the new path — just the validity indicator shows in Settings

## Agent Integration

Flow: **new conversation → read setting → resolve path → read file → prepend to system message → create SDK session**

1. `MainProcess` wires up the `_readContextFiles` callback on `AgentServiceImpl` (currently `undefined`)
2. The callback is a closure that captures `storageService` — it calls `storageService.getSetting('instructions.filePath')` to get the path (falling back to the default), then reads the file with `fs.readFile(path, { encoding: 'utf-8' })`
3. If the file exists, its contents are returned as the context string
4. If missing/unreadable, the callback returns empty string (no error surfaced mid-conversation)
5. `AgentServiceImpl.executeTask()` already prepends context files to the system message with mode `'append'` — no changes needed there
6. **Size guard:** If the file exceeds 50KB, log a warning and truncate to 50KB with a trailing note `\n\n[Instructions truncated — file exceeds 50KB]`

## Settings UI

New "Instructions" tab in the Settings panel, positioned between Appearance and Skills.

### Layout

- **Page title:** "Instructions"
- **Subtitle:** "Configure the instructions file that the agent reads at the start of every conversation"
- **Section: Instructions File**
  - Section subtitle: "A markdown file with instructions, conventions, and context for the agent"
  - Path input row:
    - Read-only text input showing current path (monospace font)
    - "Browse" button — opens native file dialog filtered to `.md` files
    - "Reset" button — reverts to default `~/.gho-work/gho-instructions.md`
  - Status indicator:
    - Green dot + "File found — N lines" when file exists
    - Red dot + "File not found — agent will run without instructions" when missing
- **Tips section** (subtle card):
  - "Edit this file with any text editor — changes take effect on the next conversation"
  - "Use markdown formatting for structure and clarity"
  - "Reference other files with relative paths from your home directory"

### Visual reference

See `.superpowers/brainstorm/31681-1773525519/instructions-settings.html` for the mockup.

## IPC Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `INSTRUCTIONS_GET_PATH` | Renderer → Main | Returns current instructions file path + validation (exists, line count) |
| `INSTRUCTIONS_SET_PATH` | Renderer → Main | Saves new path, returns validation result |
| `DIALOG_OPEN_FILE` | Renderer → Main | Native file picker filtered to `.md` files (new; Skills uses `DIALOG_OPEN_FOLDER`) |

The agent side doesn't need its own channel — the `_readContextFiles` callback reads the path from settings and the file from disk directly in the main process.

### IPC Payload Schemas

```typescript
// INSTRUCTIONS_GET_PATH
// Request: void (no payload)
// Response:
{ path: string; exists: boolean; lineCount: number; isDefault: boolean }

// INSTRUCTIONS_SET_PATH
// Request:
{ path: string }  // absolute path to the new file
// Response:
{ path: string; exists: boolean; lineCount: number; isDefault: boolean }
// To reset: send empty string — handler deletes the setting key and returns default info

// DIALOG_OPEN_FILE
// Request:
{ filters?: Array<{ name: string; extensions: string[] }> }
// Response:
{ path: string | null }  // null if user cancelled
```

## Files to Create/Modify

### New files
- `packages/ui/src/browser/settings/instructionsPage.ts` — Settings page widget
- IPC channel definitions for `INSTRUCTIONS_GET_PATH`, `INSTRUCTIONS_SET_PATH`, `DIALOG_OPEN_FILE`
- Main process handlers for the new IPC channels

### Modified files
- `packages/platform/common/ipc.ts` — Add new channel constants and zod schemas
- `packages/ui/src/browser/settings/settingsPanel.ts` — Add Instructions tab (between General and Skills)
- `packages/electron/src/main/mainProcess.ts` — Wire `_readContextFiles` callback, register IPC handlers, template creation on startup (ensure `~/.gho-work/` directory exists with `mkdirSync({ recursive: true })` before writing template)
- `apps/desktop/src/preload/index.ts` — Add `INSTRUCTIONS_GET_PATH`, `INSTRUCTIONS_SET_PATH`, `DIALOG_OPEN_FILE` to `ALLOWED_INVOKE_CHANNELS`
- `apps/desktop/src/renderer/styles.css` — Reuse existing settings styles (likely no new CSS needed)

## Testing

- **Unit test:** `_readContextFiles` callback logic — file exists (returns content), file missing (returns empty), custom path from setting, size truncation at 50KB
- **Unit test:** `InstructionsPage` widget — renders path, shows status indicator, Browse/Reset button behavior
- **E2E test (Playwright):** Navigate to Settings > Instructions, verify path display and status indicator, use Browse to change path, verify status updates

## Out of Scope

- Built-in text editor for instructions
- Workspace-level instruction files
- Working folder feature
- Multiple instruction files managed through UI (user can reference other files from within their markdown)
- Live-reloading instructions mid-conversation
