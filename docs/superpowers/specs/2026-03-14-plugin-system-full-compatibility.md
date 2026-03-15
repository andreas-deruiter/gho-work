# Plugin System Full Compatibility Spec

**Date:** 2026-03-14
**Status:** Draft
**Goal:** Make GHO Work's plugin system fully compatible with the Claude Code plugin marketplace so users can discover, install, and use all plugins from any Claude Code marketplace.

---

## 1. Problem Statement

GHO Work has a working plugin infrastructure (catalog fetch, git clone, skill/MCP registration, UI) but it was built against an early draft of the marketplace format. The official Claude Code plugin spec (released with Claude Code 1.0.33+) defines a richer format with additional capabilities. Currently:

1. **Can't parse real marketplace catalogs** — our `PluginCatalogFetcher` expects a different JSON shape than what Claude Code marketplaces produce
2. **Plugin capabilities are incomplete** — we count agents but don't register them, don't support commands, hooks, or settings.json
3. **No skill namespacing** — installed plugins risk name collisions
4. **Only git clone sources** — npm and pip sources aren't supported
5. **Single hardcoded marketplace** — can't add team or community marketplaces

After this work, a user should be able to add any Claude Code marketplace, browse its plugins, install them, and have all their capabilities (skills, commands, agents, hooks, MCP servers) work.

---

## 2. Scope

### In scope (this spec)

| ID | Feature | Priority |
|----|---------|----------|
| A1 | Marketplace format alignment (parse real `marketplace.json`) | P0 |
| A2 | npm source type for plugin installation | P0 |
| A3 | `${CLAUDE_PLUGIN_ROOT}` variable expansion in configs | P0 |
| A4 | Skill/command namespacing (`plugin-name:skill-name`) | P0 |
| B1 | Commands support (`commands/` directory) | P0 |
| B2 | Agent registration (load agent .md files into agent service) | P0 |
| B3 | Hooks engine (parse and execute `hooks/hooks.json`) | P1 |
| B4 | Multiple marketplace support (add/remove/update) | P1 |
| B5 | Local plugin testing (`--plugin-dir` flag) | P1 |
| B6 | Plugin `settings.json` support | P2 |
| B7 | Plugin validation command | P2 |
| B8 | Auto-update at startup | P2 |

### Out of scope

- LSP server support (not relevant — we're not a code editor)
- Output styles
- Managed settings / force-enable (enterprise feature, v2)
- SHA pinning (minor; ref pinning already works)
- pip source type (low demand; npm covers the primary use case)

---

## 3. Design

### 3.1 Marketplace Format Alignment (A1)

**Current state:** `PluginCatalogFetcher` fetches a URL and expects:
```json
{
  "metadata": { "pluginRoot": "plugins" },
  "plugins": [{
    "name": "...",
    "description": "...",
    "version": "...",
    "source": "bare-string-or-object"
  }]
}
```

The `source` field uses a custom `RawSourceObject` type with `source: 'github' | 'url' | 'git-subdir'`.

**Claude Code format:** `.claude-plugin/marketplace.json`:
```json
{
  "name": "marketplace-name",
  "owner": { "name": "...", "email": "..." },
  "metadata": { "pluginRoot": "...", "description": "...", "version": "..." },
  "plugins": [{
    "name": "...",
    "source": "./relative" | { "source": "github", "repo": "..." } | { "source": "npm", "package": "..." },
    "description": "...",
    "version": "...",
    "author": { "name": "..." },
    "category": "...",
    "keywords": [...],
    "tags": [...],
    "commands": "..." | [...],
    "agents": "..." | [...],
    "skills": "..." | [...],
    "hooks": "..." | {...},
    "mcpServers": "..." | {...},
    "strict": true | false
  }]
}
```

**Changes:**

1. **`PluginCatalogFetcher`**: Update `RawMarketplace` to include `name`, `owner`, and extend `RawPlugin` with all Claude Code fields (`source` as string or object with `github`, `url`, `git-subdir`, `npm` variants; `commands`, `agents`, `skills`, `hooks`, `mcpServers`, `strict`, `tags`, `category`, `keywords`).

2. **`CatalogEntry` type** (in `packages/base`): Add fields:
   ```typescript
   export interface CatalogEntry {
     // existing fields...
     name: string;
     description: string;
     version?: string;
     author?: { name: string; email?: string };
     location: string | PluginLocation;
     keywords?: string[];
     category?: string;
     hasSkills: boolean;
     hasMcpServers: boolean;
     // new fields
     hasCommands: boolean;
     hasAgents: boolean;
     hasHooks: boolean;
     tags?: string[];
     homepage?: string;
     repository?: string;
     license?: string;
     strict?: boolean;
     /** Component path overrides from marketplace entry */
     componentPaths?: {
       commands?: string | string[];
       agents?: string | string[];
       skills?: string | string[];
       hooks?: string | object;
       mcpServers?: string | object;
     };
   }
   ```

3. **`PluginLocation`** (in `packages/base`): Add npm variant:
   ```typescript
   export type PluginLocation =
     | { type: 'github'; repo: string; ref?: string; sha?: string }
     | { type: 'url'; url: string; ref?: string; sha?: string }
     | { type: 'git-subdir'; url: string; path: string; ref?: string; sha?: string }
     | { type: 'npm'; package: string; version?: string; registry?: string };
   ```

4. **Marketplace location resolution**: When adding a marketplace by git URL, the catalog fetcher should look for `.claude-plugin/marketplace.json` (Claude Code convention). Keep backward compat with the current raw-URL approach.

5. **`_resolveLocation`**: Handle the new `source: "npm"` variant and map `source: "github"` with `sha` field.

### 3.2 npm Source Type (A2)

**New:** `PluginInstaller.installNpm(packageName, version?, registry?)`

Implementation:
- Create a temp directory
- Run `npm install --prefix <tempDir> <package>@<version>` (with `--registry` if specified)
- The plugin root is at `<tempDir>/node_modules/<package>`
- Copy plugin root to the cache path (same layout as git-cloned plugins)
- Clean up temp directory

The `PluginInstaller.clonePlugin()` method gains a branch for `location.type === 'npm'`.

### 3.3 `${CLAUDE_PLUGIN_ROOT}` Expansion (A3)

Add a utility function in `packages/connectors/src/common/pluginEnv.ts`:

```typescript
export function expandPluginRoot(value: string, pluginRoot: string): string {
  return value.replaceAll('${CLAUDE_PLUGIN_ROOT}', pluginRoot);
}
```

Apply in:
- `PluginServiceImpl._doInstall()` when building `MCPServerConfig` — expand `command`, `args`, `env` values, and `cwd`
- `PluginServiceImpl._doEnable()` — same
- Hook command execution (new hook engine) — expand command strings
- Any plugin script paths

### 3.4 Skill/Command Namespacing (A4)

**Rule:** Plugin skills are prefixed with `<plugin-name>:` to prevent collisions.

Changes:
- `SkillRegistryImpl`: When a source has `id` starting with `plugin:`, prefix all discovered skill IDs with `<plugin-name>:`. The plugin name is extracted from the source ID (`plugin:<name>` → `<name>`).
- UI slash command autocomplete: Show namespaced names (e.g., `/my-plugin:draft-email`)
- Non-plugin skills (bundled, user) keep their current un-namespaced IDs

### 3.5 Commands Support (B1)

**What are commands?** In Claude Code, `commands/` contains markdown files that are user-invocable slash commands. They're simpler than skills — just a `.md` file with optional frontmatter.

**Implementation:**
- `PluginInstaller.parseManifest()`: Auto-discover `commands/` directory (already discovers `skills/` and `agents/`)
- Add `commands` field to `PluginManifest`:
  ```typescript
  interface PluginManifest {
    // existing...
    commands?: string | string[];
  }
  ```
- `PluginInstaller.countCommands()`: Count `.md` files in command directories
- `PluginServiceImpl._doInstall()`: Register command sources alongside skill sources. Commands and skills both go through the SkillRegistry (they're functionally the same — markdown files that define behavior). The difference is naming convention and frontmatter.
- `InstalledPlugin`: Add `commandCount: number`

In practice, commands are treated as skills by the registry. The key difference is:
- `skills/` contains directories with `SKILL.md` files (Claude Code Agent Skills format)
- `commands/` contains flat `.md` files (Claude Code slash command format)

The SkillRegistry already handles both formats (it scans for `.md` files recursively). We just need to register the `commands/` path as an additional source.

### 3.6 Agent Registration (B2)

**Current state:** `PluginInstaller.countAgents()` counts `.md` files in `agents/` but the agent definitions are never loaded or registered.

**Design:**
- Add `IAgentRegistry` concept (or extend the existing agent service)
- Agent `.md` files have frontmatter: `name`, `description`, optional `model`, `tools`, `allowed-tools`
- On plugin install/enable, parse agent files and register them
- Agents appear in the UI (e.g., agent picker, `/agents` command equivalent)
- The agent service can invoke a plugin agent as a subagent

**New interface** in `packages/agent`:
```typescript
export interface PluginAgentDefinition {
  /** Fully qualified name: plugin-name:agent-name */
  id: string;
  /** Display name */
  name: string;
  /** When Claude should invoke this agent */
  description: string;
  /** System prompt (the body of the .md file) */
  systemPrompt: string;
  /** Source plugin name */
  pluginName: string;
  /** Optional model override */
  model?: string;
  /** Optional tool restrictions */
  allowedTools?: string[];
}

export interface IPluginAgentRegistry {
  register(agent: PluginAgentDefinition): void;
  unregister(agentId: string): void;
  getAgents(): PluginAgentDefinition[];
  getAgent(id: string): PluginAgentDefinition | undefined;
}
```

**Registration flow:**
1. `PluginServiceImpl._doInstall()` parses agent `.md` files (frontmatter + body)
2. Calls `pluginAgentRegistration.register(agent)` for each
3. `InstalledPlugin` stores `agentIds: string[]` for cleanup on uninstall/disable
4. The agent service includes plugin agents in context when spawning subagents

**IPC:**
- New channel `PLUGIN_AGENT_LIST` → returns all registered plugin agents
- Forward to renderer for UI display

### 3.7 Hooks Engine (B3)

**What are hooks?** Event handlers that run shell commands, LLM prompts, or agent verifiers in response to lifecycle events (tool use, session start, etc.).

**Plugin hooks location:** `hooks/hooks.json` or inline in `plugin.json`

**Hook format:**
```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Write|Edit",
      "hooks": [{
        "type": "command",
        "command": "${CLAUDE_PLUGIN_ROOT}/scripts/lint.sh"
      }]
    }]
  }
}
```

**Implementation:**

1. **Hook types we support initially:** `command` only. `prompt` and `agent` types are complex and can be added later.

2. **Events we map to our system:**

   | Claude Code Event | GHO Work Equivalent |
   |---|---|
   | `PreToolUse` | Before SDK tool call (requires permission layer — defer) |
   | `PostToolUse` | After tool_call_end agent event |
   | `SessionStart` | Conversation created |
   | `SessionEnd` | App quit / conversation switch |
   | `Stop` | Agent done event |

   For v1, support `PostToolUse` and `SessionStart` — the two most useful hooks.

3. **New service:** `IHookService` in `packages/agent`:
   ```typescript
   export interface HookDefinition {
     event: string;
     matcher?: string;  // regex pattern for tool name matching
     type: 'command';
     command: string;
     timeout?: number;
   }

   export interface IHookService extends IDisposable {
     registerHooks(pluginName: string, hooks: Record<string, HookDefinition[]>): void;
     unregisterHooks(pluginName: string): void;
     fire(event: string, context: HookContext): Promise<void>;
   }
   ```

4. **Hook execution:**
   - `command` type: spawn child process with `${CLAUDE_PLUGIN_ROOT}` expanded
   - stdin receives JSON context (tool name, arguments, result for PostToolUse)
   - stdout/stderr captured and logged
   - Timeout default: 30 seconds
   - Hook failures are logged but don't block the agent

5. **Plugin integration:**
   - `PluginInstaller.parseManifest()`: Read `hooks/hooks.json` if it exists
   - `PluginServiceImpl._doInstall()`: Parse hooks and register with `IHookService`
   - `AgentServiceImpl`: Call `hookService.fire('PostToolUse', ...)` after tool events

### 3.8 Multiple Marketplace Support (B4)

**Current state:** Single hardcoded URL in `PluginCatalogFetcher`.

**Design:**

1. **`IMarketplaceRegistry`** (new, in `packages/connectors`):
   ```typescript
   export interface MarketplaceEntry {
     name: string;
     source: MarketplaceSource;
     owner?: { name: string; email?: string };
     lastUpdated?: string;
   }

   export type MarketplaceSource =
     | { type: 'github'; repo: string; ref?: string }
     | { type: 'url'; url: string }
     | { type: 'local'; path: string };

   export interface IMarketplaceRegistry {
     add(source: MarketplaceSource): Promise<MarketplaceEntry>;
     remove(name: string): Promise<void>;
     update(name: string): Promise<void>;
     updateAll(): Promise<void>;
     list(): MarketplaceEntry[];
     getPlugins(marketplaceName: string): CatalogEntry[];
     getAllPlugins(): CatalogEntry[];
   }
   ```

2. **Storage:** Marketplace entries persisted in global SQLite settings as `plugin.marketplaces` JSON.

3. **Default marketplace:** The official Anthropic marketplace is pre-configured and cannot be removed. Additional marketplaces can be added via Settings > Plugins.

4. **Catalog fetching:** Each marketplace is fetched independently. The `PluginCatalogFetcher` becomes per-marketplace (takes a source, resolves to URL, fetches).

5. **Plugin identity:** Plugins are identified as `<plugin-name>@<marketplace-name>` to handle same-named plugins across marketplaces.

6. **UI changes:**
   - Discover tab: marketplace filter dropdown (or tabs per marketplace)
   - New "Marketplaces" section in plugin settings for add/remove
   - Plugin cards show which marketplace they come from

7. **IPC channels:**
   ```
   MARKETPLACE_LIST     → list configured marketplaces
   MARKETPLACE_ADD      → add a new marketplace
   MARKETPLACE_REMOVE   → remove a marketplace
   MARKETPLACE_UPDATE   → refresh a marketplace's catalog
   ```

### 3.9 Local Plugin Testing (B5)

**Design:**
- App supports `--plugin-dir <path>` CLI flag (parsed in `apps/desktop/src/main/index.ts`)
- On startup, load plugins from specified directories as if they were installed
- Local plugins override marketplace plugins with the same name
- Useful for plugin development

**Implementation:**
- Parse `--plugin-dir` args in main process
- For each path: read manifest, register skills/commands/agents/hooks/MCP servers
- Create `InstalledPlugin` records with `source: 'local'` flag
- These are ephemeral — not persisted to settings

### 3.10 Plugin `settings.json` Support (B6)

**Design:**
- When a plugin is installed and enabled, read `settings.json` from plugin root
- Currently only the `agent` key is supported: `{ "agent": "agent-name" }`
- This sets the default agent for conversations (the plugin's agent is loaded as the primary responder)
- Applied on enable, removed on disable

### 3.11 Plugin Validation (B7)

**Design:**
- New IPC channel `PLUGIN_VALIDATE` that takes a directory path
- Checks: manifest JSON validity, required fields, directory structure, component file existence
- Returns array of errors and warnings
- Exposed in UI as a "Validate" button for local plugin development

---

## 4. Data Model Changes

### `CatalogEntry` (packages/base)

Add fields:
```typescript
hasCommands: boolean;
hasAgents: boolean;
hasHooks: boolean;
tags?: string[];
homepage?: string;
repository?: string;
license?: string;
strict?: boolean;
componentPaths?: { ... };
```

### `PluginLocation` (packages/base)

Add npm variant:
```typescript
| { type: 'npm'; package: string; version?: string; registry?: string }
```

### `InstalledPlugin` (packages/base)

Add fields:
```typescript
commandCount: number;
agentIds: string[];        // registered agent IDs for cleanup
hookCount: number;
marketplaceName?: string;  // which marketplace this came from
source?: 'marketplace' | 'local';  // how it was installed
```

### `PluginManifest` (packages/connectors)

Add fields:
```typescript
commands?: string | string[];
hooks?: string | Record<string, unknown>;
settings?: Record<string, unknown>;
```

### New: `MarketplaceEntry` (packages/connectors)

```typescript
interface MarketplaceEntry {
  name: string;
  source: MarketplaceSource;
  owner?: { name: string; email?: string };
  lastUpdated?: string;
}
```

---

## 5. IPC Channel Changes

### New channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `MARKETPLACE_LIST` | Renderer → Main | List configured marketplaces |
| `MARKETPLACE_ADD` | Renderer → Main | Add a new marketplace by source |
| `MARKETPLACE_REMOVE` | Renderer → Main | Remove a marketplace |
| `MARKETPLACE_UPDATE` | Renderer → Main | Refresh a marketplace catalog |
| `PLUGIN_AGENT_LIST` | Renderer → Main | List registered plugin agents |
| `PLUGIN_VALIDATE` | Renderer → Main | Validate a plugin directory |

### Modified channels

| Channel | Change |
|---------|--------|
| `PLUGIN_CATALOG` | Now returns merged catalog from all marketplaces |
| `PLUGIN_INSTALL` | Now accepts `{ name, marketplace? }` to disambiguate |

---

## 6. UI Changes

### Plugins Page — Discover Tab

- Add marketplace filter (dropdown or chips: "All", "Official", "Team", etc.)
- Plugin cards show marketplace source badge
- New badges: "Commands", "Agents", "Hooks" alongside existing "Skills" and "MCP"
- Card shows `homepage` link if available

### Plugins Page — New "Marketplaces" Section

- List of configured marketplaces with name, owner, plugin count, last updated
- "Add Marketplace" button → dialog for GitHub repo, URL, or local path
- "Refresh" button per marketplace
- "Remove" button (except for official marketplace)

### Plugins Page — Installed Tab

- Show command count, agent count, hook count alongside skill/MCP counts
- Show marketplace name for each plugin
- "Update Available" indicator when marketplace has newer version

---

## 7. Implementation Plan

### Phase A: Marketplace Compatibility (P0)

**Estimated size:** Large (multiple files, new npm installer, type changes across packages)

| Task | Files | Size |
|------|-------|------|
| A1.1 | Update `CatalogEntry` and `PluginLocation` types in `packages/base` | S |
| A1.2 | Update `PluginCatalogFetcher` to parse Claude Code marketplace format | M |
| A1.3 | Update `PluginManifest` with `commands`, `hooks`, `settings` fields | S |
| A1.4 | Update `InstalledPlugin` with new count/metadata fields | S |
| A2.1 | Implement `PluginInstaller.installNpm()` | M |
| A2.2 | Wire npm source into `PluginServiceImpl._doInstall()` | S |
| A3.1 | Create `expandPluginRoot()` utility | S |
| A3.2 | Apply expansion in MCP server registration and hook commands | S |
| A4.1 | Add namespacing to `SkillRegistryImpl` for plugin sources | M |
| A4.2 | Update slash command UI to show namespaced names | S |
| A-test | Unit tests for catalog parsing, npm install, namespacing | M |

### Phase B: Plugin Capabilities (P0-P1)

| Task | Files | Size |
|------|-------|------|
| B1.1 | Auto-discover `commands/` in `parseManifest()`, add `countCommands()` | S |
| B1.2 | Register command sources in `_doInstall()` | S |
| B2.1 | Create `IPluginAgentRegistry` interface and implementation | M |
| B2.2 | Parse agent `.md` files (frontmatter + body) in installer | M |
| B2.3 | Register agents on install/enable, unregister on disable/uninstall | S |
| B2.4 | Wire plugin agents into `AgentServiceImpl` for subagent spawning | M |
| B2.5 | Add `PLUGIN_AGENT_LIST` IPC handler | S |
| B3.1 | Create `IHookService` interface and `HookServiceImpl` | M |
| B3.2 | Parse `hooks/hooks.json` in `parseManifest()` | S |
| B3.3 | Register hooks on install, fire on agent events | M |
| B3.4 | Hook command execution with timeout and logging | M |
| B4.1 | Create `IMarketplaceRegistry` interface and implementation | M |
| B4.2 | Marketplace persistence in settings | S |
| B4.3 | Update `PluginServiceImpl` to work with multiple marketplaces | M |
| B4.4 | Add marketplace IPC handlers | S |
| B4.5 | UI: marketplace management section | M |
| B4.6 | UI: marketplace filter in discover tab | S |
| B5.1 | Parse `--plugin-dir` flag and load local plugins | M |
| B-test | Unit tests for agents, hooks, marketplaces | M |
| B-e2e | Playwright E2E: install plugin from marketplace, verify capabilities | L |

### Phase C: Polish (P2)

| Task | Files | Size |
|------|-------|------|
| C1 | Plugin `settings.json` support | S |
| C2 | Plugin validation command | M |
| C3 | Auto-update at startup | M |
| C4 | Update available indicator in UI | S |

---

## 8. Testing Strategy

### Unit tests (Vitest)

- `PluginCatalogFetcher`: Parse real Claude Code marketplace.json fixtures
- `PluginInstaller`: npm install flow (mock `execFile`)
- `expandPluginRoot()`: variable expansion
- `SkillRegistryImpl`: namespacing for plugin sources
- `HookServiceImpl`: event matching, command execution, timeout
- `IPluginAgentRegistry`: register/unregister/list
- `MarketplaceRegistry`: add/remove/list/merge catalogs

### Integration tests

- Full install flow: fetch catalog → install plugin → verify skills/commands/agents/MCP registered
- Hook execution: install plugin with hooks → trigger tool event → verify hook ran

### E2E tests (Playwright)

- Open Settings > Plugins
- Browse discover tab, search for a plugin
- Install a plugin, verify it appears in installed tab
- Verify plugin skills appear in slash command autocomplete
- Toggle plugin off/on, verify capabilities register/deregister
- Uninstall plugin, verify cleanup

---

## 9. Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Claude Code marketplace format changes | Pin to known working format; the spec is now stable (1.0.33+) |
| npm install in Electron main process blocks UI | Run in worker thread or background task with progress events |
| Hook scripts execute arbitrary code | Hooks only run from explicitly installed plugins; log all execution |
| Plugin name collisions across marketplaces | Use `name@marketplace` as the unique identifier |
| Large plugins slow down startup | Lazy-load plugin capabilities; don't block app launch on plugin initialization |

---

## 10. Decisions (Resolved)

1. **Strict mode:** Support now. When `strict: true` (default), `plugin.json` is authoritative for components; marketplace entry can supplement. When `strict: false`, marketplace entry is the entire definition; conflicting `plugin.json` components cause a load error.

2. **Hook events:** Start with `PostToolUse` + `SessionStart`. Other events added incrementally.

3. **Agent integration:** Full subagents with their own SDK sessions. Plugin agents are first-class subagents that can be invoked by the orchestrator or by the user, with their own system prompt, model, and tool restrictions.

4. **Marketplace UX:** Simple form dialog (GitHub repo URL, git URL, or local path). Not conversational.
