# Connector Simplification Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace SQLite connector storage with JSON config file, remove CLI detection, add agent tools for MCP server management, and simplify the Connectors panel.

**Architecture:** New `ConnectorConfigStore` reads/writes `{userData}/mcp.json` with atomic writes and file watching. `MCPClientManagerImpl` gains a `reconcile()` method that auto-connects/disconnects servers when config changes. Agent tools (`add_mcp_server`, `remove_mcp_server`, `list_mcp_servers`) are pure functions registered with the Copilot SDK session. The Connectors sidebar is stripped to a server list with status dots and connect/disconnect/remove buttons.

**Tech Stack:** TypeScript, Node.js `fs` + `fs.watch`, Vitest, Playwright, Electron IPC

**Spec:** `docs/superpowers/specs/2026-03-13-connector-simplification-design.md`

---

## File Structure

### Files to create

| File | Responsibility |
|------|---------------|
| `packages/connectors/src/common/connectorConfigStore.ts` | `IConnectorConfigStore` interface + service identifier |
| `packages/connectors/src/node/connectorConfigStore.ts` | JSON config store implementation (read/write/watch `mcp.json`) |
| `packages/connectors/src/node/agentTools.ts` | Agent tool handler functions (pure, testable) |
| `packages/connectors/src/__tests__/connectorConfigStore.test.ts` | Unit tests for config store |
| `packages/connectors/src/__tests__/agentTools.test.ts` | Unit tests for agent tools |

### Files to modify

| File | Changes |
|------|---------|
| `packages/base/src/common/types.ts` | Replace `ConnectorConfig` with `MCPServerConfig` + `MCPServerState`, remove `Workspace.connectorOverrides` |
| `packages/connectors/src/common/mcpClientManager.ts` | Update interface: replace `ConnectorConfig` refs with new types, add `reconcile()`, remove `testConnection()` |
| `packages/connectors/src/node/mcpClientManagerImpl.ts` | Depend on config store instead of registry, add `reconcile()`, update `connectServer()` to accept name+config |
| `packages/connectors/src/node/mcpConnection.ts` | Accept `MCPServerConfig` + server name instead of `ConnectorConfig`, map `'http'` → streamable HTTP |
| `packages/connectors/src/index.ts` | Update exports: remove CLI/registry/platform, add config store |
| `packages/platform/src/ipc/common/ipc.ts` | Remove CLI channels/schemas, add CONNECT/DISCONNECT, update CONNECTOR_LIST response |
| `apps/desktop/src/preload/index.ts` | Update whitelist |
| `packages/electron/src/main/mainProcess.ts` | Rewire services, remove CLI handlers, add new IPC handlers, register agent tools |
| `packages/base/src/index.ts` | Remove `platformContext` re-export, add `MCPServerConfig`/`MCPServerState`/`MCPServerStatus` exports |
| `packages/agent/src/common/agent.ts` | Remove `createAuthConversation`, simplify `createSetupConversation` (keep `getInstallContext`) |
| `packages/agent/src/node/agentServiceImpl.ts` | Remove auth conversation, platform context, simplify setup conversation |
| `packages/agent/src/__tests__/installConversation.test.ts` | Rewrite for simplified `createSetupConversation` (no query/platform args) |
| `packages/ui/src/browser/connectors/connectorSidebar.ts` | Remove CLI section, add connect/disconnect/remove buttons |
| `packages/ui/src/browser/connectors/connectorListItem.ts` | Update to use `MCPServerState`, add transport badge and action buttons |
| `packages/ui/src/browser/workbench.ts` | Remove drawer wiring, CLI install/auth handlers, save/delete handlers |
| `packages/ui/src/browser/onboarding/onboardingFlow.ts` | Remove CLI detection step reference (if `cliDetectionStep` is imported) |
| `packages/ui/src/index.ts` | Remove CLI/drawer exports |
| `packages/connectors/src/__tests__/mcpClientManager.test.ts` | Rewrite for new constructor + reconcile |
| `packages/connectors/src/__tests__/mcpConnection.test.ts` | Update for new constructor signature |
| `skills/connectors/setup.md` | Reference agent tools |
| `tests/integration/connectorSetup.test.ts` | Update for simplified setup, remove `CONNECTOR_ADD` reference |
| `packages/ui/src/browser/connectors/connectorListItem.test.ts` | Rewrite for new `ConnectorListItemData` type |
| `packages/ui/src/browser/connectors/connectorSidebar.test.ts` | Rewrite for simplified sidebar |

### Files to delete

| File | Reason |
|------|--------|
| `packages/connectors/src/common/cliDetection.ts` | CLI detection removed |
| `packages/connectors/src/node/cliDetectionImpl.ts` | CLI detection removed |
| `packages/connectors/src/node/mockCLIDetection.ts` | CLI detection removed |
| `packages/connectors/src/common/platformDetection.ts` | CLI detection removed |
| `packages/connectors/src/node/platformDetectionImpl.ts` | CLI detection removed |
| `packages/base/src/common/platformContext.ts` | CLI detection removed |
| `packages/connectors/src/common/connectorRegistry.ts` | Replaced by config store |
| `packages/connectors/src/node/connectorRegistryImpl.ts` | Replaced by config store |
| `packages/ui/src/browser/connectors/cliToolListItem.ts` | CLI UI removed |
| `packages/ui/src/browser/connectors/connectorDrawer.ts` | Drawer removed |
| `packages/ui/src/browser/connectors/connectorConfigForm.ts` | Drawer removed |
| `packages/ui/src/browser/connectors/toolListSection.ts` | Drawer removed |
| `packages/ui/src/browser/connectors/connectorStatusBanner.ts` | Drawer removed |
| `packages/ui/src/browser/onboarding/cliDetectionStep.ts` | CLI detection removed |
| `packages/electron/src/main/connectorMapping.ts` | No longer needed |
| `packages/connectors/src/__tests__/cliDetection.test.ts` | Tests for deleted code |
| `packages/connectors/src/__tests__/platformDetection.test.ts` | Tests for deleted code |
| `packages/connectors/src/__tests__/index.test.ts` | Tests barrel exports (will be rewritten) |
| `packages/ui/src/browser/connectors/cliToolListItem.test.ts` | Tests for deleted widget |
| `packages/ui/src/browser/connectors/connectorDrawer.test.ts` | Tests for deleted widget |
| `packages/ui/src/browser/connectors/connectorConfigForm.test.ts` | Tests for deleted widget |
| `packages/ui/src/browser/connectors/connectorStatusBanner.test.ts` | Tests for deleted widget |
| `packages/ui/src/browser/connectors/toolListSection.test.ts` | Tests for deleted widget |
| `packages/connectors/src/__tests__/connectorRegistry.test.ts` | Tests for deleted code |
| `tests/integration/cli-install.test.ts` | Tests for deleted code |
| `tests/e2e/cli-install.spec.ts` | Tests for deleted code |
| `tests/e2e/cli-tool-install.spec.ts` | Tests for deleted code |

---

## Chunk 1: Types and Config Store

### Task 1: Update core types

**Files:**
- Modify: `packages/base/src/common/types.ts`

- [ ] **Step 1: Replace ConnectorConfig with MCPServerConfig and MCPServerState**

Replace the entire `// --- Connectors ---` section in `packages/base/src/common/types.ts`:

```typescript
// --- Connectors ---

/** Persisted in mcp.json — one entry per server. VS Code-compatible. */
export interface MCPServerConfig {
  type: 'stdio' | 'http';
  command?: string;                    // stdio
  args?: string[];                     // stdio
  env?: Record<string, string>;        // stdio
  cwd?: string;                        // stdio
  url?: string;                        // http
  headers?: Record<string, string>;    // http
}

/** Runtime state — held in memory only. */
export interface MCPServerState {
  name: string;
  config: MCPServerConfig;
  status: 'connected' | 'disconnected' | 'error' | 'initializing';
  error?: string;
}

export type MCPServerStatus = MCPServerState['status'];
```

Also remove `connectorOverrides` from `Workspace`:

```typescript
export interface Workspace {
  id: string;
  name: string;
  rootPath: string;
  memoryFilePaths: string[];
  createdAt: number;
  lastOpenedAt: number;
}
```

Remove the `ServerCapabilities` interface entirely (no longer needed).

Also update `packages/base/src/index.ts` — replace the `platformContext` re-export:

```typescript
// Remove this line:
export * from './common/platformContext.js';
```

The new types (`MCPServerConfig`, `MCPServerState`, `MCPServerStatus`) are already exported via the existing `export * from './common/types.js'` line.

Also delete `packages/base/src/common/platformContext.ts`:

```bash
rm packages/base/src/common/platformContext.ts
```

- [ ] **Step 2: Verify types compile**

Run: `npx turbo build --filter=@gho-work/base`
Expected: Build succeeds (downstream packages will fail — that's expected at this stage)

- [ ] **Step 3: Commit**

```bash
git add packages/base/src/common/types.ts
git commit -m "refactor: replace ConnectorConfig with MCPServerConfig + MCPServerState"
```

---

### Task 2: Create IConnectorConfigStore interface

**Files:**
- Create: `packages/connectors/src/common/connectorConfigStore.ts`

- [ ] **Step 1: Write the interface**

Create `packages/connectors/src/common/connectorConfigStore.ts`:

```typescript
import { createServiceIdentifier } from '@gho-work/base';
import type { IDisposable, Event, MCPServerConfig } from '@gho-work/base';

export interface IConnectorConfigStore extends IDisposable {
  readonly onDidChangeServers: Event<Map<string, MCPServerConfig>>;
  getServers(): Map<string, MCPServerConfig>;
  getServer(name: string): MCPServerConfig | undefined;
  addServer(name: string, config: MCPServerConfig): Promise<void>;
  updateServer(name: string, config: MCPServerConfig): Promise<void>;
  removeServer(name: string): Promise<void>;
  getFilePath(): string;
}

export const IConnectorConfigStore =
  createServiceIdentifier<IConnectorConfigStore>('IConnectorConfigStore');
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p packages/connectors/tsconfig.json`
Expected: Compiles (may have errors in other files — ignore for now)

- [ ] **Step 3: Commit**

```bash
git add packages/connectors/src/common/connectorConfigStore.ts
git commit -m "feat: add IConnectorConfigStore interface"
```

---

### Task 3: Implement ConnectorConfigStoreImpl with TDD

**Files:**
- Create: `packages/connectors/src/__tests__/connectorConfigStore.test.ts`
- Create: `packages/connectors/src/node/connectorConfigStore.ts`

- [ ] **Step 1: Write failing tests for basic read/write**

Create `packages/connectors/src/__tests__/connectorConfigStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { MCPServerConfig } from '@gho-work/base';

// Import after creating the file
import { ConnectorConfigStoreImpl } from '../node/connectorConfigStore.js';

describe('ConnectorConfigStoreImpl', () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-config-'));
    filePath = path.join(tmpDir, 'mcp.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('initialization', () => {
    it('creates mcp.json with empty servers if file does not exist', () => {
      const store = new ConnectorConfigStoreImpl(filePath);
      expect(fs.existsSync(filePath)).toBe(true);
      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(content).toEqual({ servers: {} });
      store.dispose();
    });

    it('reads existing mcp.json on construction', () => {
      const existing: Record<string, MCPServerConfig> = {
        'my-server': { type: 'stdio', command: 'node', args: ['server.js'] },
      };
      fs.writeFileSync(filePath, JSON.stringify({ servers: existing }));

      const store = new ConnectorConfigStoreImpl(filePath);
      const servers = store.getServers();
      expect(servers.size).toBe(1);
      expect(servers.get('my-server')).toEqual(existing['my-server']);
      store.dispose();
    });

    it('returns file path via getFilePath()', () => {
      const store = new ConnectorConfigStoreImpl(filePath);
      expect(store.getFilePath()).toBe(filePath);
      store.dispose();
    });
  });

  describe('getServer()', () => {
    it('returns config for existing server', () => {
      const config: MCPServerConfig = { type: 'stdio', command: 'node', args: ['s.js'] };
      fs.writeFileSync(filePath, JSON.stringify({ servers: { test: config } }));

      const store = new ConnectorConfigStoreImpl(filePath);
      expect(store.getServer('test')).toEqual(config);
      store.dispose();
    });

    it('returns undefined for non-existent server', () => {
      const store = new ConnectorConfigStoreImpl(filePath);
      expect(store.getServer('nope')).toBeUndefined();
      store.dispose();
    });
  });

  describe('addServer()', () => {
    it('adds a server and persists to disk', async () => {
      const store = new ConnectorConfigStoreImpl(filePath);
      const config: MCPServerConfig = { type: 'stdio', command: 'npx', args: ['-y', '@mcp/server'] };

      await store.addServer('new-server', config);

      // In-memory
      expect(store.getServer('new-server')).toEqual(config);
      // On disk
      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(content.servers['new-server']).toEqual(config);
      store.dispose();
    });

    it('throws when server name already exists', async () => {
      fs.writeFileSync(filePath, JSON.stringify({ servers: { existing: { type: 'stdio', command: 'x' } } }));
      const store = new ConnectorConfigStoreImpl(filePath);

      await expect(store.addServer('existing', { type: 'stdio', command: 'y' }))
        .rejects.toThrow('Server already exists: existing');
      store.dispose();
    });

    it('fires onDidChangeServers after add', async () => {
      const store = new ConnectorConfigStoreImpl(filePath);
      const events: Map<string, MCPServerConfig>[] = [];
      store.onDidChangeServers(servers => events.push(servers));

      await store.addServer('s1', { type: 'stdio', command: 'node' });

      expect(events).toHaveLength(1);
      expect(events[0].has('s1')).toBe(true);
      store.dispose();
    });
  });

  describe('updateServer()', () => {
    it('updates an existing server config', async () => {
      fs.writeFileSync(filePath, JSON.stringify({ servers: { s1: { type: 'stdio', command: 'old' } } }));
      const store = new ConnectorConfigStoreImpl(filePath);

      await store.updateServer('s1', { type: 'stdio', command: 'new' });

      expect(store.getServer('s1')?.command).toBe('new');
      store.dispose();
    });

    it('throws when server does not exist', async () => {
      const store = new ConnectorConfigStoreImpl(filePath);

      await expect(store.updateServer('nope', { type: 'stdio', command: 'x' }))
        .rejects.toThrow('Server not found: nope');
      store.dispose();
    });
  });

  describe('removeServer()', () => {
    it('removes a server and persists', async () => {
      fs.writeFileSync(filePath, JSON.stringify({ servers: { s1: { type: 'stdio', command: 'x' } } }));
      const store = new ConnectorConfigStoreImpl(filePath);

      await store.removeServer('s1');

      expect(store.getServer('s1')).toBeUndefined();
      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(content.servers['s1']).toBeUndefined();
      store.dispose();
    });

    it('throws when server does not exist', async () => {
      const store = new ConnectorConfigStoreImpl(filePath);

      await expect(store.removeServer('nope'))
        .rejects.toThrow('Server not found: nope');
      store.dispose();
    });

    it('fires onDidChangeServers after remove', async () => {
      fs.writeFileSync(filePath, JSON.stringify({ servers: { s1: { type: 'stdio', command: 'x' } } }));
      const store = new ConnectorConfigStoreImpl(filePath);
      const events: Map<string, MCPServerConfig>[] = [];
      store.onDidChangeServers(servers => events.push(servers));

      await store.removeServer('s1');

      expect(events).toHaveLength(1);
      expect(events[0].has('s1')).toBe(false);
      store.dispose();
    });
  });

  describe('atomic writes', () => {
    it('writes to .tmp file then renames', async () => {
      const store = new ConnectorConfigStoreImpl(filePath);
      await store.addServer('s1', { type: 'stdio', command: 'x' });

      // .tmp file should not exist after successful write
      expect(fs.existsSync(filePath + '.tmp')).toBe(false);
      // Main file should exist with correct content
      expect(fs.existsSync(filePath)).toBe(true);
      store.dispose();
    });
  });

  describe('corruption handling', () => {
    it('keeps last-known-good config when file is corrupted', () => {
      // Start with valid config
      fs.writeFileSync(filePath, JSON.stringify({ servers: { s1: { type: 'stdio', command: 'x' } } }));
      const store = new ConnectorConfigStoreImpl(filePath);
      expect(store.getServers().size).toBe(1);

      // Corrupt the file
      fs.writeFileSync(filePath, 'not json!!!');

      // Re-read should keep last-known-good
      (store as any)._readFile();
      expect(store.getServers().size).toBe(1);
      store.dispose();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/connectors/src/__tests__/connectorConfigStore.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Write the implementation**

Create `packages/connectors/src/node/connectorConfigStore.ts`:

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Disposable, Emitter } from '@gho-work/base';
import type { Event, MCPServerConfig } from '@gho-work/base';
import type { IConnectorConfigStore } from '../common/connectorConfigStore.js';

export class ConnectorConfigStoreImpl extends Disposable implements IConnectorConfigStore {
  private readonly _onDidChangeServers = this._register(
    new Emitter<Map<string, MCPServerConfig>>(),
  );
  readonly onDidChangeServers: Event<Map<string, MCPServerConfig>> =
    this._onDidChangeServers.event;

  private _servers = new Map<string, MCPServerConfig>();
  private readonly _filePath: string;
  private _watcher: fs.FSWatcher | null = null;
  private _suppressWatcher = false;
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(filePath: string) {
    super();
    this._filePath = filePath;
    this._readFile();

    // If file didn't exist, create default
    if (!fs.existsSync(this._filePath)) {
      this._writeFile();
    }

    this._startWatcher();
  }

  getServers(): Map<string, MCPServerConfig> {
    return new Map(this._servers);
  }

  getServer(name: string): MCPServerConfig | undefined {
    return this._servers.get(name);
  }

  async addServer(name: string, config: MCPServerConfig): Promise<void> {
    if (this._servers.has(name)) {
      throw new Error(`Server already exists: ${name}`);
    }
    this._servers.set(name, config);
    await this._writeFile();
    this._onDidChangeServers.fire(this.getServers());
  }

  async updateServer(name: string, config: MCPServerConfig): Promise<void> {
    if (!this._servers.has(name)) {
      throw new Error(`Server not found: ${name}`);
    }
    this._servers.set(name, config);
    await this._writeFile();
    this._onDidChangeServers.fire(this.getServers());
  }

  async removeServer(name: string): Promise<void> {
    if (!this._servers.has(name)) {
      throw new Error(`Server not found: ${name}`);
    }
    this._servers.delete(name);
    await this._writeFile();
    this._onDidChangeServers.fire(this.getServers());
  }

  getFilePath(): string {
    return this._filePath;
  }

  /** @internal — exposed for testing corruption handling */
  _readFile(): void {
    try {
      if (!fs.existsSync(this._filePath)) {
        return;
      }
      const raw = fs.readFileSync(this._filePath, 'utf-8');
      const parsed = JSON.parse(raw) as { servers?: Record<string, MCPServerConfig> };
      if (parsed.servers && typeof parsed.servers === 'object') {
        this._servers = new Map(Object.entries(parsed.servers));
      }
    } catch (err) {
      console.warn(`[ConnectorConfigStore] Failed to parse ${this._filePath}, keeping last-known-good config:`, err instanceof Error ? err.message : String(err));
      // Keep last-known-good — do not overwrite
    }
  }

  private async _writeFile(): Promise<void> {
    const obj: Record<string, MCPServerConfig> = {};
    for (const [name, config] of this._servers) {
      obj[name] = config;
    }
    const json = JSON.stringify({ servers: obj }, null, 2) + '\n';
    const tmpPath = this._filePath + '.tmp';

    this._suppressWatcher = true;
    try {
      fs.writeFileSync(tmpPath, json, 'utf-8');
      fs.renameSync(tmpPath, this._filePath);
    } finally {
      // Release suppression after a short debounce to avoid
      // double-processing from the file watcher
      setTimeout(() => { this._suppressWatcher = false; }, 100);
    }
  }

  private _startWatcher(): void {
    try {
      const dir = path.dirname(this._filePath);
      const basename = path.basename(this._filePath);
      this._watcher = fs.watch(dir, (eventType, filename) => {
        if (filename !== basename || this._suppressWatcher) {
          return;
        }
        // Debounce rapid changes
        if (this._debounceTimer) {
          clearTimeout(this._debounceTimer);
        }
        this._debounceTimer = setTimeout(() => {
          this._readFile();
          this._onDidChangeServers.fire(this.getServers());
        }, 100);
      });
    } catch (err) {
      console.warn('[ConnectorConfigStore] Could not start file watcher:', err instanceof Error ? err.message : String(err));
    }
  }

  override dispose(): void {
    if (this._watcher) {
      this._watcher.close();
      this._watcher = null;
    }
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    super.dispose();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/connectors/src/__tests__/connectorConfigStore.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/connectors/src/node/connectorConfigStore.ts packages/connectors/src/__tests__/connectorConfigStore.test.ts
git commit -m "feat: implement ConnectorConfigStoreImpl with JSON file persistence"
```

---

## Chunk 2: MCPConnection and MCPClientManager updates

### Task 4: Update MCPConnection to accept MCPServerConfig

**Files:**
- Modify: `packages/connectors/src/node/mcpConnection.ts`
- Modify: `packages/connectors/src/__tests__/mcpConnection.test.ts`

- [ ] **Step 1: Update MCPConnection constructor**

Replace the constructor and `_createTransport` in `packages/connectors/src/node/mcpConnection.ts`:

```typescript
import { Client } from '@modelcontextprotocol/sdk/client';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types';
import { Disposable, Emitter, toDisposable } from '@gho-work/base';
import type { MCPServerConfig, MCPServerStatus, Event } from '@gho-work/base';
import type { ToolInfo } from '../common/mcpClientManager.js';

export class MCPConnection extends Disposable {
  private _client: Client | null = null;
  private _tools: ToolInfo[] = [];
  private _status: MCPServerStatus = 'disconnected';
  private _heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private _missedPings = 0;

  private readonly _onDidChangeStatus = this._register(new Emitter<MCPServerStatus>());
  readonly onDidChangeStatus: Event<MCPServerStatus> = this._onDidChangeStatus.event;

  private readonly _onDidChangeTools = this._register(new Emitter<ToolInfo[]>());
  readonly onDidChangeTools: Event<ToolInfo[]> = this._onDidChangeTools.event;

  constructor(
    private readonly _name: string,
    private readonly _config: MCPServerConfig,
  ) {
    super();
  }

  get status(): MCPServerStatus {
    return this._status;
  }

  // ... connect(), disconnect(), listTools() unchanged ...

  private _createTransport(): StdioClientTransport | StreamableHTTPClientTransport {
    if (this._config.type === 'stdio') {
      return new StdioClientTransport({
        command: this._config.command!,
        args: this._config.args,
        env: this._config.env,
        cwd: this._config.cwd,
      });
    } else {
      // 'http' maps to Streamable HTTP transport (VS Code-compatible)
      return new StreamableHTTPClientTransport(
        new URL(this._config.url!),
        this._config.headers ? { requestInit: { headers: this._config.headers } } : undefined,
      );
    }
  }

  private async _refreshTools(): Promise<void> {
    if (!this._client) {
      return;
    }
    const result = await this._client.listTools();
    this._tools = result.tools.map(t => ({
      name: t.name,
      description: t.description ?? '',
      inputSchema: t.inputSchema as Record<string, unknown> | undefined,
      enabled: true, // All tools enabled — no per-tool config in simplified model
    }));
    this._onDidChangeTools.fire(this._tools);
  }

  // ... rest of class unchanged (connect, disconnect, heartbeat, _setStatus, dispose) ...
  // But _setStatus now uses MCPServerStatus instead of ConnectorConfig['status']
}
```

Key changes:
- Constructor takes `(name: string, config: MCPServerConfig)` instead of `(config: ConnectorConfig)`
- `_createTransport` uses `config.type === 'stdio'` instead of `config.transport === 'stdio'`
- `_createTransport` passes `cwd` for stdio
- `_refreshTools` removes `toolsConfig` filtering — all tools enabled
- All `ConnectorConfig['status']` references become `MCPServerStatus`

- [ ] **Step 2: Update MCPConnection tests**

Update `packages/connectors/src/__tests__/mcpConnection.test.ts`:

Replace the config objects:

```typescript
import type { MCPServerConfig } from '@gho-work/base';

const stdioConfig: MCPServerConfig = {
  type: 'stdio',
  command: 'node',
  args: ['server.js'],
  env: { NODE_ENV: 'test' },
};

const httpConfig: MCPServerConfig = {
  type: 'http',
  url: 'http://localhost:3000/mcp',
  headers: { Authorization: 'Bearer token' },
};
```

Update all `new MCPConnection(stdioConfig)` to `new MCPConnection('test-server', stdioConfig)` and `new MCPConnection(httpConfig)` to `new MCPConnection('test-http', httpConfig)`.

Remove the `toolsConfig filtering` describe block entirely (no longer relevant).

Update the transport test: `this._config.transport === 'stdio'` → `this._config.type === 'stdio'`

- [ ] **Step 3: Run tests**

Run: `npx vitest run packages/connectors/src/__tests__/mcpConnection.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add packages/connectors/src/node/mcpConnection.ts packages/connectors/src/__tests__/mcpConnection.test.ts
git commit -m "refactor: MCPConnection accepts MCPServerConfig + server name"
```

---

### Task 5: Update IMCPClientManager interface and implementation

**Files:**
- Modify: `packages/connectors/src/common/mcpClientManager.ts`
- Modify: `packages/connectors/src/node/mcpClientManagerImpl.ts`
- Modify: `packages/connectors/src/__tests__/mcpClientManager.test.ts`

- [ ] **Step 1: Update the interface**

Replace `packages/connectors/src/common/mcpClientManager.ts`:

```typescript
import { createServiceIdentifier } from '@gho-work/base';
import type { IDisposable, Event, MCPServerConfig, MCPServerStatus } from '@gho-work/base';

export interface ToolInfo {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  enabled: boolean;
}

export interface IMCPClientManager extends IDisposable {
  connectServer(name: string, config: MCPServerConfig): Promise<void>;
  disconnectServer(name: string): Promise<void>;
  disconnectAll(): Promise<void>;
  reconcile(servers: Map<string, MCPServerConfig>): Promise<void>;
  getTools(name: string): Promise<ToolInfo[]>;
  getAllTools(): Promise<Map<string, ToolInfo[]>>;
  getServerStatus(name: string): MCPServerStatus;

  readonly onDidChangeTools: Event<{ serverName: string; tools: ToolInfo[] }>;
  readonly onDidChangeStatus: Event<{ serverName: string; status: MCPServerStatus }>;
}

export const IMCPClientManager = createServiceIdentifier<IMCPClientManager>('IMCPClientManager');
```

Key changes from old interface:
- `connectServer(name, config)` instead of `connectServer(connectorId)` — no registry lookup
- Removed `testConnection()` — no test button in simplified panel
- `reconcile(servers)` added — auto-diff and connect/disconnect
- Events use `serverName` instead of `connectorId`
- Status type is `MCPServerStatus` instead of `ConnectorConfig['status']`

- [ ] **Step 2: Rewrite the implementation**

Replace `packages/connectors/src/node/mcpClientManagerImpl.ts`:

```typescript
import { Disposable, Emitter } from '@gho-work/base';
import type { MCPServerConfig, MCPServerStatus, Event } from '@gho-work/base';
import type { IMCPClientManager, ToolInfo } from '../common/mcpClientManager.js';
import type { IConnectorConfigStore } from '../common/connectorConfigStore.js';
import { MCPConnection } from './mcpConnection.js';

export class MCPClientManagerImpl extends Disposable implements IMCPClientManager {
  private readonly _connections = new Map<string, MCPConnection>();

  private readonly _onDidChangeTools = this._register(
    new Emitter<{ serverName: string; tools: ToolInfo[] }>(),
  );
  readonly onDidChangeTools: Event<{ serverName: string; tools: ToolInfo[] }> =
    this._onDidChangeTools.event;

  private readonly _onDidChangeStatus = this._register(
    new Emitter<{ serverName: string; status: MCPServerStatus }>(),
  );
  readonly onDidChangeStatus: Event<{ serverName: string; status: MCPServerStatus }> =
    this._onDidChangeStatus.event;

  constructor(private readonly _configStore: IConnectorConfigStore) {
    super();
    // Subscribe to config changes and auto-reconcile
    this._register(
      this._configStore.onDidChangeServers((servers) => {
        void this.reconcile(servers);
      }),
    );
  }

  async connectServer(name: string, config: MCPServerConfig): Promise<void> {
    // Disconnect existing connection if present
    const existing = this._connections.get(name);
    if (existing) {
      existing.dispose();
      this._connections.delete(name);
    }

    const conn = new MCPConnection(name, config);
    this._connections.set(name, conn);

    // Forward events
    conn.onDidChangeStatus(status => {
      this._onDidChangeStatus.fire({ serverName: name, status });
    });
    conn.onDidChangeTools(tools => {
      this._onDidChangeTools.fire({ serverName: name, tools });
    });

    try {
      await conn.connect();
    } catch {
      // MCPConnection sets status to 'error' internally — don't rethrow
    }
  }

  async disconnectServer(name: string): Promise<void> {
    const conn = this._connections.get(name);
    if (!conn) {
      return;
    }
    await conn.disconnect();
    conn.dispose();
    this._connections.delete(name);
    this._onDidChangeStatus.fire({ serverName: name, status: 'disconnected' });
  }

  async disconnectAll(): Promise<void> {
    const names = Array.from(this._connections.keys());
    await Promise.all(names.map(name => this.disconnectServer(name)));
  }

  async reconcile(servers: Map<string, MCPServerConfig>): Promise<void> {
    const currentNames = new Set(this._connections.keys());
    const newNames = new Set(servers.keys());

    // Removed servers: disconnect
    for (const name of currentNames) {
      if (!newNames.has(name)) {
        await this.disconnectServer(name);
      }
    }

    // Added or changed servers
    for (const [name, config] of servers) {
      if (!currentNames.has(name)) {
        // New server — connect
        await this.connectServer(name, config);
      } else {
        // Existing server — check if config changed
        const conn = this._connections.get(name)!;
        const currentConfig = (conn as any)._config as MCPServerConfig;
        if (JSON.stringify(currentConfig) !== JSON.stringify(config)) {
          // Config changed — reconnect
          await this.connectServer(name, config);
        }
      }
    }
  }

  async getTools(name: string): Promise<ToolInfo[]> {
    const conn = this._connections.get(name);
    return conn ? conn.listTools() : [];
  }

  async getAllTools(): Promise<Map<string, ToolInfo[]>> {
    const result = new Map<string, ToolInfo[]>();
    for (const [name, conn] of this._connections) {
      result.set(name, conn.listTools());
    }
    return result;
  }

  getServerStatus(name: string): MCPServerStatus {
    const conn = this._connections.get(name);
    return conn?.status ?? 'disconnected';
  }

  override dispose(): void {
    this.disconnectAll().catch(() => {});
    super.dispose();
  }
}
```

- [ ] **Step 3: Rewrite the tests**

Replace `packages/connectors/src/__tests__/mcpClientManager.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MCPServerConfig, MCPServerStatus } from '@gho-work/base';
import type { ToolInfo } from '../common/mcpClientManager.js';
import type { IConnectorConfigStore } from '../common/connectorConfigStore.js';

// --- Mock MCPConnection ---

type StatusListener = (status: MCPServerStatus) => void;
type ToolsListener = (tools: ToolInfo[]) => void;

interface MockMCPConnectionInstance {
  _name: string;
  _config: MCPServerConfig;
  status: MCPServerStatus;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  listTools: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  onDidChangeStatus: (listener: StatusListener) => void;
  onDidChangeTools: (listener: ToolsListener) => void;
  _statusListeners: StatusListener[];
  _toolsListeners: ToolsListener[];
  _fireStatus: (s: MCPServerStatus) => void;
  _fireTools: (t: ToolInfo[]) => void;
}

function createMockConnection(
  name: string,
  config: MCPServerConfig,
  connectImpl?: () => Promise<void>,
): MockMCPConnectionInstance {
  const instance: MockMCPConnectionInstance = {
    _name: name,
    _config: config,
    status: 'disconnected',
    connect: vi.fn().mockImplementation(connectImpl ?? (() => Promise.resolve())),
    disconnect: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockReturnValue([]),
    dispose: vi.fn(),
    onDidChangeStatus: (listener) => { instance._statusListeners.push(listener); },
    onDidChangeTools: (listener) => { instance._toolsListeners.push(listener); },
    _statusListeners: [],
    _toolsListeners: [],
    _fireStatus: (s) => { instance.status = s; instance._statusListeners.forEach(l => l(s)); },
    _fireTools: (t) => { instance._toolsListeners.forEach(l => l(t)); },
  };
  return instance;
}

let lastMockInstance: MockMCPConnectionInstance | null = null;
const mockInstances: MockMCPConnectionInstance[] = [];

vi.mock('../node/mcpConnection.js', () => {
  const MockMCPConnection = vi.fn().mockImplementation((name: string, config: MCPServerConfig) => {
    const inst = createMockConnection(name, config);
    lastMockInstance = inst;
    mockInstances.push(inst);
    return inst;
  });
  return { MCPConnection: MockMCPConnection };
});

import { MCPClientManagerImpl } from '../node/mcpClientManagerImpl.js';
import { MCPConnection } from '../node/mcpConnection.js';

// --- Mock ConfigStore ---

function makeConfigStore(
  servers: Map<string, MCPServerConfig> = new Map(),
): IConnectorConfigStore {
  const listeners: Array<(servers: Map<string, MCPServerConfig>) => void> = [];
  return {
    onDidChangeServers: (listener: (servers: Map<string, MCPServerConfig>) => void) => {
      listeners.push(listener);
      return { dispose: () => {} };
    },
    getServers: () => new Map(servers),
    getServer: (name: string) => servers.get(name),
    addServer: vi.fn(),
    updateServer: vi.fn(),
    removeServer: vi.fn(),
    getFilePath: () => '/tmp/mcp.json',
    dispose: vi.fn(),
  } as unknown as IConnectorConfigStore;
}

const stdioConfig: MCPServerConfig = { type: 'stdio', command: 'node', args: ['server.js'] };

describe('MCPClientManagerImpl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastMockInstance = null;
    mockInstances.length = 0;
    (MCPConnection as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (name: string, config: MCPServerConfig) => {
        const inst = createMockConnection(name, config);
        lastMockInstance = inst;
        mockInstances.push(inst);
        return inst;
      },
    );
  });

  afterEach(() => { vi.clearAllMocks(); });

  describe('connectServer()', () => {
    it('creates MCPConnection with name and config', async () => {
      const store = makeConfigStore();
      const manager = new MCPClientManagerImpl(store);

      await manager.connectServer('test', stdioConfig);

      expect(MCPConnection).toHaveBeenCalledWith('test', stdioConfig);
      expect(lastMockInstance!.connect).toHaveBeenCalledTimes(1);
      manager.dispose();
    });

    it('replaces existing connection for same name', async () => {
      const store = makeConfigStore();
      const manager = new MCPClientManagerImpl(store);

      await manager.connectServer('test', stdioConfig);
      const first = lastMockInstance!;
      await manager.connectServer('test', stdioConfig);

      expect(first.dispose).toHaveBeenCalled();
      expect(MCPConnection).toHaveBeenCalledTimes(2);
      manager.dispose();
    });

    it('does not throw when connection fails', async () => {
      const store = makeConfigStore();
      (MCPConnection as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
        (name: string, config: MCPServerConfig) => {
          const inst = createMockConnection(name, config, () => Promise.reject(new Error('refused')));
          lastMockInstance = inst;
          mockInstances.push(inst);
          return inst;
        },
      );
      const manager = new MCPClientManagerImpl(store);

      await expect(manager.connectServer('test', stdioConfig)).resolves.not.toThrow();
      manager.dispose();
    });
  });

  describe('disconnectServer()', () => {
    it('disconnects and disposes the connection', async () => {
      const store = makeConfigStore();
      const manager = new MCPClientManagerImpl(store);

      await manager.connectServer('test', stdioConfig);
      const conn = lastMockInstance!;
      await manager.disconnectServer('test');

      expect(conn.disconnect).toHaveBeenCalled();
      expect(conn.dispose).toHaveBeenCalled();
      manager.dispose();
    });

    it('is a no-op for unknown name', async () => {
      const store = makeConfigStore();
      const manager = new MCPClientManagerImpl(store);
      await expect(manager.disconnectServer('unknown')).resolves.not.toThrow();
      manager.dispose();
    });

    it('fires status event with disconnected', async () => {
      const store = makeConfigStore();
      const manager = new MCPClientManagerImpl(store);
      const events: Array<{ serverName: string; status: MCPServerStatus }> = [];
      manager.onDidChangeStatus(e => events.push(e));

      await manager.connectServer('test', stdioConfig);
      await manager.disconnectServer('test');

      expect(events).toContainEqual({ serverName: 'test', status: 'disconnected' });
      manager.dispose();
    });
  });

  describe('reconcile()', () => {
    it('connects new servers', async () => {
      const store = makeConfigStore();
      const manager = new MCPClientManagerImpl(store);

      const servers = new Map([['new-server', stdioConfig]]);
      await manager.reconcile(servers);

      expect(MCPConnection).toHaveBeenCalledWith('new-server', stdioConfig);
      manager.dispose();
    });

    it('disconnects removed servers', async () => {
      const store = makeConfigStore();
      const manager = new MCPClientManagerImpl(store);

      await manager.connectServer('old-server', stdioConfig);
      const conn = lastMockInstance!;

      await manager.reconcile(new Map());

      expect(conn.disconnect).toHaveBeenCalled();
      manager.dispose();
    });

    it('reconnects changed servers', async () => {
      const store = makeConfigStore();
      const manager = new MCPClientManagerImpl(store);

      await manager.connectServer('test', stdioConfig);
      const first = lastMockInstance!;

      const newConfig: MCPServerConfig = { type: 'stdio', command: 'node', args: ['new-server.js'] };
      await manager.reconcile(new Map([['test', newConfig]]));

      expect(first.dispose).toHaveBeenCalled();
      expect(MCPConnection).toHaveBeenLastCalledWith('test', newConfig);
      manager.dispose();
    });

    it('leaves unchanged servers alone', async () => {
      const store = makeConfigStore();
      const manager = new MCPClientManagerImpl(store);

      await manager.connectServer('test', stdioConfig);
      const connectCalls = (MCPConnection as unknown as ReturnType<typeof vi.fn>).mock.calls.length;

      await manager.reconcile(new Map([['test', stdioConfig]]));

      // Should not create a new connection
      expect((MCPConnection as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(connectCalls);
      manager.dispose();
    });
  });

  describe('getTools()', () => {
    it('returns tools from active connection', async () => {
      const store = makeConfigStore();
      const manager = new MCPClientManagerImpl(store);
      const tools: ToolInfo[] = [{ name: 'read', description: 'Read', enabled: true }];

      await manager.connectServer('test', stdioConfig);
      lastMockInstance!.listTools.mockReturnValue(tools);

      expect(await manager.getTools('test')).toEqual(tools);
      manager.dispose();
    });

    it('returns empty for unknown name', async () => {
      const store = makeConfigStore();
      const manager = new MCPClientManagerImpl(store);
      expect(await manager.getTools('unknown')).toEqual([]);
      manager.dispose();
    });
  });

  describe('getServerStatus()', () => {
    it('returns status from active connection', async () => {
      const store = makeConfigStore();
      const manager = new MCPClientManagerImpl(store);

      await manager.connectServer('test', stdioConfig);
      lastMockInstance!.status = 'connected';

      expect(manager.getServerStatus('test')).toBe('connected');
      manager.dispose();
    });

    it('returns disconnected for unknown name', () => {
      const store = makeConfigStore();
      const manager = new MCPClientManagerImpl(store);
      expect(manager.getServerStatus('unknown')).toBe('disconnected');
      manager.dispose();
    });
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/connectors/src/__tests__/mcpClientManager.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/connectors/src/common/mcpClientManager.ts packages/connectors/src/node/mcpClientManagerImpl.ts packages/connectors/src/__tests__/mcpClientManager.test.ts
git commit -m "refactor: MCPClientManager uses config store, adds reconcile()"
```

---

## Chunk 3: Agent Tools

### Task 6: Implement agent tool handlers with TDD

**Files:**
- Create: `packages/connectors/src/__tests__/agentTools.test.ts`
- Create: `packages/connectors/src/node/agentTools.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/connectors/src/__tests__/agentTools.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MCPServerConfig, MCPServerStatus } from '@gho-work/base';
import type { IConnectorConfigStore } from '../common/connectorConfigStore.js';
import type { IMCPClientManager } from '../common/mcpClientManager.js';
import {
  handleAddMCPServer,
  handleRemoveMCPServer,
  handleListMCPServers,
} from '../node/agentTools.js';

function makeConfigStore(
  servers: Map<string, MCPServerConfig> = new Map(),
): IConnectorConfigStore {
  return {
    onDidChangeServers: vi.fn() as any,
    getServers: vi.fn().mockReturnValue(new Map(servers)),
    getServer: vi.fn((name: string) => servers.get(name)),
    addServer: vi.fn(),
    updateServer: vi.fn(),
    removeServer: vi.fn(),
    getFilePath: () => '/tmp/mcp.json',
    dispose: vi.fn(),
  } as unknown as IConnectorConfigStore;
}

function makeClientManager(
  statuses: Record<string, MCPServerStatus> = {},
): IMCPClientManager {
  return {
    connectServer: vi.fn(),
    disconnectServer: vi.fn(),
    disconnectAll: vi.fn(),
    reconcile: vi.fn(),
    getTools: vi.fn().mockResolvedValue([]),
    getAllTools: vi.fn().mockResolvedValue(new Map()),
    getServerStatus: vi.fn((name: string) => statuses[name] ?? 'disconnected'),
    onDidChangeTools: vi.fn() as any,
    onDidChangeStatus: vi.fn() as any,
    dispose: vi.fn(),
  } as unknown as IMCPClientManager;
}

describe('Agent Tools', () => {
  describe('handleAddMCPServer', () => {
    it('adds a stdio server', async () => {
      const store = makeConfigStore();
      const result = await handleAddMCPServer(store, {
        name: 'my-server',
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@mcp/server'],
      });

      expect(store.addServer).toHaveBeenCalledWith('my-server', {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@mcp/server'],
      });
      expect(result.success).toBe(true);
    });

    it('adds an http server', async () => {
      const store = makeConfigStore();
      const result = await handleAddMCPServer(store, {
        name: 'remote',
        type: 'http',
        url: 'https://mcp.example.com/sse',
      });

      expect(store.addServer).toHaveBeenCalledWith('remote', {
        type: 'http',
        url: 'https://mcp.example.com/sse',
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty name', async () => {
      const store = makeConfigStore();
      const result = await handleAddMCPServer(store, {
        name: '',
        type: 'stdio',
        command: 'node',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('name');
      expect(store.addServer).not.toHaveBeenCalled();
    });

    it('rejects stdio without command', async () => {
      const store = makeConfigStore();
      const result = await handleAddMCPServer(store, {
        name: 'test',
        type: 'stdio',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('command');
    });

    it('rejects http without url', async () => {
      const store = makeConfigStore();
      const result = await handleAddMCPServer(store, {
        name: 'test',
        type: 'http',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('url');
    });

    it('rejects duplicate name', async () => {
      const existing = new Map([['dup', { type: 'stdio' as const, command: 'x' }]]);
      const store = makeConfigStore(existing);
      (store.addServer as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Server already exists: dup'),
      );

      const result = await handleAddMCPServer(store, {
        name: 'dup',
        type: 'stdio',
        command: 'node',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });

    it('rejects invalid type', async () => {
      const store = makeConfigStore();
      const result = await handleAddMCPServer(store, {
        name: 'test',
        type: 'websocket' as any,
        command: 'node',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('type');
    });
  });

  describe('handleRemoveMCPServer', () => {
    it('removes an existing server', async () => {
      const store = makeConfigStore(new Map([['s1', { type: 'stdio' as const, command: 'x' }]]));
      const result = await handleRemoveMCPServer(store, { name: 's1' });

      expect(store.removeServer).toHaveBeenCalledWith('s1');
      expect(result.success).toBe(true);
    });

    it('rejects empty name', async () => {
      const store = makeConfigStore();
      const result = await handleRemoveMCPServer(store, { name: '' });

      expect(result.success).toBe(false);
      expect(store.removeServer).not.toHaveBeenCalled();
    });

    it('reports error for non-existent server', async () => {
      const store = makeConfigStore();
      (store.removeServer as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Server not found: nope'),
      );

      const result = await handleRemoveMCPServer(store, { name: 'nope' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('handleListMCPServers', () => {
    it('returns servers with status', () => {
      const servers = new Map<string, MCPServerConfig>([
        ['s1', { type: 'stdio', command: 'node' }],
        ['s2', { type: 'http', url: 'https://example.com' }],
      ]);
      const store = makeConfigStore(servers);
      const manager = makeClientManager({ s1: 'connected', s2: 'error' });

      const result = handleListMCPServers(store, manager);

      expect(result.servers).toHaveLength(2);
      expect(result.servers).toContainEqual({
        name: 's1', type: 'stdio', status: 'connected',
      });
      expect(result.servers).toContainEqual({
        name: 's2', type: 'http', status: 'error',
      });
    });

    it('returns empty list when no servers configured', () => {
      const store = makeConfigStore();
      const manager = makeClientManager();

      const result = handleListMCPServers(store, manager);
      expect(result.servers).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/connectors/src/__tests__/agentTools.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Write the implementation**

Create `packages/connectors/src/node/agentTools.ts`:

```typescript
import type { MCPServerConfig } from '@gho-work/base';
import type { IConnectorConfigStore } from '../common/connectorConfigStore.js';
import type { IMCPClientManager } from '../common/mcpClientManager.js';

export interface AddMCPServerParams {
  name: string;
  type: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
}

export interface RemoveMCPServerParams {
  name: string;
}

export interface ToolResult {
  success: boolean;
  message?: string;
  error?: string;
}

export interface ListMCPServersResult {
  servers: Array<{
    name: string;
    type: string;
    status: string;
  }>;
}

export async function handleAddMCPServer(
  configStore: IConnectorConfigStore,
  params: AddMCPServerParams,
): Promise<ToolResult> {
  // Validate name
  if (!params.name || params.name.trim() === '') {
    return { success: false, error: 'Server name is required' };
  }

  // Validate type
  if (params.type !== 'stdio' && params.type !== 'http') {
    return { success: false, error: `Invalid type "${params.type}". Must be "stdio" or "http".` };
  }

  // Validate transport-specific fields
  if (params.type === 'stdio' && !params.command) {
    return { success: false, error: 'stdio servers require a command' };
  }
  if (params.type === 'http' && !params.url) {
    return { success: false, error: 'http servers require a url' };
  }

  // Build config — only include defined fields
  const config: MCPServerConfig = { type: params.type };
  if (params.type === 'stdio') {
    config.command = params.command;
    if (params.args) { config.args = params.args; }
    if (params.env) { config.env = params.env; }
    if (params.cwd) { config.cwd = params.cwd; }
  } else {
    config.url = params.url;
    if (params.headers) { config.headers = params.headers; }
  }

  try {
    await configStore.addServer(params.name.trim(), config);
    return { success: true, message: `Server "${params.name}" added. It will auto-connect.` };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function handleRemoveMCPServer(
  configStore: IConnectorConfigStore,
  params: RemoveMCPServerParams,
): Promise<ToolResult> {
  if (!params.name || params.name.trim() === '') {
    return { success: false, error: 'Server name is required' };
  }

  try {
    await configStore.removeServer(params.name.trim());
    return { success: true, message: `Server "${params.name}" removed.` };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function handleListMCPServers(
  configStore: IConnectorConfigStore,
  clientManager: IMCPClientManager,
): ListMCPServersResult {
  const servers = configStore.getServers();
  const result: ListMCPServersResult['servers'] = [];

  for (const [name, config] of servers) {
    result.push({
      name,
      type: config.type,
      status: clientManager.getServerStatus(name),
    });
  }

  return { servers: result };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/connectors/src/__tests__/agentTools.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/connectors/src/node/agentTools.ts packages/connectors/src/__tests__/agentTools.test.ts
git commit -m "feat: add agent tool handlers for MCP server management"
```

---

## Chunk 4: Delete CLI Detection and Registry

### Task 7: Delete CLI detection files and registry

**Files:**
- Delete: all files listed in "Files to delete" table above

- [ ] **Step 1: Delete CLI detection core files**

```bash
rm packages/connectors/src/common/cliDetection.ts
rm packages/connectors/src/node/cliDetectionImpl.ts
rm packages/connectors/src/node/mockCLIDetection.ts
rm packages/connectors/src/common/platformDetection.ts
rm packages/connectors/src/node/platformDetectionImpl.ts
```

- [ ] **Step 2: Delete connector registry**

```bash
rm packages/connectors/src/common/connectorRegistry.ts
rm packages/connectors/src/node/connectorRegistryImpl.ts
```

- [ ] **Step 3: Delete CLI UI files**

```bash
rm packages/ui/src/browser/connectors/cliToolListItem.ts
rm packages/ui/src/browser/onboarding/cliDetectionStep.ts
```

- [ ] **Step 4: Delete drawer files**

```bash
rm packages/ui/src/browser/connectors/connectorDrawer.ts
rm packages/ui/src/browser/connectors/connectorConfigForm.ts
rm packages/ui/src/browser/connectors/toolListSection.ts
rm packages/ui/src/browser/connectors/connectorStatusBanner.ts
```

- [ ] **Step 5: Delete connector mapping**

```bash
rm packages/electron/src/main/connectorMapping.ts
```

- [ ] **Step 6: Delete associated tests**

```bash
rm packages/connectors/src/__tests__/cliDetection.test.ts
rm packages/connectors/src/__tests__/platformDetection.test.ts
rm packages/connectors/src/__tests__/connectorRegistry.test.ts
rm packages/connectors/src/__tests__/index.test.ts
rm packages/ui/src/browser/connectors/cliToolListItem.test.ts
rm packages/ui/src/browser/connectors/connectorDrawer.test.ts
rm packages/ui/src/browser/connectors/connectorConfigForm.test.ts
rm packages/ui/src/browser/connectors/connectorStatusBanner.test.ts
rm packages/ui/src/browser/connectors/toolListSection.test.ts
rm tests/integration/cli-install.test.ts
rm tests/e2e/cli-install.spec.ts
rm tests/e2e/cli-tool-install.spec.ts
```

- [ ] **Step 7: Commit deletions**

```bash
git add -A
git commit -m "refactor: delete CLI detection, connector registry, drawer, and associated tests"
```

---

### Task 8: Update barrel exports

**Files:**
- Modify: `packages/connectors/src/index.ts`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Update connectors barrel**

Replace `packages/connectors/src/index.ts`:

```typescript
// Service interfaces (common — environment-agnostic)
export { IConnectorConfigStore } from './common/connectorConfigStore.js';
export { IMCPClientManager } from './common/mcpClientManager.js';
export type { ToolInfo } from './common/mcpClientManager.js';

// Node implementations (main process only)
export { ConnectorConfigStoreImpl } from './node/connectorConfigStore.js';
export { MCPClientManagerImpl } from './node/mcpClientManagerImpl.js';

// Agent tools (main process only)
export {
  handleAddMCPServer,
  handleRemoveMCPServer,
  handleListMCPServers,
} from './node/agentTools.js';
export type {
  AddMCPServerParams,
  RemoveMCPServerParams,
} from './node/agentTools.js';
```

- [ ] **Step 2: Update UI barrel**

Replace `packages/ui/src/index.ts`:

```typescript
export { h, addDisposableListener } from './browser/dom.js';
export { Widget } from './browser/widget.js';
export { ThemeService } from './browser/theme.js';
export type { ThemeKind, IThemeService } from './browser/theme.js';
export { Workbench } from './browser/workbench.js';
export { ActivityBar } from './browser/activityBar.js';
export type { ActivityBarItem } from './browser/activityBar.js';
export { Sidebar } from './browser/sidebar.js';
export { StatusBar } from './browser/statusBar.js';
export { ChatPanel } from './browser/chatPanel.js';
export { KeyboardShortcuts } from './browser/keyboardShortcuts.js';
export * from './browser/conversationList.js';
export * from './browser/modelSelector.js';
export { OnboardingFlow } from './browser/onboarding/onboardingFlow.js';
export { ConnectorSidebarWidget } from './browser/connectors/connectorSidebar.js';
export { ConnectorListItemWidget } from './browser/connectors/connectorListItem.js';
```

- [ ] **Step 3: Verify build (expect some errors — downstream will be fixed next)**

Run: `npx turbo build --filter=@gho-work/connectors --filter=@gho-work/ui`
Expected: May fail due to remaining references — that's OK, fixed in next tasks

- [ ] **Step 4: Commit**

```bash
git add packages/connectors/src/index.ts packages/ui/src/index.ts
git commit -m "refactor: update barrel exports — remove CLI/drawer/registry"
```

---

## Chunk 5: IPC, Preload, and Agent Service Updates

### Task 9: Update IPC channels and schemas

**Files:**
- Modify: `packages/platform/src/ipc/common/ipc.ts`

- [ ] **Step 1: Update IPC_CHANNELS — remove CLI, add CONNECT/DISCONNECT**

In the `IPC_CHANNELS` object, remove these entries:
- `CONNECTOR_ADD`, `CONNECTOR_UPDATE`, `CONNECTOR_TEST`, `CONNECTOR_GET_TOOLS`
- `CONNECTOR_TOOLS_CHANGED`
- `CLI_DETECT_ALL`, `CLI_REFRESH`, `CLI_GET_PLATFORM_CONTEXT`
- `CLI_INSTALL`, `CLI_AUTHENTICATE`, `CLI_CREATE_AUTH_CONVERSATION`
- `CLI_TOOLS_CHANGED`
- `ONBOARDING_DETECT_TOOLS`

Add these entries:
```typescript
CONNECTOR_CONNECT: 'connector:connect',
CONNECTOR_DISCONNECT: 'connector:disconnect',
```

Keep: `CONNECTOR_LIST`, `CONNECTOR_REMOVE`, `CONNECTOR_STATUS_CHANGED`, `CONNECTOR_LIST_CHANGED`, `CONNECTOR_SETUP_CONVERSATION`

- [ ] **Step 2: Update schemas**

Remove all CLI schemas:
- `CLIToolStatusSchema`, `CLIDetectResponseSchema`
- `PlatformContextSchema`, `PlatformContextIPC`
- `CLIInstallRequestSchema`, `CLIInstallRequest`, `CLIInstallResponseSchema`, `CLIInstallResponse`
- `CLIAuthenticateRequestSchema`, `CLIAuthenticateRequest`, `CLIAuthenticateResponseSchema`, `CLIAuthenticateResponse`

Remove connector schemas that are no longer needed:
- `ConnectorConfigSchema`, `ConnectorConfigIPC`
- `ConnectorUpdateRequestSchema`, `ConnectorUpdateRequest`
- `ConnectorTestResponseSchema`, `ConnectorTestResponse`
- `ConnectorGetToolsRequestSchema`, `ConnectorGetToolsRequest`
- `ToolInfoSchema`, `ConnectorGetToolsResponseSchema`, `ConnectorGetToolsResponse`
- `ConnectorToolsChangedSchema`, `ConnectorToolsChanged`

Update `ConnectorListResponseSchema` to use the new types:

```typescript
export const MCPServerStateSchema = z.object({
  name: z.string(),
  type: z.enum(['stdio', 'http']),
  status: z.enum(['connected', 'disconnected', 'error', 'initializing']),
  error: z.string().optional(),
});

export const ConnectorListResponseSchema = z.object({
  servers: z.array(MCPServerStateSchema),
});
export type ConnectorListResponse = z.infer<typeof ConnectorListResponseSchema>;
```

Add connect/disconnect schemas:

```typescript
export const ConnectorConnectRequestSchema = z.object({ name: z.string() });
export type ConnectorConnectRequest = z.infer<typeof ConnectorConnectRequestSchema>;

export const ConnectorDisconnectRequestSchema = z.object({ name: z.string() });
export type ConnectorDisconnectRequest = z.infer<typeof ConnectorDisconnectRequestSchema>;
```

Update `ConnectorStatusChangedSchema`:

```typescript
export const ConnectorStatusChangedSchema = z.object({
  name: z.string(),
  status: z.enum(['connected', 'disconnected', 'error', 'initializing']),
  error: z.string().optional(),
});
export type ConnectorStatusChanged = z.infer<typeof ConnectorStatusChangedSchema>;
```

Remove `ToolDetectResponseSchema` and `ToolDetectResponse`.

- [ ] **Step 3: Commit**

```bash
git add packages/platform/src/ipc/common/ipc.ts
git commit -m "refactor: update IPC channels — remove CLI, add CONNECT/DISCONNECT"
```

---

### Task 10: Update preload whitelist

**Files:**
- Modify: `apps/desktop/src/preload/index.ts`

- [ ] **Step 1: Update ALLOWED_INVOKE_CHANNELS**

Replace the ALLOWED_INVOKE_CHANNELS array:

```typescript
const ALLOWED_INVOKE_CHANNELS = [
  IPC_CHANNELS.AGENT_SEND_MESSAGE,
  IPC_CHANNELS.AGENT_CANCEL,
  IPC_CHANNELS.CONVERSATION_LIST,
  IPC_CHANNELS.CONVERSATION_CREATE,
  IPC_CHANNELS.CONVERSATION_GET,
  IPC_CHANNELS.CONVERSATION_DELETE,
  IPC_CHANNELS.CONVERSATION_RENAME,
  IPC_CHANNELS.MODEL_LIST,
  IPC_CHANNELS.MODEL_SELECT,
  IPC_CHANNELS.AUTH_LOGIN,
  IPC_CHANNELS.AUTH_LOGOUT,
  IPC_CHANNELS.AUTH_STATE,
  IPC_CHANNELS.ONBOARDING_CHECK_GH,
  IPC_CHANNELS.ONBOARDING_GH_LOGIN,
  IPC_CHANNELS.ONBOARDING_CHECK_COPILOT,
  IPC_CHANNELS.ONBOARDING_COMPLETE,
  IPC_CHANNELS.ONBOARDING_STATUS,
  IPC_CHANNELS.CONNECTOR_LIST,
  IPC_CHANNELS.CONNECTOR_REMOVE,
  IPC_CHANNELS.CONNECTOR_CONNECT,
  IPC_CHANNELS.CONNECTOR_DISCONNECT,
  IPC_CHANNELS.CONNECTOR_SETUP_CONVERSATION,
];
```

Replace ALLOWED_LISTEN_CHANNELS:

```typescript
const ALLOWED_LISTEN_CHANNELS = [
  IPC_CHANNELS.AGENT_EVENT,
  IPC_CHANNELS.AUTH_STATE_CHANGED,
  IPC_CHANNELS.ONBOARDING_GH_LOGIN_EVENT,
  IPC_CHANNELS.CONNECTOR_STATUS_CHANGED,
  IPC_CHANNELS.CONNECTOR_LIST_CHANGED,
];
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src/preload/index.ts
git commit -m "refactor: update preload whitelist — remove CLI channels, add CONNECT/DISCONNECT"
```

---

### Task 11: Simplify agent service

**Files:**
- Modify: `packages/agent/src/common/agent.ts`
- Modify: `packages/agent/src/node/agentServiceImpl.ts`

- [ ] **Step 1: Simplify IAgentService interface**

Replace `packages/agent/src/common/agent.ts`:

```typescript
import { createServiceIdentifier } from '@gho-work/base';
import type { AgentContext, AgentEvent } from '@gho-work/base';
import type { MCPServerConfig } from './types.js';

export interface IAgentService {
  executeTask(prompt: string, context: AgentContext, mcpServers?: Record<string, MCPServerConfig>): AsyncIterable<AgentEvent>;
  cancelTask(taskId: string): void;
  getActiveTaskId(): string | null;
  createSetupConversation(): Promise<string>;
  getInstallContext(conversationId: string): string | undefined;
}

export const IAgentService = createServiceIdentifier<IAgentService>('IAgentService');
```

Removed: `createAuthConversation`, `query` and `platformContext` params from `createSetupConversation`.
Kept: `getInstallContext` — still used by `executeTask` to prepend system context to setup conversations.

**Note on MCPServerConfig type conflict:** The agent package has its own `MCPServerConfig` in `packages/agent/src/common/types.ts` (with `tools: string[]`, `timeout?`, and additional `type` values like `'local'` and `'sse'`). This is the Copilot SDK's config format and is different from the simpler `MCPServerConfig` in `packages/base/src/common/types.ts` (our persistence format). Keep both — they serve different purposes. The `connectorMapping` function that bridged them is deleted, but `mainProcess.ts` Task 12 Step 3 maps from the base config to the agent config inline.

- [ ] **Step 2: Simplify AgentServiceImpl**

In `packages/agent/src/node/agentServiceImpl.ts`:

- Remove `import type { PlatformContext } from '@gho-work/base';`
- Remove `formatPackageManagers` function
- Remove `_installContexts` map
- Remove `createAuthConversation` method entirely
- Remove `getInstallContext` method entirely
- Simplify `createSetupConversation`:

```typescript
async createSetupConversation(): Promise<string> {
  if (!this._conversationService) {
    throw new Error('Setup conversations require conversation service (no workspace)');
  }

  const setupSkill = await this._loadSkill('connectors', 'setup');
  const systemMessage = setupSkill ?? '';

  const conversation = this._conversationService.createConversation('default');
  this._conversationService.renameConversation(conversation.id, 'Set up connector');
  if (systemMessage) {
    this._installContexts.set(conversation.id, systemMessage);
  }
  return conversation.id;
}
```

Simplified `createSetupConversation` — keep `_installContexts` map (still used by `executeTask` to prepend system context):

```typescript
async createSetupConversation(): Promise<string> {
  if (!this._conversationService) {
    throw new Error('Setup conversations require conversation service (no workspace)');
  }
  const setupSkill = await this._loadSkill('connectors', 'setup');
  const conversation = this._conversationService.createConversation('default');
  this._conversationService.renameConversation(conversation.id, 'Set up connector');
  if (setupSkill) {
    this._installContexts.set(conversation.id, setupSkill);
  }
  return conversation.id;
}
```

Remove `createAuthConversation` method entirely. Remove `formatPackageManagers` function. Remove `PlatformContext` import.

- [ ] **Step 3: Update agent tests**

Rewrite `packages/agent/src/__tests__/installConversation.test.ts`:

- Remove `PlatformContext` import and `MOCK_PLATFORM` constant
- Remove tests that pass `query` and `platformContext` to `createSetupConversation`
- Update remaining tests: `createSetupConversation()` takes no args
- Remove `createAuthConversation` tests if any exist

Update `tests/integration/connectorSetup.test.ts`:
- Remove assertion that setup skill content contains `CONNECTOR_ADD` (now uses agent tools)
- Update any references to the old setup flow

- [ ] **Step 4: Commit**

```bash
git add packages/agent/src/common/agent.ts packages/agent/src/node/agentServiceImpl.ts packages/agent/src/__tests__/installConversation.test.ts tests/integration/connectorSetup.test.ts
git commit -m "refactor: simplify agent service — remove auth conversation, platform context"
```

---

## Chunk 6: Main Process Rewiring

### Task 12: Rewire mainProcess.ts

**Files:**
- Modify: `packages/electron/src/main/mainProcess.ts`

This is the largest single change. The main process needs to:
1. Replace `ConnectorRegistryImpl` + `CLIDetectionServiceImpl` + `PlatformDetectionServiceImpl` with `ConnectorConfigStoreImpl`
2. Replace `MCPClientManagerImpl(registry)` with `MCPClientManagerImpl(configStore)`
3. Remove all CLI IPC handlers
4. Remove `CONNECTOR_ADD`, `CONNECTOR_UPDATE`, `CONNECTOR_TEST`, `CONNECTOR_GET_TOOLS` handlers
5. Add `CONNECTOR_CONNECT` and `CONNECTOR_DISCONNECT` handlers
6. Update `CONNECTOR_LIST` to return `MCPServerState[]` from config store + client manager
7. Update `CONNECTOR_REMOVE` to use config store
8. Register agent tools with SDK session
9. Remove `connectorMapping` import
10. Remove CLI tool context from `AGENT_SEND_MESSAGE` handler
11. Update `CONNECTOR_SETUP_CONVERSATION` (no query/platform args)
12. Remove `ONBOARDING_DETECT_TOOLS` handler

- [ ] **Step 1: Update imports**

Replace connector-related imports:

```typescript
import {
  IConnectorConfigStore,
  IMCPClientManager,
  ConnectorConfigStoreImpl,
  MCPClientManagerImpl,
  handleAddMCPServer,
  handleRemoveMCPServer,
  handleListMCPServers,
} from '@gho-work/connectors';
```

Remove:
- `import { mapConnectorsToSDKConfig } from './connectorMapping.js';`
- All CLI-related imports (`ICLIDetectionService`, `IPlatformDetectionService`, `CLIDetectionServiceImpl`, `MockCLIDetectionService`, `PlatformDetectionServiceImpl`)
- `ConnectorRemoveRequest`, `ConnectorUpdateRequest`, `ConnectorGetToolsRequest` type imports

Add:
```typescript
import type {
  ConnectorConnectRequest,
  ConnectorDisconnectRequest,
} from '@gho-work/platform';
```

- [ ] **Step 2: Replace service instantiation**

Replace the `// --- Connector Services ---` section (lines ~260-308):

```typescript
// --- Connector Services ---
const mcpJsonPath = path.join(
  options?.userDataPath ?? app.getPath('userData'),
  'mcp.json',
);
const configStore = new ConnectorConfigStoreImpl(mcpJsonPath);
const mcpClientManager = new MCPClientManagerImpl(configStore);

services.set(IConnectorConfigStore, configStore);
services.set(IMCPClientManager, mcpClientManager);

// Forward status events to renderer
mcpClientManager.onDidChangeStatus((event) => {
  ipcMainAdapter.sendToRenderer(IPC_CHANNELS.CONNECTOR_STATUS_CHANGED, {
    name: event.serverName,
    status: event.status,
  });
});

// Forward config changes to renderer
configStore.onDidChangeServers(() => {
  ipcMainAdapter.sendToRenderer(IPC_CHANNELS.CONNECTOR_LIST_CHANGED);
});

// Auto-connect all configured servers on startup
void mcpClientManager.reconcile(configStore.getServers()).then(() => {
  console.log(`[main] Reconciled ${configStore.getServers().size} MCP server(s)`);
}).catch((err) => {
  console.error('[main] Error reconciling MCP servers:', err instanceof Error ? err.message : String(err));
});
```

Remove:
- `cliDetectionService` instantiation and `services.set(ICLIDetectionService, ...)`
- `platformDetectionService` instantiation and `services.set(IPlatformDetectionService, ...)`
- `connectorRegistry` instantiation and `services.set(IConnectorRegistry, ...)`
- `globalDb` connector registry block
- `mcpClientManager.onDidChangeTools` forwarding (no CONNECTOR_TOOLS_CHANGED anymore)
- `cliDetectionService.onDidChangeTools` forwarding

- [ ] **Step 3: Update AGENT_SEND_MESSAGE handler**

Remove the CLI tool context block that builds `systemPrompt` from `cliDetectionService.detectAll()` (lines ~316-329). The agent now discovers tools through MCP.

Update the MCP server bridging to use config store directly. Note: the agent's `MCPServerConfig` (in `packages/agent/src/common/types.ts`) has a required `tools: string[]` field and uses `type?: 'local' | 'stdio' | 'http' | 'sse'`. The base `MCPServerConfig` uses `type: 'stdio' | 'http'`. Map between them inline:

```typescript
// Bridge MCP connectors to SDK config
let mcpServers: Record<string, import('@gho-work/agent').MCPServerConfig> | undefined;
const servers = configStore.getServers();
if (servers.size > 0) {
  mcpServers = {};
  for (const [name, config] of servers) {
    if (mcpClientManager.getServerStatus(name) === 'connected') {
      const sdkConfig: import('@gho-work/agent').MCPServerConfig = {
        type: config.type,
        tools: [], // all tools enabled
      };
      if (config.type === 'stdio') {
        sdkConfig.command = config.command;
        sdkConfig.args = config.args;
        sdkConfig.env = config.env;
        sdkConfig.cwd = config.cwd;
      } else {
        sdkConfig.url = config.url;
        sdkConfig.headers = config.headers;
      }
      mcpServers[name] = sdkConfig;
    }
  }
  if (Object.keys(mcpServers).length === 0) {
    mcpServers = undefined;
  }
}
```

- [ ] **Step 4: Replace connector IPC handlers**

Replace the connector IPC handler section:

```typescript
// --- Connector IPC handlers ---

ipcMainAdapter.handle(IPC_CHANNELS.CONNECTOR_LIST, async () => {
  const servers = configStore.getServers();
  const result: Array<{ name: string; type: string; status: string; error?: string }> = [];
  for (const [name, config] of servers) {
    result.push({
      name,
      type: config.type,
      status: mcpClientManager.getServerStatus(name),
    });
  }
  return { servers: result };
});

ipcMainAdapter.handle(IPC_CHANNELS.CONNECTOR_REMOVE, async (...args: unknown[]) => {
  const { name } = args[0] as { name: string };
  await configStore.removeServer(name);
  // Reconciliation auto-disconnects via onDidChangeServers subscription
  return { success: true };
});

ipcMainAdapter.handle(IPC_CHANNELS.CONNECTOR_CONNECT, async (...args: unknown[]) => {
  const { name } = args[0] as ConnectorConnectRequest;
  const config = configStore.getServer(name);
  if (!config) {
    return { success: false, error: `Server not found: ${name}` };
  }
  await mcpClientManager.connectServer(name, config);
  return { success: true };
});

ipcMainAdapter.handle(IPC_CHANNELS.CONNECTOR_DISCONNECT, async (...args: unknown[]) => {
  const { name } = args[0] as ConnectorDisconnectRequest;
  await mcpClientManager.disconnectServer(name);
  return { success: true };
});

ipcMainAdapter.handle(IPC_CHANNELS.CONNECTOR_SETUP_CONVERSATION, async () => {
  try {
    const conversationId = await agentService.createSetupConversation();
    return { conversationId };
  } catch (err) {
    console.error('[mainProcess] Setup conversation failed:', err);
    return { conversationId: '', error: err instanceof Error ? err.message : String(err) };
  }
});
```

Remove all these handlers:
- `CONNECTOR_ADD`, `CONNECTOR_UPDATE`, `CONNECTOR_TEST`, `CONNECTOR_GET_TOOLS`
- `CLI_DETECT_ALL`, `CLI_REFRESH`, `CLI_GET_PLATFORM_CONTEXT`
- `CLI_INSTALL`, `CLI_AUTHENTICATE`, `CLI_CREATE_AUTH_CONVERSATION`
- `ONBOARDING_DETECT_TOOLS`

Remove the `cliDetectionService.onDidChangeTools` event subscription.

- [ ] **Step 5: Register agent tools with SDK session**

After the `agentService` creation, add tool registration:

```typescript
// Register agent tools for MCP server management
// These are available to the agent during conversations
sdk.onSessionCreated?.((session) => {
  session.registerTool?.('add_mcp_server', {
    description: 'Add a new MCP server to the configuration',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Server name (unique identifier)' },
        type: { type: 'string', enum: ['stdio', 'http'], description: 'Transport type' },
        command: { type: 'string', description: 'Command to run (stdio only)' },
        args: { type: 'array', items: { type: 'string' }, description: 'Command arguments (stdio only)' },
        env: { type: 'object', description: 'Environment variables (stdio only)' },
        cwd: { type: 'string', description: 'Working directory (stdio only)' },
        url: { type: 'string', description: 'Server URL (http only)' },
        headers: { type: 'object', description: 'HTTP headers (http only)' },
      },
      required: ['name', 'type'],
    },
    handler: async (params) => handleAddMCPServer(configStore, params as any),
  });

  session.registerTool?.('remove_mcp_server', {
    description: 'Remove an MCP server from the configuration',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Server name to remove' },
      },
      required: ['name'],
    },
    handler: async (params) => handleRemoveMCPServer(configStore, params as any),
  });

  session.registerTool?.('list_mcp_servers', {
    description: 'List all configured MCP servers and their current status',
    parameters: { type: 'object', properties: {} },
    handler: async () => handleListMCPServers(configStore, mcpClientManager),
  });
});
```

**Note:** The exact Copilot SDK API for tool registration may differ. Check `packages/agent/src/common/copilotSDK.ts` for the actual API. The tool registration may need to be done via the session options in `AgentServiceImpl.executeTask()` instead. If the SDK doesn't support `onSessionCreated` / `registerTool`, the tools should be passed as part of the session configuration in `agentServiceImpl.ts`. Adapt as needed — the handler functions are the important part.

- [ ] **Step 6: Verify build**

Run: `npx turbo build --filter=@gho-work/electron`
Expected: May have remaining compile errors from UI package — fix in next task

- [ ] **Step 7: Commit**

```bash
git add packages/electron/src/main/mainProcess.ts
git commit -m "refactor: rewire main process — config store, remove CLI handlers, add agent tools"
```

---

## Chunk 7: UI Updates

### Task 13: Update ConnectorListItemWidget

**Files:**
- Modify: `packages/ui/src/browser/connectors/connectorListItem.ts`

- [ ] **Step 1: Update to use MCPServerState**

Replace `packages/ui/src/browser/connectors/connectorListItem.ts`:

```typescript
import { Emitter } from '@gho-work/base';
import type { Event, MCPServerStatus } from '@gho-work/base';
import { Widget } from '../widget.js';
import { h } from '../dom.js';

export interface ConnectorListItemData {
  name: string;
  type: 'stdio' | 'http';
  status: MCPServerStatus;
}

export class ConnectorListItemWidget extends Widget {
  private readonly _dotEl: HTMLElement;
  private readonly _actionsEl: HTMLElement;
  private _data: ConnectorListItemData;

  private readonly _onDidRequestConnect = this._register(new Emitter<string>());
  readonly onDidRequestConnect: Event<string> = this._onDidRequestConnect.event;

  private readonly _onDidRequestDisconnect = this._register(new Emitter<string>());
  readonly onDidRequestDisconnect: Event<string> = this._onDidRequestDisconnect.event;

  private readonly _onDidRequestRemove = this._register(new Emitter<string>());
  readonly onDidRequestRemove: Event<string> = this._onDidRequestRemove.event;

  constructor(data: ConnectorListItemData) {
    const layout = h('div.connector-list-item', [
      h('span.connector-status-dot@dot'),
      h('span.connector-list-item-name@name'),
      h('span.connector-transport-badge@badge'),
      h('div.connector-list-item-actions@actions'),
    ]);
    super(layout.root);
    this._data = data;
    this._dotEl = layout.dot;
    this._actionsEl = layout.actions;
    layout.name.textContent = data.name;
    layout.badge.textContent = data.type;
    layout.badge.className = `connector-transport-badge badge-${data.type}`;
    this._updateDot(data.status);
    this._renderActions();

    this.element.setAttribute('role', 'listitem');
    this.element.setAttribute('aria-label', `${data.name}, ${data.type}, ${data.status}`);
  }

  get serverName(): string { return this._data.name; }

  updateStatus(status: MCPServerStatus): void {
    this._data = { ...this._data, status };
    this._updateDot(status);
    this._renderActions();
    this.element.setAttribute('aria-label', `${this._data.name}, ${this._data.type}, ${status}`);
  }

  private _updateDot(status: MCPServerStatus): void {
    this._dotEl.className = `connector-status-dot status-${status}`;
  }

  private _renderActions(): void {
    while (this._actionsEl.firstChild) {
      this._actionsEl.removeChild(this._actionsEl.firstChild);
    }

    if (this._data.status === 'connected') {
      const btn = document.createElement('button');
      btn.className = 'connector-action-btn';
      btn.textContent = 'Disconnect';
      this.listen(btn, 'click', (e) => {
        e.stopPropagation();
        this._onDidRequestDisconnect.fire(this._data.name);
      });
      this._actionsEl.appendChild(btn);
    } else {
      const btn = document.createElement('button');
      btn.className = 'connector-action-btn';
      btn.textContent = 'Connect';
      this.listen(btn, 'click', (e) => {
        e.stopPropagation();
        this._onDidRequestConnect.fire(this._data.name);
      });
      this._actionsEl.appendChild(btn);
    }

    const removeBtn = document.createElement('button');
    removeBtn.className = 'connector-action-btn connector-remove-btn';
    removeBtn.textContent = 'Remove';
    this.listen(removeBtn, 'click', (e) => {
      e.stopPropagation();
      this._onDidRequestRemove.fire(this._data.name);
    });
    this._actionsEl.appendChild(removeBtn);
  }
}
```

- [ ] **Step 2: Update connectorListItem.test.ts**

Rewrite `packages/ui/src/browser/connectors/connectorListItem.test.ts` — update for the new `ConnectorListItemData` constructor parameter (instead of `ConnectorConfig`), and test the new events (`onDidRequestConnect`, `onDidRequestDisconnect`, `onDidRequestRemove`).

- [ ] **Step 3: Run tests**

Run: `npx vitest run packages/ui/src/browser/connectors/connectorListItem.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/browser/connectors/connectorListItem.ts packages/ui/src/browser/connectors/connectorListItem.test.ts
git commit -m "refactor: ConnectorListItemWidget uses MCPServerState, adds action buttons"
```

---

### Task 14: Simplify ConnectorSidebarWidget

**Files:**
- Modify: `packages/ui/src/browser/connectors/connectorSidebar.ts`

- [ ] **Step 1: Rewrite sidebar — remove CLI section, add action events**

Replace `packages/ui/src/browser/connectors/connectorSidebar.ts`:

```typescript
import { Emitter } from '@gho-work/base';
import type { Event, MCPServerStatus } from '@gho-work/base';
import type { IIPCRenderer } from '@gho-work/platform/common';
import { IPC_CHANNELS } from '@gho-work/platform/common';
import { Widget } from '../widget.js';
import { h } from '../dom.js';
import { ConnectorListItemWidget } from './connectorListItem.js';
import type { ConnectorListItemData } from './connectorListItem.js';

export class ConnectorSidebarWidget extends Widget {
  private readonly _listEl: HTMLElement;
  private readonly _items = new Map<string, ConnectorListItemWidget>();

  private readonly _onDidRequestAddConnector = this._register(new Emitter<void>());
  readonly onDidRequestAddConnector: Event<void> = this._onDidRequestAddConnector.event;

  private readonly _onDidRequestConnect = this._register(new Emitter<string>());
  readonly onDidRequestConnect: Event<string> = this._onDidRequestConnect.event;

  private readonly _onDidRequestDisconnect = this._register(new Emitter<string>());
  readonly onDidRequestDisconnect: Event<string> = this._onDidRequestDisconnect.event;

  private readonly _onDidRequestRemove = this._register(new Emitter<string>());
  readonly onDidRequestRemove: Event<string> = this._onDidRequestRemove.event;

  constructor(private readonly _ipc: IIPCRenderer) {
    const layout = h('div.connector-sidebar', [
      h('div.connector-sidebar-header@header'),
      h('div.connector-server-list@list'),
      h('div.connector-sidebar-footer@footer'),
    ]);
    super(layout.root);
    layout.header.textContent = 'Connectors';

    this._listEl = layout.list;

    const addBtn = document.createElement('button');
    addBtn.className = 'connector-add-btn';
    addBtn.textContent = '+ Add Connector';
    this.listen(addBtn, 'click', () => this._onDidRequestAddConnector.fire());
    layout.footer.appendChild(addBtn);

    // Listen for status push events
    this._ipc.on(IPC_CHANNELS.CONNECTOR_STATUS_CHANGED, (...args: unknown[]) => {
      const data = args[0] as { name: string; status: MCPServerStatus };
      this._items.get(data.name)?.updateStatus(data.status);
    });

    // Listen for config changes (add/remove from any source)
    this._ipc.on(IPC_CHANNELS.CONNECTOR_LIST_CHANGED, () => {
      void this.refresh();
    });
  }

  async activate(): Promise<void> {
    this._listEl.textContent = 'Loading...';
    await this.refresh();
  }

  async refresh(): Promise<void> {
    try {
      const resp = await this._ipc.invoke<{
        servers: ConnectorListItemData[];
      }>(IPC_CHANNELS.CONNECTOR_LIST);
      this._renderServers(resp.servers);
    } catch (err) {
      console.error('Failed to load connectors:', err);
    }
  }

  private _renderServers(servers: ConnectorListItemData[]): void {
    for (const item of this._items.values()) { item.dispose(); }
    this._items.clear();
    while (this._listEl.firstChild) { this._listEl.removeChild(this._listEl.firstChild); }

    if (servers.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'connector-empty';
      empty.textContent = 'No MCP servers configured';
      this._listEl.appendChild(empty);
      return;
    }

    for (const data of servers) {
      const item = this._register(new ConnectorListItemWidget(data));
      item.onDidRequestConnect((name) => this._onDidRequestConnect.fire(name));
      item.onDidRequestDisconnect((name) => this._onDidRequestDisconnect.fire(name));
      item.onDidRequestRemove((name) => this._onDidRequestRemove.fire(name));
      this._items.set(data.name, item);
      this._listEl.appendChild(item.getDomNode());
    }
  }
}
```

- [ ] **Step 2: Update connectorSidebar.test.ts**

Rewrite `packages/ui/src/browser/connectors/connectorSidebar.test.ts` — update for removed CLI section, new action events (`onDidRequestConnect`, `onDidRequestDisconnect`, `onDidRequestRemove`), and new response shape from `CONNECTOR_LIST` (array of `ConnectorListItemData` instead of `ConnectorConfig[]`).

- [ ] **Step 3: Run tests**

Run: `npx vitest run packages/ui/src/browser/connectors/connectorSidebar.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/browser/connectors/connectorSidebar.ts packages/ui/src/browser/connectors/connectorSidebar.test.ts
git commit -m "refactor: simplify ConnectorSidebar — server list only, no CLI section"
```

---

### Task 15: Simplify Workbench

**Files:**
- Modify: `packages/ui/src/browser/workbench.ts`

- [ ] **Step 1: Remove drawer, CLI handlers, simplify wiring**

Key changes:
- Remove `import { ConnectorDrawerWidget }`
- Remove `_connectorDrawer` field
- Remove drawer creation (`new ConnectorDrawerWidget`) and DOM append
- Remove `onDidSelectConnector` → drawer open wiring
- Remove `onDidRequestInstallCLI` handler
- Remove `onDidRequestAuthCLI` handler
- Remove `onDidSaveConnector` and `onDidDeleteConnector` handlers
- Remove `_openAuthConversation` method
- Remove `highlightConnector` calls
- Remove `onDidClose` handler
- Add connect/disconnect/remove wiring:

```typescript
// Wire sidebar action events
this._connectorSidebar.onDidRequestConnect(async (name) => {
  try {
    await this._ipc.invoke(IPC_CHANNELS.CONNECTOR_CONNECT, { name });
  } catch (err) {
    console.error('[workbench] Connect failed:', err);
  }
});

this._connectorSidebar.onDidRequestDisconnect(async (name) => {
  try {
    await this._ipc.invoke(IPC_CHANNELS.CONNECTOR_DISCONNECT, { name });
  } catch (err) {
    console.error('[workbench] Disconnect failed:', err);
  }
});

this._connectorSidebar.onDidRequestRemove(async (name) => {
  try {
    await this._ipc.invoke(IPC_CHANNELS.CONNECTOR_REMOVE, { name });
  } catch (err) {
    console.error('[workbench] Remove failed:', err);
  }
});
```

Simplify the "Add Connector" handler — no query/platform:

```typescript
this._connectorSidebar.onDidRequestAddConnector(async () => {
  try {
    const result = await this._ipc.invoke<{ conversationId: string; error?: string }>(
      IPC_CHANNELS.CONNECTOR_SETUP_CONVERSATION,
    );
    if (result.error) {
      this._chatPanel.showError(`Failed to start connector setup: ${result.error}`);
      return;
    }
    await this._openSetupConversation(result.conversationId);
  } catch (err) {
    console.error('[workbench] Setup conversation failed:', err);
    this._chatPanel.showError('Failed to start connector setup.');
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add packages/ui/src/browser/workbench.ts
git commit -m "refactor: simplify Workbench — remove drawer, CLI handlers"
```

---

### Task 16: Update onboarding flow

**Files:**
- Modify: `packages/ui/src/browser/onboarding/onboardingFlow.ts`

- [ ] **Step 1: Check if cliDetectionStep is imported**

The current `onboardingFlow.ts` imports `WelcomeStep`, `AuthStep`, `VerificationStep`, `ConnectorStep`. It does NOT import `cliDetectionStep`. The `ONBOARDING_DETECT_TOOLS` handler is in `mainProcess.ts` (already removed in Task 12). No changes needed to onboardingFlow.ts.

If `cliDetectionStep` IS imported, remove the import and the step from the state machine.

- [ ] **Step 2: Commit (if changes were needed)**

```bash
git add packages/ui/src/browser/onboarding/onboardingFlow.ts
git commit -m "refactor: remove CLI detection step from onboarding"
```

---

## Chunk 8: Build Fix, Integration Test, E2E

### Task 17: Fix remaining compilation errors

**Files:**
- Various — fix any remaining type errors across the codebase

- [ ] **Step 1: Run full build**

Run: `npx turbo build`

- [ ] **Step 2: Fix all compilation errors**

Common fixes needed:
- References to `ConnectorConfig` → `MCPServerConfig` or `MCPServerState`
- References to `connectorId` → `serverName` in event types
- References to deleted IPC channels
- References to deleted imports
- `Workspace.connectorOverrides` references (if used anywhere beyond types.ts)

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`

Fix any test failures caused by type changes or deleted modules.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix: resolve remaining compilation errors from connector simplification"
```

---

### Task 18: Update E2E tests

**Files:**
- Modify: `tests/e2e/connectors-ui.spec.ts`
- Modify: `tests/e2e/connectors.spec.ts`
- Modify: `tests/e2e/connector-add-conversational.spec.ts`
- Modify: `tests/e2e/connector-add-manual.spec.ts`
- Modify: `tests/e2e/connector-reconnect.spec.ts`
- Modify: `tests/e2e/app-launches.spec.ts`

- [ ] **Step 1: Update connectors-ui.spec.ts**

Key changes:
- Remove test for CLI tool items (`connector sidebar shows CLI tool items` test)
- Update selectors: no more `.cli-tool-list-item`
- Update "Add Connector" test if it references drawer
- Add test: "No CLI Tools section visible"

- [ ] **Step 2: Update connector-add and connector-reconnect tests**

- Replace `ConnectorConfig` payloads with new IPC format
- Replace `CONNECTOR_ADD` IPC calls with pre-seeded `mcp.json` file
- Update selectors for new ConnectorListItemWidget (action buttons)
- Update status checks to use `name` instead of `id`

For connector tests that add servers programmatically, pre-seed `mcp.json` in the test's `userDataDir`:

```typescript
const mcpConfig = {
  servers: {
    'test-server': {
      type: 'stdio',
      command: 'node',
      args: [resolve(__dirname, '../fixtures/test-mcp-server.mjs')],
    },
  },
};
writeFileSync(resolve(userDataDir, 'mcp.json'), JSON.stringify(mcpConfig));
```

- [ ] **Step 3: Update app-launches.spec.ts**

Remove any assertions about CLI tools. Ensure the basic workbench and chat tests still pass.

- [ ] **Step 4: Run E2E tests**

Run: `npx playwright test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/
git commit -m "test: update E2E tests for connector simplification"
```

---

### Task 19: Update setup skill

**Files:**
- Modify: `skills/connectors/setup.md`

- [ ] **Step 1: Update setup skill to reference agent tools**

The setup skill should instruct the agent to use `add_mcp_server` and `list_mcp_servers` tools instead of guiding users through manual configuration. Update the skill content to describe the available tools and when to use them.

- [ ] **Step 2: Commit**

```bash
git add skills/connectors/setup.md
git commit -m "docs: update connector setup skill to reference agent tools"
```

---

### Task 20: Full build and test verification

- [ ] **Step 1: Clean build**

Run: `npx turbo build`
Expected: 0 errors

- [ ] **Step 2: Run all unit tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Run all E2E tests**

Run: `npx playwright test`
Expected: All tests pass

- [ ] **Step 4: Launch the app (HARD GATE)**

Run: `npm run desktop:dev`

Verify:
1. App launches, workbench renders
2. Connectors panel shows server list (empty if no `mcp.json`)
3. No CLI Tools section visible
4. "Add Connector" opens setup conversation
5. No drawer opens on any click

- [ ] **Step 5: Final commit if needed**

```bash
git add -A
git commit -m "chore: connector simplification complete — all tests passing"
```
