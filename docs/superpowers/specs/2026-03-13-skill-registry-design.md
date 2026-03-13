# Skill Registry Architecture

## Goal

Replace the single-path skill loader in `AgentServiceImpl` with a multi-source `ISkillRegistry` service that discovers, deduplicates, and serves skills from bundled, user, and marketplace sources — with test isolation and no dev-time skill leakage.

## Architecture

A layered `SkillRegistry` service scans multiple skill sources at startup, merges them by priority, and exposes a unified API. `AgentServiceImpl` consumes the registry instead of reading files directly.

## Skill Format

Skills use Claude Code's format: Markdown files with YAML frontmatter.

```markdown
---
name: install-gh
description: Install and configure GitHub CLI on the user's machine
---

# Install GitHub CLI (gh)
...
```

**Skill identity** is `{category}/{name}` — e.g., `install/gh`, `auth/mgc`. Both components are derived from the filesystem:

- **category** = parent directory name (e.g., `install/`)
- **name** = filename stem without `.md` extension (e.g., `gh.md` → `gh`)

Frontmatter `name` and `category` fields are **display metadata only** — they do not affect identity or lookup. This ensures backwards compatibility: existing callers like `_loadSkill('install', 'gh')` continue to work without changes.

**File layout convention** (same for all sources):

```
<source-root>/
  install/
    gh.md
    mgc.md
  auth/
    gh.md
  connectors/
    setup.md
```

**File constraints:**
- Only `*.md` files are scanned (other extensions are ignored)
- If two files in the same directory resolve to the same name (e.g., `gh.md` and `gh.markdown`), only `*.md` is considered — this is not a conflict
- Subdirectories within a category are ignored (no nested categories)

## Deduplication

When the same `{category}/{name}` exists in multiple sources, higher-priority source wins:

1. User skills (priority 20, highest)
2. Additional paths (priority 15)
3. Marketplace plugins (priority 10)
4. Bundled skills (priority 0, lowest)

This lets users override a bundled skill if they need to (e.g., customize the `install/gh` flow for their environment).

## ISkillRegistry Service

### Interface

```typescript
interface SkillSource {
  id: string;           // e.g., 'bundled', 'user', 'marketplace:superpowers'
  priority: number;     // higher = wins on conflict
  basePath: string;     // root directory to scan (absolute path, ~ already expanded)
}

interface SkillEntry {
  id: string;           // e.g., 'install/gh'
  category: string;     // e.g., 'install'
  name: string;         // e.g., 'gh' (filename stem, not frontmatter name)
  description: string;  // from frontmatter (empty string if missing/malformed)
  sourceId: string;     // which source it came from
  filePath: string;     // absolute path to the .md file
}

interface ISkillRegistry extends IDisposable {
  /** Scan all sources and build the skill index. Call once at startup. */
  scan(): Promise<void>;

  /** Get a skill's content by category and name. Returns undefined if not found. */
  getSkill(category: string, name: string): Promise<string | undefined>;

  /** Get the entry (metadata) without loading content. */
  getEntry(category: string, name: string): SkillEntry | undefined;

  /** List all discovered skills, optionally filtered by category. */
  list(category?: string): SkillEntry[];

  /** Full re-scan: clears index, re-reads all sources. Existing SDK sessions are unaffected (they snapshot the system prompt at creation time). */
  refresh(): Promise<void>;

  /** Fires after scan() or refresh() completes with the full skill list. */
  readonly onDidChangeSkills: Event<SkillEntry[]>;
}
```

### Location in monorepo

```
packages/agent/src/
  common/
    skillRegistry.ts          # ISkillRegistry interface + createServiceIdentifier
  node/
    skillRegistryImpl.ts      # Implementation (fs scanning, frontmatter parsing)
```

Follows the existing service pattern (`common/` for interface, `node/` for implementation).

### Scanning logic

Sources are processed in ascending priority order (bundled=0 first, user=20 last), so higher-priority entries overwrite lower-priority ones:

1. Check if `basePath` exists (skip silently if not — user dir may be empty)
2. List immediate subdirectories (these are categories). Do not follow symlinks (`lstat`). Skip entries that are not directories.
3. For each category directory, list `*.md` files (no recursion into subdirectories)
4. For each `.md` file, read the file content and extract YAML frontmatter using a hand-rolled parser (split on `---` delimiters, parse the YAML block with a simple key-value extractor). No external dependency needed — frontmatter is flat key-value pairs, not nested YAML.
5. Build a `SkillEntry` with:
   - `category` = directory name
   - `name` = filename stem (without `.md`)
   - `id` = `{category}/{name}`
   - `description` = frontmatter `description` field, or empty string if missing/malformed
   - `filePath` = absolute path
   - `sourceId` = the source's `id`
6. Insert into `Map<string, SkillEntry>` keyed by `id`. Higher-priority sources overwrite lower-priority entries.

**Content loading:** `scan()` reads full file content to extract frontmatter but caches only the `SkillEntry` metadata. `getSkill()` re-reads the file from `filePath` on demand (files are small Markdown, no caching needed).

**Malformed files:** If a `.md` file has no frontmatter (no `---` delimiters), it is still indexed with an empty description. If the YAML is unparseable, log a warning and use empty description. The file is never skipped — a skill with a bad description is better than a missing skill.

**Tilde expansion:** `buildSkillSources()` expands `~` to `os.homedir()` before passing paths to the registry. The registry itself only accepts absolute paths.

**Concurrency:** `refresh()` is a full re-scan (clear map, re-read all sources). If `refresh()` is called while another scan is in progress, the second call awaits the first — no concurrent scans. Implemented with a simple promise mutex.

## Source Configuration and Paths

### Bundled skills (always present)

- Dev: `path.join(app.getAppPath(), '..', '..', 'skills')` → repo root `skills/`
- Packaged: `path.join(process.resourcesPath, 'skills')`
- Priority: 0 (lowest)
- Source ID: `bundled`

### User skills (always scanned, may be empty)

- Default: `~/.gho-work/skills/`
- Priority: 20 (highest)
- Source ID: `user`

### Marketplace plugins (zero or more)

- Cache: `~/.gho-work/plugins/cache/<registry>/<plugin-name>/<version>/skills/`
- Priority: 10 (middle)
- Source ID: `marketplace:<plugin-name>`
- Discovery: read `~/.gho-work/plugins/installed.json`, add each plugin's `skills/` subdirectory as a source

### Additional paths (configurable)

For power users who want to share Claude Code skills:

- Configured in `~/.gho-work/settings.json`
- Priority: 15 (between marketplace and user)
- Source ID: `additional:<index>`

### Settings file

`~/.gho-work/settings.json`:

```json
{
  "skills.userPath": "~/.gho-work/skills",
  "skills.additionalPaths": [
    "~/.claude/skills",
    "~/.claude/plugins/cache"
  ],
  "plugins.registries": [
    {
      "name": "claude-plugins-official",
      "url": "https://github.com/anthropics/claude-plugins-official"
    }
  ]
}
```

### Dev-time leakage prevention

The bundled path is always explicitly computed from `app.getAppPath()`, never from `process.cwd()` or by walking up directories. The repo's `.claude/skills/` is never on any search path — those are Claude Code skills for developing GHO Work, not agent runtime skills.

## Test Isolation

### 1. Constructor injection

`SkillRegistryImpl` takes its source list as a constructor parameter:

```typescript
class SkillRegistryImpl implements ISkillRegistry {
  constructor(private readonly _sources: SkillSource[]) {}
}
```

Unit tests pass a single source pointing at a test fixtures directory:

```typescript
const registry = new SkillRegistryImpl([
  { id: 'test', priority: 0, basePath: path.join(__dirname, 'fixtures/skills') }
]);
```

No user or marketplace skills leak in.

### 2. E2E tests

The app accepts a `--skills-path` CLI flag that overrides all source discovery. When present, only that single path is used (no user, no marketplace).

**Flag parsing:** `buildSkillSources()` checks `process.argv` for `--skills-path <path>`. If found, it returns a single-element source array and ignores all other configuration. This is the same pattern as the existing `--mock` flag in `MainProcessOptions`.

The E2E test harness passes this flag:

```typescript
const app = await electron.launch({
  args: ['--skills-path', path.join(__dirname, 'fixtures/skills'), '.'],
});
```

### 3. Dev mode guard

In dev mode, log the resolved skill sources at startup:

```
[skills] Scanning 2 source(s):
  [0] bundled: /Users/.../gho-work/skills (priority 0)
  [1] user: /Users/.../.gho-work/skills (priority 20)
```

This makes accidental path resolution bugs immediately visible in the console.

## Integration with AgentServiceImpl

### Before

```typescript
constructor(
  private readonly _sdk: ICopilotSDK,
  private readonly _conversationService: IConversationService | null,
  private readonly _bundledSkillsPath: string,
  private readonly _readContextFiles?: () => Promise<string>,
)

private async _loadSkill(category: string, toolId: string): Promise<string | undefined> {
  const skillPath = path.join(this._bundledSkillsPath, category, `${toolId}.md`);
  try {
    return await fs.readFile(skillPath, 'utf-8');
  } catch {
    return undefined;
  }
}
```

### After

```typescript
constructor(
  private readonly _sdk: ICopilotSDK,
  private readonly _conversationService: IConversationService | null,
  private readonly _skillRegistry: ISkillRegistry,
  private readonly _readContextFiles?: () => Promise<string>,
)

private async _loadSkill(category: string, toolId: string): Promise<string | undefined> {
  return this._skillRegistry.getSkill(category, toolId);
}
```

### In mainProcess.ts

```typescript
// Before
const skillsPath = app.isPackaged ? ... : ...;
const agentService = new AgentServiceImpl(sdk, conversationService, skillsPath);

// After
const skillRegistry = new SkillRegistryImpl(buildSkillSources(app, options));
await skillRegistry.scan();
const agentService = new AgentServiceImpl(sdk, conversationService, skillRegistry);
```

`buildSkillSources()` is a pure function that computes the source list from app state, CLI flags, and user settings. Easy to unit test in isolation.

### buildSkillSources()

```typescript
// packages/agent/src/node/buildSkillSources.ts
function buildSkillSources(options: {
  bundledPath: string;
  userPath?: string;              // default: ~/.gho-work/skills
  additionalPaths?: string[];     // from settings
  installedPlugins?: InstalledPlugin[];  // from installed.json
  overridePath?: string;          // from --skills-path CLI flag
}): SkillSource[]
```

If `overridePath` is set, returns `[{ id: 'override', priority: 0, basePath: overridePath }]` — no other sources.

Otherwise, builds the array from all configured sources with their respective priorities. All paths are absolute (tilde already expanded by the caller).

Lives in `packages/agent/src/node/` because it depends on `os.homedir()` and filesystem conventions, but is a pure function of its inputs (no I/O), so it's trivially testable.

## Marketplace Plugin Support (v1 scope)

### Plugin structure (Claude Code compatible)

```
plugin-name/
  .claude-plugin/
    plugin.json          # { name, description, version, author }
  skills/
    category/
      skill-name.md
```

Only the `skills/` directory is loaded. Other Claude Code plugin features (commands, agents, hooks, MCP servers) are ignored for now — they can be added incrementally.

### Plugin installation

A CLI command or UI action that:

1. Clones the registry repo (or fetches a specific plugin archive)
2. Copies the plugin to `~/.gho-work/plugins/cache/<registry>/<name>/<version>/`
3. Adds an entry to `~/.gho-work/plugins/installed.json`
4. Calls `skillRegistry.refresh()`

### installed.json schema

```json
{
  "plugins": [
    {
      "name": "superpowers",
      "registry": "claude-plugins-official",
      "version": "5.0.1",
      "enabled": true,
      "installedAt": "2026-03-13T10:00:00Z"
    }
  ]
}
```

Each entry maps to a cache path: `~/.gho-work/plugins/cache/{registry}/{name}/{version}/`. The `enabled` flag allows disabling a plugin without uninstalling it.

### Plugin discovery at startup

1. Read `~/.gho-work/plugins/installed.json` (if missing, treat as empty — no plugins)
2. For each entry where `enabled: true`, compute cache path and check if `skills/` subdirectory exists
3. Add each valid `skills/` directory as a marketplace source with priority 10
4. Skip plugins not found on disk (log warning, don't crash)

### Out of scope for v1

- **Auto-update** — users manually update plugins
- **Sandbox/isolation** — skills are Markdown system prompts, not executable code. The agent executes tool calls through the Copilot SDK's standard permission model
- **Non-skill plugin features** — commands, agents, hooks, MCP servers from plugins are ignored
- **Project-level skills** — deferred to a future phase

## Not in scope

- **Project/folder skills** — deferred. Users can add project skill directories via `skills.additionalPaths` as a workaround.
- **Executable plugins** — skills are passive Markdown content injected as system prompts. No sandboxed code execution.
- **Plugin UI** — a settings panel for managing plugins is a future enhancement. For v1, plugins are managed via the settings file and filesystem.
- **File watching** — the registry does not watch for filesystem changes. Users must restart the app or trigger a refresh after adding/modifying skill files. File watching is a future enhancement.
- **Non-skill plugin features** — commands, agents, hooks, MCP servers from Claude Code plugins are ignored for v1.
- **Reading settings.json / installed.json** — `buildSkillSources()` accepts `additionalPaths` and `installedPlugins` options but they are not wired to any file reader yet. Wire when the settings panel and plugin management UI are built (Phase 4, items 5a-5d in IMPLEMENTATION_PLAN.md).
- **Slash command registration** — skills are loaded as system prompts but not yet registered as slash commands in the chat UI. Wire in Phase 4, item 5e.
