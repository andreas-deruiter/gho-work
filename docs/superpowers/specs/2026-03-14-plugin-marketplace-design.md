# Plugin Marketplace — Design Spec

**Date:** 2026-03-14
**Status:** Draft
**Phase:** 4 (extends skill registry items 5b, 5d)

## Overview

Enable users to browse and install Claude-compatible plugins from the official Anthropic marketplace (`anthropics/claude-plugins-official`) directly within GHO Work's Settings UI. Installed plugins contribute skills to the skill registry and MCP servers to the connector system.

This is Phase 1 of plugin support. Phase 2 (future) adds custom marketplaces and manual install from GitHub URLs/local paths.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Marketplace scope | Official only (Phase 1) | 80+ curated plugins, expand later |
| Plugin components | Skills + MCP servers | Existing infrastructure supports both; hooks/LSP/agents deferred |
| UI location | New "Plugins" tab in Settings | Plugins are distinct from local skills; need room for Discover/Installed views |
| Install flow | Instant install, configure MCP later | Non-blocking; most plugins are skills-only |
| Catalog fetch | HTTP (GitHub raw API) | Lightweight, no git dependency for browsing |
| Plugin install | Git sparse-clone individual plugins | Only fetch what's needed |
| State storage | SQLite for metadata, filesystem for plugin cache | Consistent with existing settings approach |
| MCP integration | Plugin MCP servers appear in Connectors tab | One place to manage all MCP servers |

## Data Model

### Catalog Entry (from marketplace.json)

```ts
interface CatalogEntry {
  name: string;              // "sentry", "github", "figma"
  description: string;
  version: string;
  author?: { name: string; email?: string };
  location: string | PluginLocation;  // where to fetch the plugin
  keywords?: string[];
  category?: string;
  // Derived from catalog JSON (not from manifest — manifest isn't available until install):
  // These are inferred from the marketplace.json entry's component fields (mcpServers, skills, etc.)
  hasSkills: boolean;
  hasMcpServers: boolean;
}

type PluginLocation =
  | { type: 'github'; repo: string; ref?: string }
  | { type: 'url'; url: string; ref?: string }
  | { type: 'git-subdir'; url: string; path: string; ref?: string };
```

Note: `location` (not `source`) to avoid confusion with `MCPServerConfig.source`. The discriminant field within `PluginLocation` is `type` (not `source`) to avoid `entry.location.source` nesting.

### Installed Plugin (TypeScript + SQLite)

```ts
interface InstalledPlugin {
  name: string;
  version: string;
  enabled: boolean;
  cachePath: string;         // ~/.gho-work/plugins/cache/<name>/<version>/
  installedAt: string;       // ISO timestamp
  catalogMeta: CatalogEntry; // original catalog entry for display
  // Computed at runtime from cached plugin files:
  skillCount: number;
  mcpServerNames: string[];  // namespaced keys like "plugin:sentry:sentry-server"
}
```

This replaces the existing `InstalledPlugin` in `packages/agent/src/node/buildSkillSources.ts`. The old type (`{ name, registry, version, enabled, cachePath }`) is superseded — `registry` is no longer needed since Phase 1 only supports the official marketplace.

The `InstalledPlugin` type moves to `packages/connectors/src/common/pluginTypes.ts` (since `connectors` cannot import from `agent`). `buildSkillSources.ts` will import it from `@gho-work/connectors/common`.

Wait — `agent` cannot import from `connectors` (import direction). Instead: the `InstalledPlugin` type definition moves to `packages/base/src/common/pluginTypes.ts` so both `agent` and `connectors` can import it.

SQLite schema:

```sql
CREATE TABLE plugins (
  name        TEXT PRIMARY KEY,
  version     TEXT NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1,
  cachePath   TEXT NOT NULL,
  installedAt TEXT NOT NULL,
  catalogMeta TEXT NOT NULL   -- JSON blob of CatalogEntry
);
```

`skillCount` and `mcpServerNames` are computed at runtime by scanning the cached plugin directory, not stored in SQLite.

### Catalog Cache (SQLite)

```sql
-- Stored as a settings key-value pair in the existing settings table:
-- key: 'plugin.catalog'
-- value: JSON blob of CatalogEntry[]
--
-- key: 'plugin.catalogLastFetched'
-- value: ISO timestamp string
```

No new table needed — reuse the existing settings KV store.

### Plugin Manifest (parsed from cached plugin)

Parsed from `.claude-plugin/plugin.json` in the cached plugin directory. Follows the Claude Code plugin manifest schema:

```ts
interface PluginManifest {
  name: string;
  version?: string;
  description?: string;
  skills?: string | string[];       // path(s) to skill directories, relative to plugin root
  mcpServers?: string | Record<string, MCPServerInlineConfig>;
    // string = path to .mcp.json file relative to plugin root
    // Record = inline MCP server configs (same shape as .mcp.json contents)
  // Future: agents, hooks, lspServers
}

// Inline MCP server config (matches Claude Code's .mcp.json format)
interface MCPServerInlineConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}
```

If no manifest exists, skills are auto-discovered from `skills/` and `commands/` directories, and MCP config from `.mcp.json` — matching Claude Code's convention.

## MCP Improvements

Plugin integration requires several improvements to the existing MCP architecture.

### Unified MCPServerConfig

The existing codebase has two divergent `MCPServerConfig` types. Unify into a single type in `packages/base/src/common/types.ts`:

```ts
interface MCPServerConfig {
  type: 'stdio' | 'http';    // keep existing values — 'http' not 'streamable-http'
  // stdio fields
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  // http fields
  url?: string;
  headers?: Record<string, string>;
  // metadata (new)
  source?: string;  // undefined = user-added, "plugin:<name>" = plugin-managed
}
```

**Migration notes:**
- The `type` field keeps existing values `'stdio' | 'http'` — no change from current codebase. The Zod schema `MCPServerConfigSchema` in `ipc.ts` already validates these.
- The `source` field is optional. Existing `mcp.json` files have no `source` field — the code must treat `undefined` as user-added (backward compatible).
- The Zod schema `MCPServerConfigSchema` must be updated to include `source: z.string().optional()`.

The SDK-facing mapping (adding `tools: string[]`) moves into a dedicated mapping function `toSdkMcpConfig()` in `packages/agent/src/common/mcpConfigMapping.ts`, not a type definition.

The duplicate `MCPServerConfig` type in `packages/agent/src/common/types.ts` (which has `type?: 'local' | 'stdio' | 'http' | 'sse'` and required `tools: string[]`) is deleted. All consumers import from `@gho-work/base` and use `toSdkMcpConfig()` for the SDK-facing shape.

### New IPC Channels for Connectors

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `connector:add` | R→M (invoke) | Add a server config from UI or plugin |
| `connector:update` | R→M (invoke) | Update server config (env vars) |

### ConnectorConfigStore Enhancements

Promote `addServer(name, config)` and `updateServer(name, config)` from agent-tool helpers to proper `IConnectorConfigStore` interface methods. These are currently only callable from within the agent process — they need to be accessible from IPC handlers for both the Plugins UI and the new Connectors settings page.

### Connectors Settings Page

New tab in Settings (alongside General, Skills, Plugins):

- Lists all MCP servers (user-added + plugin-sourced)
- Each server shows: name, type, status indicator, source badge
- Actions: Connect/Disconnect toggle, Configure (env vars), Remove (user-added only)
- Plugin-sourced servers show "Managed by plugin: X" and link to Plugins tab
- "Add Server" button for manual stdio/http config
- Live updates via `connector:status-changed` and `connector:list-changed` events

## Service Layer

### IPluginService

Lives in `packages/connectors/src/common/pluginService.ts`.

Service identifier: `const IPluginService = createServiceIdentifier<IPluginService>('IPluginService')`.

Instantiated directly in `mainProcess.ts` (like `SkillRegistryImpl`) — not registered in DI container since the main process doesn't use the DI system for service construction.

```ts
interface IPluginService extends IDisposable {
  // Catalog
  fetchCatalog(forceRefresh?: boolean): Promise<CatalogEntry[]>;
  getCachedCatalog(): CatalogEntry[];

  // Install lifecycle
  install(pluginName: string): Promise<void>;
  uninstall(pluginName: string): Promise<void>;
  enable(pluginName: string): Promise<void>;
  disable(pluginName: string): Promise<void>;

  // Query
  getInstalled(): InstalledPlugin[];
  getPlugin(name: string): InstalledPlugin | undefined;

  // Events
  onDidChangeCatalog: Event<CatalogEntry[]>;
  onDidChangePlugins: Event<InstalledPlugin[]>;
}
```

### Install Flow

```
install("sentry")
  1. Look up CatalogEntry from cached catalog
  2. Resolve source → GitHub repo URL
  3. Git sparse-clone plugin directory to temp
  4. Copy to ~/.gho-work/plugins/cache/sentry/<version>/
  5. Parse .claude-plugin/plugin.json (or auto-discover components)
  6. Check for MCP server conflicts:
     - Compare by command+args (stdio) or url (http) against existing servers
     - If duplicate found, skip MCP registration with notice
  7. Register skills → add InstalledPlugin to buildSkillSources()
     → SkillRegistry.refresh() picks up new skills at priority 10
  8. Register MCP servers → ConnectorConfigStore.addServer()
     with source: "plugin:<name>" and namespaced key "plugin:<name>:<server>"
     → Servers registered but not auto-connected (may need env config)
  9. Insert row into SQLite plugins table
  10. Fire onDidChangePlugins
```

### Uninstall Flow

```
uninstall("sentry")
  1. Get InstalledPlugin from SQLite
  2. Disconnect any connected MCP servers with source "plugin:sentry"
  3. Remove MCP server configs from ConnectorConfigStore
     → Only removes servers with source: "plugin:sentry"
     → Never touches user-added servers
  4. Remove skill source from SkillRegistry
  5. Delete row from SQLite plugins table
  6. Delete cache directory
  7. Fire onDidChangePlugins
```

### Enable/Disable

Toggle the SQLite `enabled` flag and add/remove skill source + MCP server registrations without touching the cache directory.

## IPC Channels

### Plugin Channels

| Channel | Direction | Payload | Purpose |
|---------|-----------|---------|---------|
| `plugin:catalog` | R→M (invoke) | `{ forceRefresh?: boolean }` | Fetch/return catalog |
| `plugin:install` | R→M (invoke) | `{ name: string }` | Install a plugin |
| `plugin:uninstall` | R→M (invoke) | `{ name: string }` | Uninstall a plugin |
| `plugin:enable` | R→M (invoke) | `{ name: string }` | Enable a disabled plugin |
| `plugin:disable` | R→M (invoke) | `{ name: string }` | Disable a plugin |
| `plugin:list` | R→M (invoke) | — | Return installed plugins |
| `plugin:update` | R→M (invoke) | `{ name: string }` | Update plugin to latest version (atomic uninstall+install) |
| `plugin:changed` | M→R (push) | `InstalledPlugin[]` | State change notification |
| `plugin:install-progress` | M→R (push) | `{ name, status, message }` | Progress during install |

**Install progress status values:**

```ts
type InstallProgressStatus = 'downloading' | 'extracting' | 'registering' | 'done' | 'error';
```

- `message` is always present and user-facing (e.g., "Cloning sentry plugin...", "Registering 3 skills...")
- UI shows a spinner + message text on the plugin card during install

### New Connector Channels

| Channel | Direction | Payload | Purpose |
|---------|-----------|---------|---------|
| `connector:add` | R→M (invoke) | `{ name, config: MCPServerConfig }` | Add server config |
| `connector:update` | R→M (invoke) | `{ name, config: MCPServerConfig }` | Replace server config (full object, not partial) |

### IPC_CHANNELS Constants

All new channels must be added to the `IPC_CHANNELS` object in `packages/platform/src/ipc/common/ipc.ts`:

```ts
// Add to IPC_CHANNELS:
PLUGIN_CATALOG: 'plugin:catalog',
PLUGIN_INSTALL: 'plugin:install',
PLUGIN_UNINSTALL: 'plugin:uninstall',
PLUGIN_ENABLE: 'plugin:enable',
PLUGIN_DISABLE: 'plugin:disable',
PLUGIN_LIST: 'plugin:list',
PLUGIN_UPDATE: 'plugin:update',
PLUGIN_CHANGED: 'plugin:changed',
PLUGIN_INSTALL_PROGRESS: 'plugin:install-progress',
CONNECTOR_ADD: 'connector:add',
CONNECTOR_UPDATE: 'connector:update',
```

### Zod Schemas

Add to `ipc.ts` alongside existing schemas:

```ts
const PluginNameRequestSchema = z.object({ name: z.string() });
const PluginCatalogRequestSchema = z.object({ forceRefresh: z.boolean().optional() });
const PluginInstallProgressSchema = z.object({
  name: z.string(),
  status: z.enum(['downloading', 'extracting', 'registering', 'done', 'error']),
  message: z.string(),
});
const ConnectorAddRequestSchema = z.object({
  name: z.string(),
  config: MCPServerConfigSchema,  // extend existing schema with source field
});
const ConnectorUpdateRequestSchema = z.object({
  name: z.string(),
  config: MCPServerConfigSchema,
});
```

### Preload Whitelist

Add to `apps/desktop/src/preload/index.ts`:

```ts
// ALLOWED_INVOKE_CHANNELS — add:
'plugin:catalog', 'plugin:install', 'plugin:uninstall',
'plugin:enable', 'plugin:disable', 'plugin:list', 'plugin:update',
'connector:add', 'connector:update',

// ALLOWED_LISTEN_CHANNELS — add:
'plugin:changed', 'plugin:install-progress',
```

### Error Responses

IPC invoke handlers return the result directly on success, or throw an error string. The renderer's IPC bridge wraps this in a try/catch. This matches the existing pattern (e.g., `connector:connect` throws on failure). No new error format needed.

## UI Design

### Plugins Settings Page

New file: `packages/ui/src/browser/settings/pluginsPage.ts`

Two sub-views toggled by tab buttons:

**Discover view:**
- Search input with text filtering across name, description, keywords
- Category filter chips (All, Integrations, Code Intelligence, Workflows)
- 2-column card grid showing available plugins
- Each card: name, author, version, description, component badges (MCP/Skills), Install button
- Already-installed plugins show checkmark instead of Install button
- "Last updated: X ago" with manual refresh button
- Auto-refresh catalog on tab open if older than 1 hour

**Installed view:**
- List of installed plugins
- Each entry: name, version, component badges, description, contained skills/MCP servers with status
- Enable/disable toggle per plugin
- "Configure" button for plugins with MCP servers needing env vars → navigates to Connectors tab
- "Uninstall" button
- MCP server status shown inline (connected/disconnected/needs config)

### Connectors Settings Page

New file: `packages/ui/src/browser/settings/connectorsPage.ts`

- List of all configured MCP servers
- Each server: name, type badge (stdio/http), status indicator, source badge (user/plugin:X)
- Connect/Disconnect toggle
- Configure button (env vars form)
- Remove button (user-added only; plugin servers show "Managed by plugin")
- "Add Server" button → inline form for manual stdio/http config

### Settings Panel Changes

Update `settingsPanel.ts` nav to include four tabs: General (rename from Appearance), Skills, Plugins, Connectors.

## File Structure

```
packages/connectors/
  src/common/
    pluginService.ts            # IPluginService interface + service identifier
    pluginTypes.ts              # PluginManifest, PluginLocation, MCPServerInlineConfig
                                # (re-exports InstalledPlugin, CatalogEntry from @gho-work/base)
  src/node/
    pluginServiceImpl.ts        # Full implementation
    pluginCatalogFetcher.ts     # HTTP fetch + parse marketplace.json
    pluginInstaller.ts          # Git clone, cache management, manifest parsing

packages/base/src/common/
    types.ts                    # Add source? to MCPServerConfig
    pluginTypes.ts              # InstalledPlugin, CatalogEntry (shared by agent + connectors)

packages/platform/src/ipc/common/
    ipc.ts                      # Add plugin:* and connector:add/update channels + Zod schemas

packages/electron/src/main/
    mainProcess.ts              # Register plugin:* IPC handlers, wire PluginService
                                # Add connector:add/update handlers

apps/desktop/src/preload/
    index.ts                    # Whitelist new IPC channels

packages/ui/src/browser/settings/
    pluginsPage.ts              # New: Discover + Installed views
    connectorsPage.ts           # New: MCP server management
    settingsPanel.ts            # Add Plugins + Connectors tabs
```

**Import direction** (all valid per architecture rules):
- `connectors` → `platform`, `base`
- `ui` → `platform`, `base` (all connector/plugin interaction via IPC)
- `electron` → all packages

**Not modified:**
- `packages/agent/` — agent receives MCP servers via existing mainProcess.ts bridge; plugin skills flow through SkillRegistry which agent already consumes

## SkillRegistry Changes

The existing `ISkillRegistry` interface has `scan()`, `refresh()`, `list()`, `getSkill()`, `getEntry()` — but no method to add or remove individual sources at runtime. Plugin install/uninstall needs to dynamically modify the source list.

**Add two methods to `ISkillRegistry`:**

```ts
interface ISkillRegistry {
  // ... existing methods ...
  addSource(source: SkillSource): void;
  removeSource(sourceId: string): void;
}
```

- `addSource()` appends to the internal sources array and triggers `refresh()`.
- `removeSource()` removes the source with the matching `id`, removes all skills from that source, and fires `onDidChangeSkills`.

**Move `InstalledPlugin` type to `packages/base/src/common/pluginTypes.ts`** so both `packages/agent` (which owns `buildSkillSources`) and `packages/connectors` (which owns `PluginService`) can import it without violating import direction rules.

## Concurrency

**Install operations are serialized.** `PluginServiceImpl` maintains an internal install queue. If the user clicks Install on two plugins simultaneously, the second waits for the first to complete. This avoids race conditions in SkillRegistry and ConnectorConfigStore. The queue is per-operation-type:
- Install/uninstall/update: serialized (single active operation)
- Catalog fetch: independent (can run concurrently with installs)
- Enable/disable: serialized with install queue (they modify the same registries)

The UI shows a spinner on the waiting plugin card with status "Waiting..." until its turn.

## Git Dependency

Install requires `git` on PATH for cloning plugin repos. If `git` is not available:
- Detection: `PluginServiceImpl` checks for `git` at construction time via `which git`.
- Graceful degradation: `install()` rejects with a user-friendly error: "Git is required to install plugins. Please install Git and try again."
- The Discover view still works (HTTP catalog fetch doesn't need git).
- Future: for plugins with `npm` source type, use `npm install` instead. For Phase 1 (official marketplace with relative paths), all plugins are fetched via git clone of the marketplace repo.

## Known Limitations

1. **Stale SDK sessions:** If a plugin's MCP server is installed/connected mid-conversation, the existing SDK session will not see it. New conversations will. This is a pre-existing limitation of the session caching in `AgentServiceImpl` and is not specific to plugins. Deferred to Phase 2+.

2. **No per-tool filtering:** Plugin MCP servers register with `tools: []` (all tools exposed). Per-tool enable/disable is deferred.

3. **No auto-updates:** Users must manually check for and apply plugin updates. Auto-update support deferred to Phase 2+.

4. **Rename Appearance → General:** Verify no existing E2E tests or navigation anchors reference "Appearance" before renaming. If they do, update them.

## Error Handling

### Install Failures
- **Network error (catalog fetch):** "Failed to load marketplace. Check your connection." + retry button. Cached catalog remains usable.
- **Git clone fails:** Error shown on the specific plugin card. Clean up partial temp files. No state change.
- **Invalid plugin.json:** "Plugin has an invalid manifest." Reject install cleanly.
- **Atomicity:** If any step after download fails (e.g., MCP registration), roll back all prior steps (remove skills, delete cache). No partial installs in SQLite.

### Uninstall Edge Cases
- **MCP server currently connected:** Disconnect first, then remove config, then delete cache.
- **Active skills in running conversation:** Uninstall proceeds. Existing conversations keep their session config. New conversations won't see the skills. Same behavior as current skill disable.
- **MCP conflict with user server:** Only remove servers with `source: "plugin:<name>"`. Never touch user-added servers.

### MCP Server Conflicts on Install
- Compare by `command + args` (stdio) or `url` (http) against existing servers.
- If a user-added server with the same underlying binary/URL exists, skip plugin MCP registration. Show notice: "MCP server already configured — using your existing setup."
- Plugin skills are still installed regardless.

### Catalog Staleness
- Cache catalog in SQLite with `lastFetched` timestamp.
- Auto-refresh on Plugins tab open if older than 1 hour.
- Manual refresh button on Discover view.
- "Last updated: X ago" shown in UI.

### Version Updates (Phase 1)
- No auto-update.
- "Update available" badge shown if catalog version > installed version (semver comparison using simple `major.minor.patch` string split — no external library needed for Phase 1).
- Update = uninstall old + install new (atomic), via the `plugin:update` IPC channel.

### Install Rollback
If any step after download fails (e.g., MCP registration error), roll back in reverse order:
1. Remove MCP servers (if registered in step 8)
2. Remove skill source (if added in step 7)
3. Delete cache directory (if copied in step 4)
4. No SQLite row to remove (written last in step 9)

If rollback itself fails (e.g., permission error deleting cache), log the error and surface it to the user. The plugin will not appear in the installed list (no SQLite row), but a stale cache directory may remain. The user can manually delete `~/.gho-work/plugins/cache/<name>/` if needed.

### Offline Behavior
- Browsing cached catalog works offline.
- Install requires network. Clear error message if offline.

## Testing Strategy

- **Unit tests:** PluginService install/uninstall/enable/disable lifecycle, catalog fetching + caching, manifest parsing, MCP conflict detection
- **Integration tests:** Plugin install → skill appears in SkillRegistry, plugin install → MCP server appears in ConnectorConfigStore, uninstall removes both
- **E2E (Playwright):** Navigate to Plugins tab, see catalog cards, install a plugin, verify it appears in Installed view, verify MCP server appears in Connectors tab, uninstall and verify removal

## Future Work (Phase 2+)

- Custom marketplace support (add marketplace by GitHub repo URL)
- Manual plugin install from GitHub URL or local path
- Auto-updates with version checking
- Plugin agents, hooks, LSP server support
- Per-tool enable/disable for MCP servers
- Stale session refresh (update MCP servers on existing SDK sessions)
