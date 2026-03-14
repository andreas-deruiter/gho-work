# Plugin Marketplace Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable users to browse and install Claude-compatible plugins from the official Anthropic marketplace within GHO Work's Settings UI.

**Architecture:** New `IPluginService` in `packages/connectors` orchestrates the full plugin lifecycle (catalog fetch, install, uninstall, enable/disable). Skills flow through the existing `SkillRegistry` at priority 10. MCP servers register in `ConnectorConfigStore` with a `source: "plugin:<name>"` tag. A new Plugins settings page provides Discover/Installed views.

**Tech Stack:** TypeScript, Electron IPC, SQLite (state), GitHub raw API (catalog), git (plugin clone), Zod (IPC validation)

**Spec:** `docs/superpowers/specs/2026-03-14-plugin-marketplace-design.md`

**Worktree:** `.worktrees/plugin-marketplace` (branch: `feature/plugin-marketplace`)

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `packages/base/src/common/pluginTypes.ts` | Shared types: `CatalogEntry`, `InstalledPlugin`, `PluginLocation`, `InstallProgressStatus` |
| `packages/connectors/src/common/pluginService.ts` | `IPluginService` interface + service identifier |
| `packages/connectors/src/common/pluginTypes.ts` | Connector-only types: `PluginManifest`, `MCPServerInlineConfig` (re-exports shared types) |
| `packages/connectors/src/node/pluginServiceImpl.ts` | Full service implementation |
| `packages/connectors/src/node/pluginCatalogFetcher.ts` | HTTP fetch marketplace.json, parse, validate |
| `packages/connectors/src/node/pluginInstaller.ts` | Git clone, cache management, manifest parsing |
| `packages/ui/src/browser/settings/pluginsPage.ts` | Plugins settings page (Discover + Installed views) |
| `packages/ui/src/browser/settings/connectorsPage.ts` | Connectors settings page (MCP server management) |
| `packages/connectors/src/__tests__/pluginService.test.ts` | PluginService unit tests |
| `packages/connectors/src/__tests__/pluginCatalogFetcher.test.ts` | Catalog fetcher unit tests |
| `packages/connectors/src/__tests__/pluginInstaller.test.ts` | Installer unit tests |

### Modified Files

| File | Changes |
|------|---------|
| `packages/base/src/common/types.ts:94-103` | Add `source?: string` to `MCPServerConfig` |
| `packages/base/src/index.ts` | Export new `pluginTypes.ts` |
| `packages/agent/src/common/types.ts:26-39` | Delete duplicate `MCPServerConfig`, add `toSdkMcpConfig()` mapping |
| `packages/agent/src/common/skillRegistry.ts:19-26` | Add `addSource()` and `removeSource()` methods |
| `packages/agent/src/node/skillRegistryImpl.ts:20-30` | Implement `addSource()` and `removeSource()` |
| `packages/agent/src/node/buildSkillSources.ts:3-9` | Import `InstalledPlugin` from `@gho-work/base` instead of local definition |
| `packages/platform/src/ipc/common/ipc.ts:6-61,210-248` | Add plugin IPC channels, connector:add/update, Zod schemas |
| `apps/desktop/src/preload/index.ts:9-62` | Whitelist new plugin + connector IPC channels |
| `packages/electron/src/main/mainProcess.ts` | Wire PluginService, register plugin IPC handlers, add connector:add/update handlers |
| `packages/ui/src/browser/settings/settingsPanel.ts:13-80` | Add Plugins + Connectors tabs to nav |
| `packages/connectors/src/index.ts` | Export new plugin service files |

---

## Chunk 1: Foundation — Types, IPC, and MCP Cleanup

### Task 1: Add shared plugin types to packages/base

**Files:**
- Create: `packages/base/src/common/pluginTypes.ts`
- Modify: `packages/base/src/common/types.ts:94-103`
- Modify: `packages/base/src/index.ts`
- Test: `packages/base/src/__tests__/pluginTypes.test.ts`

- [ ] **Step 1: Write tests for plugin types**

Create `packages/base/src/__tests__/pluginTypes.test.ts` with type-level construction tests verifying `CatalogEntry`, `InstalledPlugin`, `PluginLocation`, and `InstallProgressStatus` can be constructed with all valid shapes. Test both string and object forms of `PluginLocation`, all three discriminated union variants (`github`, `url`, `git-subdir`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/base/src/__tests__/pluginTypes.test.ts`
Expected: FAIL — module `../common/pluginTypes` not found

- [ ] **Step 3: Create pluginTypes.ts**

Create `packages/base/src/common/pluginTypes.ts` with:
- `InstallProgressStatus` type: `'downloading' | 'extracting' | 'registering' | 'done' | 'error'`
- `PluginLocation` discriminated union with `type` field (not `source` — avoids nesting confusion)
- `CatalogEntry` interface with `location` field (not `source`)
- `InstalledPlugin` interface with `name`, `version`, `enabled`, `cachePath`, `installedAt`, `catalogMeta`, `skillCount`, `mcpServerNames`

- [ ] **Step 4: Add `source` field to MCPServerConfig**

In `packages/base/src/common/types.ts`, add `source?: string` to the `MCPServerConfig` interface after the existing fields. Comment: `// undefined = user-added, "plugin:<name>" = plugin-managed`

- [ ] **Step 5: Export from barrel**

Add `export * from './common/pluginTypes'` to the base package barrel export.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run packages/base/src/__tests__/pluginTypes.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/base/
git commit -m "feat(base): add plugin types and source field to MCPServerConfig"
```

---

### Task 2: Unify MCPServerConfig — delete agent duplicate, add mapping function

**Files:**
- Modify: `packages/agent/src/common/types.ts:26-39`
- Create: `packages/agent/src/common/mcpConfigMapping.ts`
- Test: `packages/agent/src/__tests__/mcpConfigMapping.test.ts`

- [ ] **Step 1: Write test for the SDK mapping function**

Create `packages/agent/src/__tests__/mcpConfigMapping.test.ts` testing `toSdkMcpConfig()`:
- Maps stdio config correctly (preserves `command`, `args`, `env`, `cwd`, adds `tools: []`)
- Maps http config correctly (preserves `url`, `headers`, adds `tools: []`)
- Strips `source` field (SDK doesn't understand it)
- Returns `tools: []` always (no filtering in Phase 1)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/agent/src/__tests__/mcpConfigMapping.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create mcpConfigMapping.ts**

Create `packages/agent/src/common/mcpConfigMapping.ts`:
- Define `SdkMcpServerConfig` interface (the SDK-facing shape with `tools: string[]`)
- Export `toSdkMcpConfig(config: MCPServerConfig): SdkMcpServerConfig` that spreads the config, strips `source`, adds `tools: []`

- [ ] **Step 4: Delete duplicate MCPServerConfig from agent/types.ts**

In `packages/agent/src/common/types.ts`:
- Remove the `MCPServerConfig` interface (lines 26-39)
- Add re-export: `export type { MCPServerConfig } from '@gho-work/base'`
- Find all files in `packages/agent/` that import `MCPServerConfig` from this file — they should continue to work via the re-export

- [ ] **Step 5: Update mainProcess.ts MCP bridge to use toSdkMcpConfig**

In `packages/electron/src/main/mainProcess.ts`, find the inline MCP conversion in the `AGENT_SEND_MESSAGE` handler (around lines 374-398). Replace the manual spread-and-add `tools: []` with `toSdkMcpConfig(cfg)`.

Import: `import { toSdkMcpConfig } from '@gho-work/agent/common/mcpConfigMapping'`

- [ ] **Step 6: Run tests and build**

Run: `npx vitest run packages/agent/src/__tests__/mcpConfigMapping.test.ts` — Expected: PASS
Run: `npx turbo build` — Expected: Clean compilation

- [ ] **Step 7: Commit**

```bash
git add packages/agent/src/ packages/electron/src/main/mainProcess.ts
git commit -m "refactor(agent): unify MCPServerConfig, add SDK mapping function"
```

---

### Task 3: Add plugin + connector IPC channels, Zod schemas, preload whitelist

**Files:**
- Modify: `packages/platform/src/ipc/common/ipc.ts:6-61,210-248`
- Modify: `apps/desktop/src/preload/index.ts:9-62`

- [ ] **Step 1: Add IPC channel constants**

In `packages/platform/src/ipc/common/ipc.ts`, add to `IPC_CHANNELS` object after SKILL_* entries:

```ts
// Plugin channels
PLUGIN_CATALOG: 'plugin:catalog',
PLUGIN_INSTALL: 'plugin:install',
PLUGIN_UNINSTALL: 'plugin:uninstall',
PLUGIN_ENABLE: 'plugin:enable',
PLUGIN_DISABLE: 'plugin:disable',
PLUGIN_LIST: 'plugin:list',
PLUGIN_UPDATE: 'plugin:update',
PLUGIN_CHANGED: 'plugin:changed',
PLUGIN_INSTALL_PROGRESS: 'plugin:install-progress',
// Additional connector channels
CONNECTOR_ADD: 'connector:add',
CONNECTOR_UPDATE: 'connector:update',
```

- [ ] **Step 2: Add Zod schemas**

After existing connector schemas, add:
- `PluginNameRequestSchema` — `z.object({ name: z.string() })`
- `PluginCatalogRequestSchema` — `z.object({ forceRefresh: z.boolean().optional() })`
- `PluginInstallProgressSchema` — `z.object({ name, status: z.enum([...]), message })`
- `ConnectorAddRequestSchema` — `z.object({ name, config: MCPServerConfigSchema.extend({ source: z.string().optional() }) })`
- `ConnectorUpdateRequestSchema` — same shape
- `InstalledPluginDTOSchema` — full InstalledPlugin shape for IPC transport
- Update existing `MCPServerConfigSchema` to include `source: z.string().optional()`

- [ ] **Step 3: Whitelist new channels in preload**

In `apps/desktop/src/preload/index.ts`:
- Add all `PLUGIN_*` invoke channels to `ALLOWED_INVOKE_CHANNELS`
- Add `CONNECTOR_ADD`, `CONNECTOR_UPDATE` to `ALLOWED_INVOKE_CHANNELS`
- Add `PLUGIN_CHANGED`, `PLUGIN_INSTALL_PROGRESS` to `ALLOWED_LISTEN_CHANNELS`

- [ ] **Step 4: Build to verify types**

Run: `npx turbo build` — Expected: Clean compilation

- [ ] **Step 5: Commit**

```bash
git add packages/platform/src/ipc/common/ipc.ts apps/desktop/src/preload/index.ts
git commit -m "feat(platform): add plugin and connector IPC channels with Zod schemas"
```

---

### Task 4: Extend SkillRegistry with addSource/removeSource

**Files:**
- Modify: `packages/agent/src/common/skillRegistry.ts:19-26`
- Modify: `packages/agent/src/node/skillRegistryImpl.ts`
- Modify: `packages/agent/src/node/buildSkillSources.ts:3-9`
- Test: extend existing `packages/agent/src/__tests__/skillRegistry.test.ts`

- [ ] **Step 1: Write tests for addSource/removeSource**

Add tests to `packages/agent/src/__tests__/skillRegistry.test.ts`:
- `addSource` adds a source and makes its skills discoverable after `refresh()`
- `removeSource` removes a source and its skills, fires `onDidChangeSkills`
- `removeSource` with non-existent ID does not throw
- `addSource` with duplicate ID does not create duplicates

Use temp directories with fixture `.md` files that have valid frontmatter `description:` fields.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/agent/src/__tests__/skillRegistry.test.ts`
Expected: FAIL — `addSource` is not a function

- [ ] **Step 3: Add methods to ISkillRegistry interface**

In `packages/agent/src/common/skillRegistry.ts`, add:
```ts
addSource(source: SkillSource): void;
removeSource(sourceId: string): void;
```

- [ ] **Step 4: Implement in SkillRegistryImpl**

In `packages/agent/src/node/skillRegistryImpl.ts`:
- `addSource(source)`: push to `_sources` if not duplicate, re-sort by priority
- `removeSource(sourceId)`: splice from `_sources`, delete all skills with matching `sourceId` from `_skills` map, fire `onDidChangeSkills`
- Ensure `_sources` is a mutable `SkillSource[]` (not readonly)

- [ ] **Step 5: Move InstalledPlugin import in buildSkillSources**

In `packages/agent/src/node/buildSkillSources.ts`:
- Change `InstalledPlugin` import to `from '@gho-work/base'`
- Delete the local interface definition (lines 3-9)

- [ ] **Step 6: Run tests and build**

Run: `npx vitest run packages/agent/src/__tests__/skillRegistry.test.ts` — Expected: PASS
Run: `npx turbo build` — Expected: Clean compilation

- [ ] **Step 7: Commit**

```bash
git add packages/agent/src/
git commit -m "feat(agent): add addSource/removeSource to SkillRegistry, move InstalledPlugin to base"
```

---

## Chunk 2: Plugin Service Implementation

### Task 5: Catalog fetcher — HTTP fetch + parse marketplace.json

**Files:**
- Create: `packages/connectors/src/node/pluginCatalogFetcher.ts`
- Test: `packages/connectors/src/__tests__/pluginCatalogFetcher.test.ts`

- [ ] **Step 1: Write tests for catalog fetcher**

Create `packages/connectors/src/__tests__/pluginCatalogFetcher.test.ts`:
- Mock `global.fetch` with `vi.stubGlobal('fetch', mockFetch)`
- Test: parses marketplace.json with multiple plugins, correctly derives `hasSkills` and `hasMcpServers` from component fields
- Test: `hasSkills` is true when `skills` or `commands` field present, false otherwise
- Test: `hasMcpServers` is true when `mcpServers` field present
- Test: throws on network error with user-friendly message
- Test: throws on non-200 response
- Test: resolves relative `source` paths correctly with and without `metadata.pluginRoot`
- Test: maps GitHub/URL/git-subdir source objects to `PluginLocation` variants

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/connectors/src/__tests__/pluginCatalogFetcher.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement catalog fetcher**

Create `packages/connectors/src/node/pluginCatalogFetcher.ts`:
- Default URL: `https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/.claude-plugin/marketplace.json`
- `fetch()` method: HTTP fetch, parse JSON, map each plugin entry to `CatalogEntry`
- `_toEntry()`: maps marketplace plugin entry to `CatalogEntry`, derives `hasSkills`/`hasMcpServers` from presence of `skills`/`commands`/`mcpServers` fields
- `_resolveLocation()`: converts `source` field (string or object) to `PluginLocation`, handling `pluginRoot` prefix for relative paths

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/connectors/src/__tests__/pluginCatalogFetcher.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/connectors/src/node/pluginCatalogFetcher.ts packages/connectors/src/__tests__/pluginCatalogFetcher.test.ts
git commit -m "feat(connectors): add plugin catalog fetcher"
```

---

### Task 6: Plugin installer — git clone, cache, manifest parsing

**Files:**
- Create: `packages/connectors/src/node/pluginInstaller.ts`
- Test: `packages/connectors/src/__tests__/pluginInstaller.test.ts`

- [ ] **Step 1: Write tests for plugin installer**

Create `packages/connectors/src/__tests__/pluginInstaller.test.ts`:
- Test `parseManifest()`: parses valid `.claude-plugin/plugin.json`, returns defaults when missing, auto-discovers `skills/` directory, auto-discovers `.mcp.json`
- Test `parseMcpServers()`: parses inline config, parses `.mcp.json` file path, returns empty map when undefined
- Test `getCachePath()`: returns `cacheDir/name/version`
- Test `countSkills()`: counts SKILL.md files in subdirectories and .md files
- Test `checkGitAvailable()`: does not throw (assumes git is installed in CI/dev)

Use temp directories with real fixture files on disk.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/connectors/src/__tests__/pluginInstaller.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement plugin installer**

Create `packages/connectors/src/node/pluginInstaller.ts`:
- `PluginManifest` and `MCPServerInlineConfig` interfaces
- `getCachePath(name, version)`: returns `path.join(cacheDir, name, version)`
- `checkGitAvailable()`: uses `child_process.execFile('git', ['--version'])` — NOT `exec()` (avoid shell injection per project hook)
- `clonePlugin(entry, destPath)`: dispatches to `_cloneOfficialPlugin` or `_cloneByLocation` based on location type
- `_sparseClone()`: uses `execFile('git', [...args])` for all git operations — no shell
- `_shallowClone()`: uses `execFile('git', ['clone', '--depth', '1', ...])`
- `parseManifest(pluginDir)`: reads `.claude-plugin/plugin.json`, falls back to auto-discovery of `skills/`, `commands/`, `.mcp.json`
- `parseMcpServers(pluginDir, mcpServers)`: handles string (file path) and Record (inline config), returns `Map<string, MCPServerConfig>`
- `countSkills(pluginDir, skillPaths)`: counts SKILL.md in subdirs + .md files
- `deleteCache(name, version)`: removes cache dir and empty parent

**Important:** Use `child_process.execFile` (not `exec`) for all git commands. This avoids shell injection per the project's security hook. Use `spawn` with `stdio: 'pipe'` for streaming output.

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/connectors/src/__tests__/pluginInstaller.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/connectors/src/node/pluginInstaller.ts packages/connectors/src/__tests__/pluginInstaller.test.ts
git commit -m "feat(connectors): add plugin installer with git clone and manifest parsing"
```

---

### Task 7: PluginService — core interface and implementation

**Files:**
- Create: `packages/connectors/src/common/pluginService.ts`
- Create: `packages/connectors/src/common/pluginTypes.ts`
- Create: `packages/connectors/src/node/pluginServiceImpl.ts`
- Modify: `packages/connectors/src/index.ts`
- Test: `packages/connectors/src/__tests__/pluginService.test.ts`

- [ ] **Step 1: Write tests for PluginService lifecycle**

Create `packages/connectors/src/__tests__/pluginService.test.ts`:
- Mock: `PluginCatalogFetcher.fetch()`, `ISkillRegistry` (addSource/removeSource/refresh), `IConnectorConfigStore` (addServer/removeServer/getServers), settings store (get/set)
- Test: `fetchCatalog()` calls fetcher, caches result, fires `onDidChangeCatalog`
- Test: `fetchCatalog(false)` returns cache without re-fetching
- Test: `fetchCatalog(true)` forces re-fetch
- Test: `getCachedCatalog()` returns empty initially, populated after fetch
- Test: `getInstalled()` returns empty initially
- Test: `getPlugin('nonexistent')` returns undefined

Do NOT test install/uninstall here (those require real filesystem/git operations — covered in integration tests).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/connectors/src/__tests__/pluginService.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create plugin service interface**

Create `packages/connectors/src/common/pluginService.ts`:
- `IPluginService` interface extending `IDisposable` with: `fetchCatalog`, `getCachedCatalog`, `install`, `uninstall`, `enable`, `disable`, `update`, `getInstalled`, `getPlugin`, `onDidChangeCatalog`, `onDidChangePlugins`
- Service identifier: `createServiceIdentifier<IPluginService>('IPluginService')`

- [ ] **Step 4: Create connector-specific plugin types**

Create `packages/connectors/src/common/pluginTypes.ts`:
- Re-export shared types from `@gho-work/base`
- Define `PluginManifest` interface (connector-only)
- Define `MCPServerInlineConfig` interface (connector-only)

- [ ] **Step 5: Implement PluginServiceImpl**

Create `packages/connectors/src/node/pluginServiceImpl.ts`:
- Extends `Disposable`, implements `IPluginService`
- Constructor takes: `PluginCatalogFetcher`, `PluginInstaller`, `ISkillRegistry`, `IConnectorConfigStore`, `SettingsStore`
- `_installQueue: Promise<void>` for serializing install operations
- `fetchCatalog()`: fetch via `_fetcher`, cache in `_catalog` and `_settings`
- `install()`: queue via `_installQueue`, delegate to `_doInstall()`
  - `_doInstall()`: lookup catalog → clone → parse manifest → register skills (addSource + refresh) → register MCP (addServer with `source: "plugin:<name>"`) → check MCP conflicts (compare command+args) → persist to settings → fire events
  - Rollback on error: removeSource, removeServer, deleteCache
  - Fire `onInstallProgress` at each stage
- `uninstall()`: queue, delegate to `_doUninstall()`
  - Remove MCP servers → removeSource → delete from state → deleteCache → fire events
- `enable()`/`disable()`: queue, re-register or deregister components
- `update()`: queue, uninstall then install
- `_loadInstalledFromSettings()`: load from `plugin.installed` settings key
- `_saveInstalledToSettings()`: save to `plugin.installed` settings key

- [ ] **Step 6: Export from barrel**

In `packages/connectors/src/index.ts`, export: `IPluginService`, `PluginServiceImpl`, `PluginCatalogFetcher`, `PluginInstaller`, and re-export `pluginTypes`.

- [ ] **Step 7: Run tests and build**

Run: `npx vitest run packages/connectors/src/__tests__/pluginService.test.ts` — Expected: PASS
Run: `npx turbo build` — Expected: Clean compilation

- [ ] **Step 8: Commit**

```bash
git add packages/connectors/src/
git commit -m "feat(connectors): add PluginService with install/uninstall/enable/disable lifecycle"
```

---

## Chunk 3: Main Process Wiring

### Task 8: Wire PluginService and new IPC handlers in main process

**Files:**
- Modify: `packages/electron/src/main/mainProcess.ts`

- [ ] **Step 1: Import and instantiate PluginService**

At the top of `mainProcess.ts`, add imports for `PluginServiceImpl`, `PluginCatalogFetcher`, `PluginInstaller`.

After the existing `mcpClientManager` and `skillRegistry` setup (around lines 310-344), instantiate:
- `pluginCacheDir`: `path.join(userDataPath, 'plugins', 'cache')`
- `pluginFetcher`: `new PluginCatalogFetcher()`
- `pluginInstaller`: `new PluginInstaller(pluginCacheDir)`
- `pluginSettings` adapter: wrap `settingsDb.getSetting()`/`setSetting()`
- `pluginService`: `new PluginServiceImpl(fetcher, installer, skillRegistry, configStore, settings)`

After construction, re-register skill sources for enabled installed plugins (loop over `pluginService.getInstalled()`, call `skillRegistry.addSource()` for each enabled plugin's skill paths).

- [ ] **Step 2: Register plugin IPC handlers**

After the existing skill IPC handlers, add handlers for all `PLUGIN_*` channels:
- `PLUGIN_CATALOG`: `pluginService.fetchCatalog(args?.forceRefresh)`
- `PLUGIN_INSTALL`: `pluginService.install(args.name)`
- `PLUGIN_UNINSTALL`: `pluginService.uninstall(args.name)`
- `PLUGIN_ENABLE`: `pluginService.enable(args.name)`
- `PLUGIN_DISABLE`: `pluginService.disable(args.name)`
- `PLUGIN_LIST`: `pluginService.getInstalled()`
- `PLUGIN_UPDATE`: `pluginService.update(args.name)`

Forward events to renderer:
- `pluginService.onDidChangePlugins` → `PLUGIN_CHANGED`
- `pluginService.onInstallProgress` → `PLUGIN_INSTALL_PROGRESS`

- [ ] **Step 3: Add connector:add and connector:update IPC handlers**

After existing connector handlers:
- `CONNECTOR_ADD`: `configStore.addServer(args.name, args.config)`
- `CONNECTOR_UPDATE`: `configStore.updateServer(args.name, args.config)`

- [ ] **Step 4: Build**

Run: `npx turbo build` — Expected: Clean compilation

- [ ] **Step 5: Commit**

```bash
git add packages/electron/src/main/mainProcess.ts
git commit -m "feat(electron): wire PluginService and new IPC handlers in main process"
```

---

## Chunk 4: UI — Settings Pages

### Task 9: Add Plugins and Connectors tabs to Settings panel

**Files:**
- Modify: `packages/ui/src/browser/settings/settingsPanel.ts:13-80`

- [ ] **Step 1: Update NAV_ITEMS**

Add `{ id: 'plugins', label: 'Plugins' }` and `{ id: 'connectors', label: 'Connectors' }` to the nav items array.

- [ ] **Step 2: Add imports and page creation**

Import `PluginsPage` and `ConnectorsPage`. Add cases in `_showPage` method for `'plugins'` and `'connectors'`.

- [ ] **Step 3: Commit (build will fail until pages exist — expected)**

```bash
git add packages/ui/src/browser/settings/settingsPanel.ts
git commit -m "feat(ui): add Plugins and Connectors tabs to settings navigation"
```

---

### Task 10: Plugins settings page — Discover and Installed views

**Files:**
- Create: `packages/ui/src/browser/settings/pluginsPage.ts`

- [ ] **Step 1: Create PluginsPage**

Follow patterns from `skillsPage.ts` (extends `Disposable`, uses `h()` helper, IPC for data).

Key structure:
- **Constructor**: layout with sub-tab buttons (Discover/Installed), event listeners for `PLUGIN_CHANGED` and `PLUGIN_INSTALL_PROGRESS`
- **`load()`**: invoke `PLUGIN_CATALOG` and `PLUGIN_LIST`
- **`_renderDiscover()`**: search input, category filter chips, 2-column card grid
- **`_createPluginCard(entry)`**: card with name, author, version, description, component badges (MCP/Skills), Install button (or "Installed" badge or progress spinner)
- **`_renderInstalled()`**: list of installed plugins with name, version, badges, description, details (skill count, MCP server names), enable/disable toggle, Uninstall button
- **`_install(name)`**: invoke `PLUGIN_INSTALL`, progress shown via `PLUGIN_INSTALL_PROGRESS` listener
- **`_uninstall(name)`**: invoke `PLUGIN_UNINSTALL`
- **`_toggle(name, enable)`**: invoke `PLUGIN_ENABLE` or `PLUGIN_DISABLE`
- **CSS**: follow existing patterns in project. Check how `skillsPage.ts` handles styling.

- [ ] **Step 2: Build**

Run: `npx turbo build` — May fail until ConnectorsPage exists

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/browser/settings/pluginsPage.ts
git commit -m "feat(ui): add Plugins settings page with Discover and Installed views"
```

---

### Task 11: Connectors settings page

**Files:**
- Create: `packages/ui/src/browser/settings/connectorsPage.ts`

- [ ] **Step 1: Create ConnectorsPage**

Follow same patterns as PluginsPage:
- **Constructor**: event listeners for `CONNECTOR_STATUS_CHANGED` and `CONNECTOR_LIST_CHANGED`
- **`load()`**: invoke `CONNECTOR_LIST`
- **`_render()`**: header with "MCP Servers" title, list of server rows (or empty state)
- **`_createServerRow(server)`**: name, type badge (stdio/http), status dot (connected=green/disconnected=gray/error=red), source badge (if plugin-managed), Connect/Disconnect button, Remove button (user-added only)
- **`_connect(name)`**: invoke `CONNECTOR_CONNECT`
- **`_disconnect(name)`**: invoke `CONNECTOR_DISCONNECT`
- **`_remove(name)`**: invoke `CONNECTOR_REMOVE`

- [ ] **Step 2: Build**

Run: `npx turbo build` — Expected: Clean compilation (all pages now exist)

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/browser/settings/connectorsPage.ts
git commit -m "feat(ui): add Connectors settings page with MCP server management"
```

---

## Chunk 5: Testing and Verification

### Task 12: Integration tests — plugin lifecycle

**Files:**
- Create: `tests/integration/pluginLifecycle.test.ts`

- [ ] **Step 1: Write integration test**

Test using real `PluginServiceImpl` with mocked `PluginCatalogFetcher`, real `SkillRegistryImpl`, mocked `IConnectorConfigStore`, mocked settings store, and real `PluginInstaller` pointed at a temp cache dir:
- `fetchCatalog()` returns entries and caches them
- `getCachedCatalog()` returns cached entries
- `getInstalled()` returns empty initially
- Test that catalog is persistable via settings mock

Do NOT test actual git clone (requires network) — that's for E2E.

- [ ] **Step 2: Run test**

Run: `npx vitest run tests/integration/pluginLifecycle.test.ts` — Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/integration/pluginLifecycle.test.ts
git commit -m "test: add plugin lifecycle integration tests"
```

---

### Task 13: E2E test — Plugins tab navigation

**Files:**
- Create: `tests/e2e/plugins.spec.ts`

- [ ] **Step 1: Write Playwright E2E test**

Using `_electron.launch()`:
- Navigate to Settings → Plugins tab
- Verify Discover and Installed sub-tabs render
- Switch between tabs
- Navigate to Connectors tab, verify it renders
- Take screenshots at each step for self-verification

Note: catalog fetch may fail in test env (no network) — test the UI structure, not the data.

- [ ] **Step 2: Run E2E test**

Run: `npx playwright test tests/e2e/plugins.spec.ts` — Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/plugins.spec.ts
git commit -m "test(e2e): add Plugins and Connectors settings page tests"
```

---

### Task 14: Build verification, lint, and app launch

- [ ] **Step 1: Full build**

Run: `npx turbo build` — Expected: 0 errors

- [ ] **Step 2: Full test suite**

Run: `npx vitest run` — Expected: All new tests pass, pre-existing failures unchanged

- [ ] **Step 3: Lint**

Run: `npx turbo lint` — Expected: 0 new errors

- [ ] **Step 4: Launch app (HARD GATE)**

Run: `npm run desktop:dev`

Verify:
1. Settings opens with 4 tabs: General, Skills, Plugins, Connectors
2. Plugins > Discover loads (may show empty if offline/rate limited)
3. Plugins > Installed shows empty state message
4. Connectors tab shows existing MCP servers (if any) or empty state
5. No console errors related to new code

Take screenshots via Playwright `_electron.launch()` script for self-verification.

- [ ] **Step 5: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: plugin marketplace build verification and cleanup"
```

---

## Task Dependency Graph

```
Task 1 (base types) ─────────────────────────┐
Task 2 (MCP unify) ──────────────────────────┤
Task 3 (IPC channels) ───────────────────────┤
Task 4 (SkillRegistry addSource/removeSource) ┤
                                              ├→ Task 7 (PluginService) → Task 8 (Main process wiring)
Task 5 (Catalog fetcher) ────────────────────┤                                      │
Task 6 (Plugin installer) ───────────────────┘                                      │
                                                                                     ├→ Task 12 (Integration tests)
Task 9 (Settings tabs) ──→ Task 10 (PluginsPage) ──→ Task 11 (ConnectorsPage) ─────┤
                                                                                     ├→ Task 13 (E2E tests)
                                                                                     └→ Task 14 (Final verification)
```

**Parallelizable groups:**
- **Group A** (independent): Tasks 1, 2, 3, 4, 5, 6 — all foundation work, no interdependencies
- **Group B** (depends on A): Tasks 7, 8 — service + wiring
- **Group C** (independent of B): Tasks 9, 10, 11 — UI pages (can build in parallel, only need IPC channels from Task 3)
- **Group D** (depends on B+C): Tasks 12, 13, 14 — testing and verification
