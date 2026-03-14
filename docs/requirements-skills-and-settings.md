# Requirements: Skills, Settings & Related Functionality

**Date:** 2026-03-14
**Status:** Working document — captures what's done, what's in progress, and what's still needed.

---

## 1. Working Directory Default

**Requirement:** All SDK sessions default to the user's home folder (`os.homedir()`) as their working directory.

**Why:**
- Users work on documents across their home directory — the agent needs access
- In dev mode, using the project folder caused the agent to pick up Claude Code skills from the gho-work project folder (contamination)

**Status:** DONE (this worktree)
- `mapSessionConfig` in `copilotSDKImpl.ts` now defaults `workingDirectory` to `os.homedir()` when not explicitly set
- Per-conversation `workingDirectory` override removed from `agentServiceImpl.ts` (setup conversations no longer need special handling)

---

## 2. Two-Tier Skill System

**Requirement:** GHO Work loads skills from two sources:

| Tier | Location | Modifiable by user | Examples |
|------|----------|-------------------|----------|
| Product skills | `skills/` (bundled with app) | No | Connector setup, auth flows |
| User skills | `~/.gho-work/skills/` | Yes | Custom workflows, Claude plugins |

Both tiers are merged and available to the agent. Product skills are the base; user skills can extend or override.

**Status:** PARTIALLY DONE
- `SkillRegistryImpl` scans skill sources and merges results — DONE
- Product skills path (`skills/`) configured in `mainProcess.ts` — DONE
- User skills path (`~/.gho-work/skills/`) configured in `mainProcess.ts` — DONE
- User can add additional skill paths via Settings UI — DONE (on `feature/settings-ui` branch)
- Claude plugin installation into user skill set — NOT STARTED (see section 5)

---

## 3. Settings UI

**Requirement:** A settings view accessible via the gear icon in the activity bar, replacing the chat panel with a full-content-area settings layout.

### 3a. Settings Shell & Appearance Page — DONE (`feature/settings-ui`)

Implemented:
- [x] `SettingsPanel` shell with left nav + right content area
- [x] Activity bar gear icon toggles between settings and chat
- [x] Sidebar hidden when settings is active
- [x] `AppearancePage` with light/dark/system theme cards
- [x] Theme persistence via `IStorageService`
- [x] ARIA roles, keyboard navigation
- [x] Playwright E2E tests (7 tests)

### 3b. Skills Page — DONE (`feature/settings-ui`)

Implemented:
- [x] Skill sources section (shows built-in vs user paths with badges)
- [x] Add custom skill path (text input + validation)
- [x] Remove user skill paths
- [x] Installed skills browser (grouped by category, shows name/description/source)
- [x] Rescan button
- [x] Live updates via `SKILL_CHANGED` IPC event
- [x] Unit tests

### 3c. Skills Page — STILL NEEDED

Not yet implemented (explicitly deferred in the spec):

- [ ] **Per-skill enable/disable toggles** — allow users to turn off individual skills without removing the source path
- [ ] **`excludedTools` setting** — a setting to exclude certain tools from being loaded by the SDK. The plumbing exists in `SessionConfig.excludedTools` and is passed through to the SDK. Needs a UI control (probably on the Skills page or a dedicated "Agent" settings page). Defaults to empty.

### 3d. Future Settings Pages — NOT STARTED

The spec identifies these as future pages (same shell, new page widgets):

- [ ] **Models** — model selection, default model preferences
- [ ] **Permissions** — tool approval policies, auto-approve settings
- [ ] **Account** — GitHub auth status, sign in/out
- [ ] **Workspace** — working directory configuration, workspace-level preferences
- [ ] **Connectors / MCP** — MCP server management (moved from the old Connectors sidebar panel)

### 3e. Settings UI — Minor Gaps

- [ ] **CSS file** — the spec called for `apps/desktop/src/renderer/settings.css` but the branch doesn't have a dedicated CSS file. Styles may be inline or missing.
- [ ] **`Cmd+,` keyboard shortcut** — not wired yet (spec says "can be added later")

---

## 4. Documents Panel

**Requirement:** A sidebar file explorer for browsing workspace files and attaching them to chat messages. See `docs/superpowers/specs/2026-03-14-documents-panel-design.md` for full spec.

**Status:** NOT STARTED (spec is written, no implementation)

Key features:
- [ ] File tree widget in sidebar (Activity Bar `Cmd+3`)
- [ ] Recursive file browsing with expand/collapse
- [ ] Attach files to chat messages for agent context
- [ ] Basic file operations (create, rename, delete) via context menu
- [ ] Hide dotfiles/build artifacts by default (configurable)
- [ ] File watching for live updates

---

## 5. Claude Plugins

**Requirement:** Users can install Claude plugins (third-party skills/extensions) that get installed into the user skill set (`~/.gho-work/skills/`).

**Status:** NOT STARTED — no spec, no implementation

Open questions:
- [ ] What is the plugin format? (MCP servers? Skill markdown files? Bundled packages?)
- [ ] Discovery: how do users find plugins? (Registry? URL? Manual path?)
- [ ] Installation: `npx`/`uvx` style? Download + extract? Git clone?
- [ ] Updates: how are plugins updated?
- [ ] Permissions: what can plugins do? (tools, system prompts, MCP servers)
- [ ] UI: plugin section in Skills page? Separate page?

---

## 6. Setup Skill Refinements

**Requirement:** The setup skill (`skills/connectors/setup.md`) guides users through adding MCP servers.

**Status:** PARTIALLY DONE (this worktree)

Changes in this worktree:
- [x] Removed overly restrictive "you are NOT a developer tool" guardrail — replaced with functional description
- [x] Fixed `type:` → `transport:` in `add_mcp_server` examples to match actual API

---

## 7. Deleted Settings UI Plan

The 1760-line settings UI implementation plan (`docs/superpowers/plans/2026-03-14-settings-ui.md`) was deleted in this worktree. This is correct — the plan has been executed on the `feature/settings-ui` branch and is no longer needed as a working document.

---

## Priority Order (Suggested)

1. **Merge this worktree** — home directory default + agent service cleanup
2. **Merge `feature/settings-ui`** — settings shell, appearance, skills pages
3. **`excludedTools` UI** — add the setting to Skills page or a new Agent page
4. **Documents panel** — file explorer + chat attachment (spec ready)
5. **Additional settings pages** — Models, Account, Permissions, etc.
6. **Claude plugins** — needs spec + design first
