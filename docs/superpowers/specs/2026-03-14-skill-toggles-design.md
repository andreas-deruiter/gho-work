# Skill Toggles — Design Spec

**Date:** 2026-03-14
**Status:** Approved
**Scope:** Per-skill enable/disable toggles on the existing Skills settings page, with persistence and SDK integration

---

## Overview

Add toggle switches to each skill row in the Skills settings page, allowing users to disable individual skills without removing the source directory. Disabled skills are excluded from both our `SkillRegistryImpl` loading and the Copilot SDK's `disabledSkills` session config. SDK tool exclusion (`excludedTools`) is deferred to a future iteration.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | Skills only, not SDK tools | SDK has no tool listing API; defer until runtime discovery is possible |
| Page location | Extend existing Skills page | Keeps all skill-related settings in one place |
| Persistence | `storageService` key `"skills.disabled"` | Follows existing pattern (`skills.additionalPaths`) |
| Session behavior | Changes apply to new conversations only | Avoids disrupting in-progress conversations |
| UX feedback | Disclaimer shown after first toggle | Informative without being noisy |
| SDK integration | Pass `disabledSkills` to `SessionConfig` | SDK natively supports `disabledSkills?: string[]` |

---

## Data Flow

```
User toggles skill → renderer sends SKILL_TOGGLE IPC
  → main process updates "skills.disabled" in storageService
  → main broadcasts SKILL_CHANGED to renderer (triggers re-render)

New conversation → agentServiceImpl.executeTask()
  → calls getDisabledSkills() callback → reads from storageService
  → passes disabledSkills to SDK SessionConfig
  → skips disabled skills in _loadSkill()
```

Disabled skills are stored as a `string[]` of skill IDs (e.g., `["connectors/setup", "auth/microsoft"]`), persisted as JSON under key `"skills.disabled"`.

---

## IPC Channels

Two new channels in `IPC_CHANNELS`:

| Channel | Direction | Payload | Response |
|---------|-----------|---------|----------|
| `SKILL_TOGGLE` | renderer → main | `{ skillId: string, enabled: boolean }` | `{ ok: true }` |
| `SKILL_DISABLED_LIST` | renderer → main | none | `string[]` |

### Zod Schemas

```typescript
export const SkillToggleRequestSchema = z.object({
  skillId: z.string(),
  enabled: z.boolean(),
});
export type SkillToggleRequest = z.infer<typeof SkillToggleRequestSchema>;
```

---

## SkillEntryDTO Extension

Add `disabled` to `SkillEntryDTO` so the renderer knows the toggle state:

```typescript
export const SkillEntryDTOSchema = z.object({
  // ...existing fields...
  disabled: z.boolean().optional(), // true if skill is in the disabled list
});
```

The `SKILL_LIST`, `SKILL_RESCAN`, and `SKILL_CHANGED` responses must merge the disabled list into the DTO. The `SKILL_LIST` handler reads `"skills.disabled"` from storage and sets `disabled: true` on matching entries. The `SKILL_TOGGLE` handler does the same before broadcasting `SKILL_CHANGED`.

---

## Skills Page UI Changes

### Toggle switches on skill rows

Each skill row in the "Installed Skills" section gets a toggle switch on the right side, replacing the plain source label layout:

```
┌─────────────────────────────────────────────────────┐
│ setup                                bundled  [ON]  │
│ Setup skill for adding MCP servers                  │
├─────────────────────────────────────────────────────┤
│ github                               bundled  [ON]  │
│ GitHub device code authentication flow              │
├─────────────────────────────────────────────────────┤
│ microsoft (dimmed)                     user   [OFF] │
│ Microsoft 365 authentication via device code        │
└─────────────────────────────────────────────────────┘
```

- Toggle element is a `<div>` with `role="switch"`, `aria-checked`, and `tabindex="0"`
- Each toggle has `aria-label="Enable <skillName>"` (e.g., `aria-label="Enable setup"`) so screen readers identify which skill is being toggled
- `Enter` and `Space` keydown activate the toggle (standard `role="switch"` behavior)
- Disabled skill rows get `opacity: 0.5`
- Source badge (bundled/user) remains, positioned left of the toggle
- Changes persist immediately via IPC (no save button)

### Disclaimer

After the user toggles any skill for the first time in a page session, show an info banner below the Installed Skills header:

> "Changes apply to new conversations. Existing conversations keep their current settings."

The disclaimer is shown once per page load after the first toggle action, not on every toggle.

### CSS

Add to `apps/desktop/src/renderer/styles.css`:

- `.skill-toggle` — the toggle switch container (36×20px, border-radius pill)
- `.skill-toggle[aria-checked="true"]` — active state (brand color background)
- `.skill-toggle[aria-checked="false"]` — inactive state (muted background)
- `.skill-item.disabled` — dimmed row (`opacity: 0.5`)
- `.skill-toggle-disclaimer` — info banner styling

---

## Main Process Handlers

### Shared helper

Factor the disabled-state merge into a helper used by all skill-returning handlers:

```typescript
function listSkillsWithDisabledState(): SkillEntryDTO[] {
  const disabledIds: string[] = JSON.parse(storageService?.getSetting('skills.disabled') ?? '[]');
  return skillRegistry.list().map(s => ({
    ...s,
    disabled: disabledIds.includes(s.id),
  }));
}
```

### `SKILL_TOGGLE` handler

```typescript
ipcMainAdapter.handle(IPC_CHANNELS.SKILL_TOGGLE, async (...args: unknown[]) => {
  const { skillId, enabled } = SkillToggleRequestSchema.parse(args[0]);
  const raw = storageService?.getSetting('skills.disabled');
  const disabled: string[] = raw ? JSON.parse(raw) : [];

  if (enabled) {
    const filtered = disabled.filter(id => id !== skillId);
    storageService?.setSetting('skills.disabled', JSON.stringify(filtered));
  } else {
    if (!disabled.includes(skillId)) {
      disabled.push(skillId);
      storageService?.setSetting('skills.disabled', JSON.stringify(disabled));
    }
  }

  ipcMainAdapter.sendToRenderer(IPC_CHANNELS.SKILL_CHANGED, listSkillsWithDisabledState());
  return { ok: true as const };
});
```

### `SKILL_DISABLED_LIST` handler

```typescript
ipcMainAdapter.handle(IPC_CHANNELS.SKILL_DISABLED_LIST, async () => {
  const raw = storageService?.getSetting('skills.disabled');
  return raw ? JSON.parse(raw) : [];
});
```

### Update existing `SKILL_LIST` and `SKILL_RESCAN` handlers

Replace `skillRegistry.list()` with `listSkillsWithDisabledState()` in both existing handlers so they also return the `disabled` field.

---

## Agent Service Integration

### Constructor change

`AgentServiceImpl` receives a new optional callback:

```typescript
constructor(
  private readonly _sdk: ICopilotSDK,
  private readonly _conversationService: IConversationService | null,
  private readonly _skillRegistry: ISkillRegistry,
  private readonly _readContextFiles?: () => Promise<string>,
  private readonly _getDisabledSkills?: () => string[],
) {}
```

### Session creation

In `executeTask()`, when creating a new session:

```typescript
const disabledSkills = this._getDisabledSkills?.() ?? [];

session = await this._sdk.createSession({
  // ...existing config...
  disabledSkills: disabledSkills.length > 0 ? disabledSkills : undefined,
});
```

### Skill loading filter

In `_loadSkill()`:

```typescript
private async _loadSkill(category: string, toolId: string): Promise<string | undefined> {
  const skillId = `${category}/${toolId}`;
  const disabled = this._getDisabledSkills?.() ?? [];
  if (disabled.includes(skillId)) {
    return undefined;
  }
  return this._skillRegistry.getSkill(category, toolId);
}
```

---

## SessionConfig Changes

### `packages/agent/src/common/types.ts`

Add `disabledSkills` to `SessionConfig`:

```typescript
export interface SessionConfig {
  // ...existing fields...
  disabledSkills?: string[];
}
```

### `packages/agent/src/node/copilotSDKImpl.ts`

Pass through in `mapSessionConfig`:

```typescript
disabledSkills: config.disabledSkills,
```

And in `resumeSession`:

```typescript
...(config?.disabledSkills ? { disabledSkills: config.disabledSkills } : {}),
```

---

## Files Changed

| File | Change |
|------|--------|
| `packages/platform/src/ipc/common/ipc.ts` | Add `SKILL_TOGGLE` and `SKILL_DISABLED_LIST` channels + Zod schema |
| `packages/electron/src/main/mainProcess.ts` | Add handlers for both new channels; pass `getDisabledSkills` to `AgentServiceImpl` |
| `apps/desktop/src/preload/index.ts` | Add `SKILL_TOGGLE` and `SKILL_DISABLED_LIST` to `ALLOWED_INVOKE_CHANNELS` |
| `packages/ui/src/browser/settings/skillsPage.ts` | Add toggle switches, fetch disabled list on load, show disclaimer on first toggle |
| `packages/agent/src/node/agentServiceImpl.ts` | Accept `getDisabledSkills` callback, pass `disabledSkills` to SDK, filter in `_loadSkill()` |
| `packages/agent/src/common/types.ts` | Add `disabledSkills` to `SessionConfig` |
| `packages/agent/src/node/copilotSDKImpl.ts` | Pass `disabledSkills` through `mapSessionConfig` and `resumeSession` |
| `apps/desktop/src/renderer/styles.css` | Toggle switch and disclaimer styles |
| Tests: `skillsPage.test.ts`, `installConversation.test.ts` | Toggle behavior tests, updated constructor signatures |

No new packages or files beyond tests.

---

## Out of Scope

- SDK tool exclusion (`excludedTools` UI) — deferred until SDK provides a tool listing API
- Per-skill configuration beyond enable/disable
- Skill dependency management (disabling a skill that others depend on)
- Hot-reload of skill toggles in existing sessions

---

## Invariants

### Stale disabled IDs

When a skill source is removed or a skill file is deleted, the `"skills.disabled"` list may contain IDs for skills that no longer exist. Policy: **stale disabled IDs are silently ignored.** At session creation time, `disabledSkills` is passed as-is to the SDK (which ignores unknown names). In `_loadSkill()`, a disabled ID for a nonexistent skill simply returns `undefined` — the same as if the skill didn't exist. In the UI, `_renderSkills()` only renders skills from the current registry list; stale IDs in the disabled set have no matching row and are invisible. No cleanup is performed — IDs accumulate until the user explicitly re-enables them.
