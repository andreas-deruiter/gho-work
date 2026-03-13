# Phase 3 Completion — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify MCP server and CLI tool setup into a single conversational flow, and add comprehensive tests for all Phase 3 connector infrastructure.

**Architecture:** The agent guides connector setup conversationally via a unified setup skill. The existing `CLI_CREATE_INSTALL_CONVERSATION` IPC channel is replaced by `CONNECTOR_SETUP_CONVERSATION`. Unit/integration/E2E tests harden the existing MCPConnection, MCPClientManager, ConnectorRegistry, and CLIDetection implementations.

**Tech Stack:** TypeScript, Electron IPC (contextBridge), Zod, Vitest, Playwright, `@modelcontextprotocol/sdk`

**Spec:** `docs/superpowers/specs/2026-03-13-phase3-completion-design.md`

---

## Chunk 1: Test MCP Server Fixture + Unit Tests (Connectors)

### Task 1: Create test MCP server fixture

**Files:**
- Create: `tests/fixtures/test-mcp-server.mjs`

- [ ] **Step 1: Write the fixture**

```javascript
// tests/fixtures/test-mcp-server.mjs
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'test-server', version: '1.0.0' });

server.tool('echo', 'Returns the input text', { text: z.string() }, async ({ text }) => ({
  content: [{ type: 'text', text }],
}));

server.tool('add', 'Adds two numbers', { a: z.number(), b: z.number() }, async ({ a, b }) => ({
  content: [{ type: 'text', text: String(a + b) }],
}));

server.tool('timestamp', 'Returns current timestamp', {}, async () => ({
  content: [{ type: 'text', text: new Date().toISOString() }],
}));

const transport = new StdioServerTransport();
await server.connect(transport);

process.on('SIGTERM', async () => {
  await server.close();
  process.exit(0);
});
```

- [ ] **Step 2: Verify the fixture runs**

Run: `node tests/fixtures/test-mcp-server.mjs`
Expected: Process starts and waits for stdio input (no errors). Kill with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add tests/fixtures/test-mcp-server.mjs
git commit -m "test: add MCP server fixture with echo, add, timestamp tools"
```

---

### Task 2: Unit tests for MCPConnection

**Files:**
- Create: `packages/connectors/src/__tests__/mcpConnection.test.ts`
- Reference: `packages/connectors/src/node/mcpConnection.ts`

These tests mock the `@modelcontextprotocol/sdk` Client to test MCPConnection's state machine without spawning real processes.

- [ ] **Step 1: Write the test file**

```typescript
// packages/connectors/src/__tests__/mcpConnection.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the MCP SDK before importing MCPConnection
vi.mock('@modelcontextprotocol/sdk/client', () => {
  const mockClient = {
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({
      tools: [
        { name: 'echo', description: 'Returns input' },
        { name: 'add', description: 'Adds numbers' },
      ],
    }),
    ping: vi.fn().mockResolvedValue(undefined),
    setNotificationHandler: vi.fn(),
  };
  return { Client: vi.fn(() => mockClient), __mockClient: mockClient };
});

vi.mock('@modelcontextprotocol/sdk/client/stdio', () => ({
  StdioClientTransport: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp', () => ({
  StreamableHTTPClientTransport: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/types', () => ({
  ToolListChangedNotificationSchema: { method: 'notifications/tools/list_changed' },
}));

import { MCPConnection } from '../node/mcpConnection.js';
import type { ConnectorConfig } from '@gho-work/base';

function makeConfig(overrides: Partial<ConnectorConfig> = {}): ConnectorConfig {
  return {
    id: 'test-1',
    type: 'local_mcp',
    name: 'Test',
    transport: 'stdio',
    command: 'node',
    args: ['test-server.mjs'],
    enabled: true,
    status: 'disconnected',
    ...overrides,
  };
}

describe('MCPConnection', () => {
  let conn: MCPConnection;

  afterEach(() => {
    conn?.dispose();
  });

  it('transitions to connected on successful connect', async () => {
    conn = new MCPConnection(makeConfig());
    const statuses: string[] = [];
    conn.onDidChangeStatus(s => statuses.push(s));

    await conn.connect();

    expect(conn.status).toBe('connected');
    expect(statuses).toContain('initializing');
    expect(statuses).toContain('connected');
  });

  it('transitions to error when connect fails', async () => {
    const { __mockClient } = await import('@modelcontextprotocol/sdk/client');
    __mockClient.connect.mockRejectedValueOnce(new Error('Connection refused'));

    conn = new MCPConnection(makeConfig());
    await expect(conn.connect()).rejects.toThrow('Connection refused');
    expect(conn.status).toBe('error');
  });

  it('transitions to disconnected on disconnect', async () => {
    conn = new MCPConnection(makeConfig());
    await conn.connect();
    await conn.disconnect();

    expect(conn.status).toBe('disconnected');
  });

  it('lists tools after connect', async () => {
    conn = new MCPConnection(makeConfig());
    await conn.connect();

    const tools = conn.listTools();
    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe('echo');
    expect(tools[1].name).toBe('add');
    expect(tools[0].enabled).toBe(true);
  });

  it('respects toolsConfig for enable/disable', async () => {
    conn = new MCPConnection(makeConfig({ toolsConfig: { echo: false } }));
    await conn.connect();

    const tools = conn.listTools();
    expect(tools.find(t => t.name === 'echo')?.enabled).toBe(false);
    expect(tools.find(t => t.name === 'add')?.enabled).toBe(true);
  });

  it('fires onDidChangeTools after connect', async () => {
    conn = new MCPConnection(makeConfig());
    const toolEvents: unknown[] = [];
    conn.onDidChangeTools(t => toolEvents.push(t));

    await conn.connect();
    expect(toolEvents).toHaveLength(1);
  });

  it('creates StdioClientTransport for stdio config', async () => {
    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio');
    conn = new MCPConnection(makeConfig());
    await conn.connect();

    expect(StdioClientTransport).toHaveBeenCalledWith({
      command: 'node',
      args: ['test-server.mjs'],
      env: undefined,
    });
  });

  it('creates StreamableHTTPClientTransport for http config', async () => {
    const { StreamableHTTPClientTransport } = await import(
      '@modelcontextprotocol/sdk/client/streamableHttp'
    );
    conn = new MCPConnection(
      makeConfig({ transport: 'streamable_http', url: 'https://example.com/mcp' }),
    );
    await conn.connect();

    expect(StreamableHTTPClientTransport).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run packages/connectors/src/__tests__/mcpConnection.test.ts`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/connectors/src/__tests__/mcpConnection.test.ts
git commit -m "test: add MCPConnection unit tests — lifecycle, tools, transports"
```

---

### Task 3: Unit tests for MCPClientManagerImpl

**Files:**
- Create: `packages/connectors/src/__tests__/mcpClientManager.test.ts`
- Reference: `packages/connectors/src/node/mcpClientManagerImpl.ts`

- [ ] **Step 1: Write the test file**

```typescript
// packages/connectors/src/__tests__/mcpClientManager.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock MCPConnection — we test it separately
vi.mock('../node/mcpConnection.js', () => {
  const { Emitter } = require('@gho-work/base');

  class MockMCPConnection {
    status = 'disconnected';
    private _onDidChangeStatus = new Emitter();
    readonly onDidChangeStatus = this._onDidChangeStatus.event;
    private _onDidChangeTools = new Emitter();
    readonly onDidChangeTools = this._onDidChangeTools.event;
    disposed = false;

    connect = vi.fn(async () => {
      this.status = 'connected';
      this._onDidChangeStatus.fire('connected');
      this._onDidChangeTools.fire([{ name: 'echo', description: 'test', enabled: true }]);
    });
    disconnect = vi.fn(async () => {
      this.status = 'disconnected';
      this._onDidChangeStatus.fire('disconnected');
    });
    listTools = vi.fn(() => [{ name: 'echo', description: 'test', enabled: true }]);
    dispose = vi.fn(() => { this.disposed = true; });
  }

  return { MCPConnection: vi.fn(() => new MockMCPConnection()) };
});

import { MCPClientManagerImpl } from '../node/mcpClientManagerImpl.js';
import type { IConnectorRegistry } from '../common/connectorRegistry.js';
import type { ConnectorConfig } from '@gho-work/base';

function makeConfig(id: string): ConnectorConfig {
  return {
    id,
    type: 'local_mcp',
    name: `Server ${id}`,
    transport: 'stdio',
    command: 'node',
    args: ['server.mjs'],
    enabled: true,
    status: 'disconnected',
  };
}

function makeMockRegistry(): IConnectorRegistry {
  const configs = new Map<string, ConnectorConfig>();
  return {
    getConnector: vi.fn(async (id: string) => configs.get(id)),
    getConnectors: vi.fn(async () => [...configs.values()]),
    getEnabledConnectors: vi.fn(async () => [...configs.values()].filter(c => c.enabled)),
    addConnector: vi.fn(async (c: ConnectorConfig) => { configs.set(c.id, c); }),
    updateConnector: vi.fn(),
    removeConnector: vi.fn(async (id: string) => { configs.delete(id); }),
    updateStatus: vi.fn(),
    onDidChangeConnectors: vi.fn(() => ({ dispose: vi.fn() })) as any,
    onDidChangeStatus: vi.fn(() => ({ dispose: vi.fn() })) as any,
    dispose: vi.fn(),
  } as unknown as IConnectorRegistry;
}

describe('MCPClientManagerImpl', () => {
  let manager: MCPClientManagerImpl;
  let registry: IConnectorRegistry;

  beforeEach(() => {
    registry = makeMockRegistry();
  });

  afterEach(() => {
    manager?.dispose();
  });

  it('connects a server and forwards status to registry', async () => {
    await (registry as any).addConnector(makeConfig('s1'));
    manager = new MCPClientManagerImpl(registry);

    await manager.connectServer('s1');
    expect(registry.updateStatus).toHaveBeenCalledWith('s1', 'connected');
  });

  it('throws when connecting unknown server', async () => {
    manager = new MCPClientManagerImpl(registry);
    await expect(manager.connectServer('nope')).rejects.toThrow('Connector not found');
  });

  it('disposes old connection when reconnecting', async () => {
    await (registry as any).addConnector(makeConfig('s1'));
    manager = new MCPClientManagerImpl(registry);

    await manager.connectServer('s1');
    await manager.connectServer('s1'); // reconnect

    // MCPConnection constructor should have been called twice
    const { MCPConnection } = await import('../node/mcpConnection.js');
    expect(MCPConnection).toHaveBeenCalledTimes(2);
  });

  it('disconnects a server', async () => {
    await (registry as any).addConnector(makeConfig('s1'));
    manager = new MCPClientManagerImpl(registry);
    await manager.connectServer('s1');

    await manager.disconnectServer('s1');
    expect(registry.updateStatus).toHaveBeenCalledWith('s1', 'disconnected');
  });

  it('returns tools for connected server', async () => {
    await (registry as any).addConnector(makeConfig('s1'));
    manager = new MCPClientManagerImpl(registry);
    await manager.connectServer('s1');

    const tools = await manager.getTools('s1');
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('echo');
  });

  it('returns empty tools for unknown server', async () => {
    manager = new MCPClientManagerImpl(registry);
    const tools = await manager.getTools('nope');
    expect(tools).toEqual([]);
  });

  it('fires onDidChangeStatus event', async () => {
    await (registry as any).addConnector(makeConfig('s1'));
    manager = new MCPClientManagerImpl(registry);
    const events: unknown[] = [];
    manager.onDidChangeStatus(e => events.push(e));

    await manager.connectServer('s1');
    expect(events).toContainEqual({ connectorId: 's1', status: 'connected' });
  });

  it('fires onDidChangeTools event', async () => {
    await (registry as any).addConnector(makeConfig('s1'));
    manager = new MCPClientManagerImpl(registry);
    const events: unknown[] = [];
    manager.onDidChangeTools(e => events.push(e));

    await manager.connectServer('s1');
    expect(events.length).toBeGreaterThan(0);
  });

  it('disconnects all on disconnectAll', async () => {
    await (registry as any).addConnector(makeConfig('s1'));
    await (registry as any).addConnector(makeConfig('s2'));
    manager = new MCPClientManagerImpl(registry);
    await manager.connectServer('s1');
    await manager.connectServer('s2');

    await manager.disconnectAll();
    expect(registry.updateStatus).toHaveBeenCalledWith('s1', 'disconnected');
    expect(registry.updateStatus).toHaveBeenCalledWith('s2', 'disconnected');
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run packages/connectors/src/__tests__/mcpClientManager.test.ts`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/connectors/src/__tests__/mcpClientManager.test.ts
git commit -m "test: add MCPClientManagerImpl unit tests — connect, disconnect, events"
```

---

### Task 4: Unit tests for CLIDetectionService

**Files:**
- Create: `packages/connectors/src/__tests__/cliDetection.test.ts`
- Reference: `packages/connectors/src/node/cliDetectionImpl.ts`

The `CLIDetectionServiceImpl` constructor accepts an optional `execFile` function — use constructor injection for mocking instead of module-level mocks.

- [ ] **Step 1: Write the test file**

```typescript
// packages/connectors/src/__tests__/cliDetection.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CLIDetectionServiceImpl } from '../node/cliDetectionImpl.js';

// Create a mock execFile that can be configured per-test
type ExecResult = { stdout: string; stderr: string };
type ExecFileFunction = (cmd: string, args: string[], opts?: any) => Promise<ExecResult>;

function createMockExec(results: Map<string, ExecResult | Error> = new Map()): ExecFileFunction {
  return vi.fn(async (cmd: string, _args: string[]) => {
    const result = results.get(cmd);
    if (result instanceof Error) {
      throw result;
    }
    if (result) {
      return result;
    }
    // Default: command not found
    const err = new Error(`${cmd}: not found`) as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    throw err;
  }) as unknown as ExecFileFunction;
}

function makeNotFoundError(cmd: string): Error {
  const err = new Error(`${cmd}: not found`) as NodeJS.ErrnoException;
  err.code = 'ENOENT';
  return err;
}

describe('CLIDetectionServiceImpl', () => {
  let service: CLIDetectionServiceImpl;

  afterEach(() => {
    service?.dispose();
  });

  describe('detectAll', () => {
    it('returns all known CLI tools', async () => {
      service = new CLIDetectionServiceImpl(createMockExec());
      const tools = await service.detectAll();
      expect(tools.length).toBeGreaterThanOrEqual(6);
      expect(tools.map(t => t.id)).toContain('gh');
      expect(tools.map(t => t.id)).toContain('pandoc');
    });

    it('marks tools as not installed when command fails', async () => {
      service = new CLIDetectionServiceImpl(createMockExec());
      const tools = await service.detectAll();
      expect(tools.every(t => !t.installed)).toBe(true);
    });
  });

  describe('version parsing', () => {
    it('parses gh version', async () => {
      const exec = createMockExec(new Map([
        ['gh', { stdout: 'gh version 2.50.0 (2024-06-01)', stderr: '' }],
      ]));
      service = new CLIDetectionServiceImpl(exec);
      const tool = await service.detect('gh');
      expect(tool?.installed).toBe(true);
      expect(tool?.version).toContain('2.50.0');
    });

    it('parses git version', async () => {
      const exec = createMockExec(new Map([
        ['git', { stdout: 'git version 2.43.0', stderr: '' }],
      ]));
      service = new CLIDetectionServiceImpl(exec);
      const tool = await service.detect('git');
      expect(tool?.installed).toBe(true);
      expect(tool?.version).toContain('2.43.0');
    });

    it('parses pandoc version', async () => {
      const exec = createMockExec(new Map([
        ['pandoc', { stdout: 'pandoc 3.1.9', stderr: '' }],
      ]));
      service = new CLIDetectionServiceImpl(exec);
      const tool = await service.detect('pandoc');
      expect(tool?.installed).toBe(true);
    });

    it('returns undefined for unknown tool id', async () => {
      service = new CLIDetectionServiceImpl(createMockExec());
      const tool = await service.detect('nonexistent');
      expect(tool).toBeUndefined();
    });
  });

  describe('refresh', () => {
    it('fires onDidChangeTools after refresh', async () => {
      service = new CLIDetectionServiceImpl(createMockExec());
      const events: unknown[] = [];
      service.onDidChangeTools(e => events.push(e));

      await service.refresh();
      expect(events).toHaveLength(1);
    });
  });

  describe('authenticateTool', () => {
    it('returns device code and auth URL from process output', async () => {
      // Mock spawn for auth — authenticateTool uses spawn, not execFile
      const { spawn } = await import('child_process');
      const mockSpawn = vi.mocked(spawn);
      // The implementing agent should read the actual authenticateTool()
      // method in cliDetectionImpl.ts to construct the correct mock.
      // Key behavior: spawn captures stdout/stderr for URL and device code
      // within 5 seconds, returns { success: true, authUrl, deviceCode }.
      // This test stub should be completed during implementation by reading
      // the actual regex patterns used to capture URL/code from output.
    });
  });
});
```

Note: The `authenticateTool` test is a stub — the implementing agent must read the actual `authenticateTool()` method in `cliDetectionImpl.ts` to understand how it spawns a process, captures stdout/stderr for URL and device code patterns, and returns the result. Complete the mock accordingly.

- [ ] **Step 2: Run the tests**

Run: `npx vitest run packages/connectors/src/__tests__/cliDetection.test.ts`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/connectors/src/__tests__/cliDetection.test.ts
git commit -m "test: add CLIDetectionService unit tests — detect, refresh, events"
```

---

### Task 5: Extend ConnectorRegistry tests

**Files:**
- Modify: `packages/connectors/src/__tests__/connectorRegistry.test.ts`

- [ ] **Step 1: Add full state machine chain and concurrent update tests**

The existing tests already cover individual status transitions and enabled filtering. Add these new tests that cover missing scenarios — append to the existing describe block:

```typescript
  describe('full status lifecycle', () => {
    it('transitions through initializing → connected → error → disconnected', async () => {
      await registry.addConnector(makeConfig());

      await registry.updateStatus('conn-1', 'initializing');
      expect((await registry.getConnector('conn-1'))?.status).toBe('initializing');

      await registry.updateStatus('conn-1', 'connected');
      expect((await registry.getConnector('conn-1'))?.status).toBe('connected');

      await registry.updateStatus('conn-1', 'error', 'Heartbeat timeout');
      const errState = await registry.getConnector('conn-1');
      expect(errState?.status).toBe('error');
      expect(errState?.error).toBe('Heartbeat timeout');

      await registry.updateStatus('conn-1', 'disconnected');
      const final = await registry.getConnector('conn-1');
      expect(final?.status).toBe('disconnected');
      expect(final?.error).toBeUndefined();
    });
  });

  describe('concurrent updates', () => {
    it('handles rapid concurrent status updates without corruption', async () => {
      await registry.addConnector(makeConfig());

      // Fire multiple status updates concurrently
      await Promise.all([
        registry.updateStatus('conn-1', 'initializing'),
        registry.updateStatus('conn-1', 'connected'),
        registry.updateStatus('conn-1', 'error', 'test'),
      ]);

      // The connector should have one of the valid statuses (last-write-wins)
      const connector = await registry.getConnector('conn-1');
      expect(['initializing', 'connected', 'error']).toContain(connector?.status);
    });

    it('handles concurrent add and update without error', async () => {
      await registry.addConnector(makeConfig({ id: 'c1' }));
      await registry.addConnector(makeConfig({ id: 'c2' }));

      await Promise.all([
        registry.updateStatus('c1', 'connected'),
        registry.updateStatus('c2', 'connected'),
        registry.updateConnector('c1', { name: 'Updated' }),
      ]);

      const c1 = await registry.getConnector('c1');
      const c2 = await registry.getConnector('c2');
      expect(c1).toBeDefined();
      expect(c2?.status).toBe('connected');
    });
  });
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run packages/connectors/src/__tests__/connectorRegistry.test.ts`
Expected: All tests pass (existing + new).

- [ ] **Step 3: Commit**

```bash
git add packages/connectors/src/__tests__/connectorRegistry.test.ts
git commit -m "test: extend ConnectorRegistry tests — status transitions, enabled filtering"
```

---

## Chunk 2: Integration Tests

### Task 6: Integration test — real MCP server lifecycle

**Files:**
- Create: `tests/integration/mcpServer.test.ts`
- Reference: `tests/fixtures/test-mcp-server.mjs`, `packages/connectors/src/node/mcpConnection.ts`

This test spawns the real test MCP server fixture and connects via MCPConnection.

- [ ] **Step 1: Write the integration test**

```typescript
// tests/integration/mcpServer.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
// MCPConnection is not exported from the barrel — use relative import
import { MCPConnection } from '../../packages/connectors/src/node/mcpConnection.js';
import type { ConnectorConfig } from '@gho-work/base';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(__dirname, '../fixtures/test-mcp-server.mjs');

function makeFixtureConfig(): ConnectorConfig {
  return {
    id: 'fixture-1',
    type: 'local_mcp',
    name: 'Test Fixture Server',
    transport: 'stdio',
    command: 'node',
    args: [FIXTURE_PATH],
    enabled: true,
    status: 'disconnected',
  };
}

describe('MCP Server Integration', () => {
  let conn: MCPConnection | null = null;

  afterEach(async () => {
    if (conn) {
      await conn.disconnect();
      conn.dispose();
      conn = null;
    }
  });

  it('connects to fixture server, lists tools, and disconnects', async () => {
    conn = new MCPConnection(makeFixtureConfig());
    const statuses: string[] = [];
    conn.onDidChangeStatus(s => statuses.push(s));

    await conn.connect();

    expect(conn.status).toBe('connected');
    expect(statuses).toContain('initializing');
    expect(statuses).toContain('connected');

    const tools = conn.listTools();
    expect(tools).toHaveLength(3);
    expect(tools.map(t => t.name).sort()).toEqual(['add', 'echo', 'timestamp']);

    await conn.disconnect();
    expect(conn.status).toBe('disconnected');
  }, 15_000);
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/integration/mcpServer.test.ts`
Expected: PASS — connects to real MCP server, lists 3 tools, disconnects.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/mcpServer.test.ts
git commit -m "test: add MCP server integration test — real fixture lifecycle"
```

---

## Chunk 3: Unified Setup Conversation (Production Code)

### Task 7: Add CONNECTOR_SETUP_CONVERSATION IPC channel

**Files:**
- Modify: `packages/platform/src/ipc/common/ipc.ts` (lines ~42 for channel, ~285 for schemas)
- Modify: `apps/desktop/src/preload/index.ts` (line ~36)

- [ ] **Step 1: Add channel constant to IPC_CHANNELS**

In `packages/platform/src/ipc/common/ipc.ts`, add the new channel after `CLI_CREATE_INSTALL_CONVERSATION`:

```typescript
CONNECTOR_SETUP_CONVERSATION: 'connector:setup-conversation',
```

- [ ] **Step 2: Add Zod schemas**

In the same file, after the `CLICreateInstallResponseSchema` (around line 293), add:

```typescript
export const ConnectorSetupRequestSchema = z.object({
  query: z.string().optional(),
});
export type ConnectorSetupRequest = z.infer<typeof ConnectorSetupRequestSchema>;

export const ConnectorSetupResponseSchema = z.object({
  conversationId: z.string(),
  error: z.string().optional(),
});
export type ConnectorSetupResponse = z.infer<typeof ConnectorSetupResponseSchema>;
```

- [ ] **Step 3: Add to preload whitelist**

In `apps/desktop/src/preload/index.ts`, add after the `CLI_CREATE_INSTALL_CONVERSATION` entry (line ~36):

```typescript
IPC_CHANNELS.CONNECTOR_SETUP_CONVERSATION,
```

- [ ] **Step 4: Build to verify types**

Run: `npx turbo build --filter=@gho-work/platform --filter=desktop`
Expected: Clean build, no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/platform/src/ipc/common/ipc.ts apps/desktop/src/preload/index.ts
git commit -m "feat: add CONNECTOR_SETUP_CONVERSATION IPC channel + zod schemas"
```

---

### Task 8: Write the setup skill

**Files:**
- Create: `skills/connectors/setup.md`

- [ ] **Step 1: Create the skills/connectors directory**

Run: `ls skills/` to verify the directory exists, then `mkdir -p skills/connectors`.

- [ ] **Step 2: Write the setup skill**

```markdown
---
name: connector-setup
description: Guide the user through setting up an MCP server or CLI tool
---

You are helping the user set up a new connector (MCP server or CLI tool). Follow these steps:

## Step 1: Identify what to connect

If the user has already specified what they want (e.g., "Google Drive MCP", "gh CLI"), proceed to Step 2. Otherwise, ask what they want to connect.

## Step 2: Search for the right package

For MCP servers, query the MCP Registry:

```bash
curl -s "https://registry.modelcontextprotocol.io/v2025-07-09/servers?search=QUERY&limit=5&version=latest"
```

The response has: `{ servers: [...], metadata: { count, nextCursor? } }`

Each server has:
- `name` — server identifier
- `description` — what it does
- `packages[]` — install methods, each with:
  - `registryType` — "npm", "pypi", "docker-hub"
  - `identifier` — package name (e.g., "@anthropic-community/google-drive-mcp")
  - `environmentVariables[]` — required env vars, each with `name`, `description`, `required`
  - `packageArguments[]` — required args
- `remotes[]` — remote HTTP endpoints, each with `type`, `url`

If the search returns no results or curl fails, use web search as fallback.

For CLI tools, the install skill for the specific tool has already been loaded into your context as additional instructions. Follow those instructions.

## Step 3: Configure the connector

Map the registry package to a connector config and add it via the CONNECTOR_ADD IPC channel.

**Mapping rules:**
- npm package → `{ transport: 'stdio', command: 'npx', args: ['-y', identifier] }`
- pypi package → `{ transport: 'stdio', command: 'uvx', args: [identifier] }`
- docker-hub → `{ transport: 'stdio', command: 'docker', args: ['run', '-i', '--rm', identifier] }`
- Remote with URL → `{ transport: 'streamable_http', url: remote.url }`

**Environment variables:** If the package has required `environmentVariables`, ask the user for each value before configuring. Explain what each variable is for and where to get it (e.g., "You need a Google Drive API key — you can get one from the Google Cloud Console").

**No env vars needed:** Configure immediately without asking — tell the user what you're setting up.

## Step 4: Test the connection

After adding the connector, test it to verify it works. Report the result to the user:
- Success: "Connected! Found N tools: [list of tool names]"
- Failure: Show the error and offer to troubleshoot

## Error Handling

- If `curl` fails (timeout, DNS error, rate limit), tell the user and fall back to web search
- If the package install fails (e.g., npx can't find the package), suggest alternatives
- If connection test fails, check common issues: wrong command, missing env vars, network
```

- [ ] **Step 3: Commit**

```bash
git add skills/connectors/setup.md
git commit -m "feat: add unified connector setup skill"
```

---

### Task 9: Add createSetupConversation to IAgentService and implement it

**Files:**
- Modify: `packages/agent/src/common/agent.ts` (line 9)
- Modify: `packages/agent/src/node/agentServiceImpl.ts` (lines 118–142, 172–183)

- [ ] **Step 1: Add method to IAgentService interface**

In `packages/agent/src/common/agent.ts`, add after `createInstallConversation` (line 9):

```typescript
createSetupConversation(query?: string, platformContext?: PlatformContext): Promise<string>;
```

- [ ] **Step 2: Implement createSetupConversation in AgentServiceImpl**

In `packages/agent/src/node/agentServiceImpl.ts`, add the following method (after `createInstallConversation`):

```typescript
private static readonly CLI_TOOL_IDS = new Set(['gh', 'git', 'pandoc', 'mgc', 'az', 'gcloud', 'workiq']);

async createSetupConversation(query?: string, platformContext?: PlatformContext): Promise<string> {
  if (!this._conversationService) {
    throw new Error('Setup conversations require conversation service (no workspace)');
  }

  // Load the unified setup skill
  const setupSkill = await this._loadSkill('connectors', 'setup');
  if (!setupSkill) {
    throw new Error('Connector setup skill not found');
  }

  // Build system message
  const parts = [setupSkill];

  // If query matches a CLI tool, append its install skill as additional context
  if (query) {
    const toolId = query.toLowerCase().split(/\s/)[0]; // extract first word
    if (AgentServiceImpl.CLI_TOOL_IDS.has(toolId)) {
      const installSkill = await this._loadInstallSkill(toolId);
      if (installSkill) {
        parts.push(`\n\n## Additional Context: ${toolId} Install Guide\n\n${installSkill}`);
      }
    }
  }

  // Add platform context
  if (platformContext) {
    parts.push([
      '\n\n## Platform',
      `- OS: ${platformContext.os}`,
      `- Architecture: ${platformContext.arch}`,
      `- Package managers: ${formatPackageManagers(platformContext.packageManagers)}`,
    ].join('\n'));
  }

  const systemMessage = parts.join('');

  // Create conversation
  const title = query ? `Set up ${query}` : 'Set up connector';
  const conversation = this._conversationService.createConversation('default');
  this._conversationService.renameConversation(conversation.id, title);
  this._installContexts.set(conversation.id, systemMessage);
  return conversation.id;
}
```

- [ ] **Step 3: Remove createInstallConversation**

Delete the `createInstallConversation` method from `AgentServiceImpl` (lines 118–142) and remove it from the `IAgentService` interface (line 9 in `agent.ts`).

- [ ] **Step 4: Build to verify types**

Run: `npx turbo build --filter=@gho-work/agent`
Expected: Build may fail due to callers still referencing `createInstallConversation`. That's expected — we'll fix callers in the next tasks.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/common/agent.ts packages/agent/src/node/agentServiceImpl.ts
git commit -m "feat: add createSetupConversation, remove createInstallConversation"
```

---

### Task 10: Wire CONNECTOR_SETUP_CONVERSATION in main process

**Files:**
- Modify: `packages/electron/src/main/mainProcess.ts` (lines 835–840)

- [ ] **Step 1: Replace CLI_CREATE_INSTALL_CONVERSATION handler**

Find the `CLI_CREATE_INSTALL_CONVERSATION` handler (line 835) and replace it with:

```typescript
ipcMainAdapter.handle(IPC_CHANNELS.CONNECTOR_SETUP_CONVERSATION, async (...args: unknown[]) => {
  const { query } = (args[0] ?? {}) as { query?: string };
  try {
    const platformContext = await platformDetectionService.detect();
    const conversationId = await agentService.createSetupConversation(query, platformContext);
    return { conversationId };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[mainProcess] Setup conversation failed:', message);
    return { conversationId: '', error: message };
  }
});
```

- [ ] **Step 2: Remove the old CLI_CREATE_INSTALL_CONVERSATION handler**

Delete the old handler block (the one that calls `agentService.createInstallConversation`).

- [ ] **Step 3: Build to verify**

Run: `npx turbo build --filter=@gho-work/electron --filter=desktop`
Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add packages/electron/src/main/mainProcess.ts
git commit -m "feat: wire CONNECTOR_SETUP_CONVERSATION IPC handler, remove old install handler"
```

---

### Task 11: Update UI callers to use CONNECTOR_SETUP_CONVERSATION

**Files:**
- Modify: `packages/ui/src/browser/workbench.ts` (lines 123–126 for Add Connector, lines 132–160 for Install)
- Modify: `packages/ui/src/browser/connectorsPanel.ts` (find CLI_CREATE_INSTALL_CONVERSATION)

- [ ] **Step 1: Update "Add Connector" button handler in workbench.ts**

The current `onDidRequestAddConnector` handler (lines 123–126) opens the drawer in add-new mode. Change it to create a setup conversation instead:

```typescript
// Before (lines 123-126):
this._connectorSidebar.onDidRequestAddConnector(() => {
  this._connectorDrawer.openForNew();
});

// After:
this._connectorSidebar.onDidRequestAddConnector(async () => {
  try {
    const result = await this._ipc.invoke<{ conversationId: string; error?: string }>(
      IPC_CHANNELS.CONNECTOR_SETUP_CONVERSATION,
      {},
    );
    if (result.error) {
      throw new Error(result.error);
    }
    await this._openSetupConversation(result.conversationId);
  } catch (err) {
    console.error('[workbench] Setup conversation failed:', err);
    this._chatPanel.showError('Failed to start connector setup. Check that the agent service is running.');
  }
});
```

- [ ] **Step 2: Update CLI Install handler in workbench.ts**

Replace `IPC_CHANNELS.CLI_CREATE_INSTALL_CONVERSATION` (line 137) with `IPC_CHANNELS.CONNECTOR_SETUP_CONVERSATION`, and change the request payload from `{ toolId }` to `{ query: toolId }`:

```typescript
// Before:
const result = await this._ipc.invoke<{ conversationId: string }>(
  IPC_CHANNELS.CLI_CREATE_INSTALL_CONVERSATION,
  { toolId },
);

// After:
const result = await this._ipc.invoke<{ conversationId: string; error?: string }>(
  IPC_CHANNELS.CONNECTOR_SETUP_CONVERSATION,
  { query: toolId },
);
if (result.error) {
  throw new Error(result.error);
}
```

- [ ] **Step 3: Rename `_openInstallConversation` to `_openSetupConversation`**

Rename the method (lines 214–229) and update all call sites. The method body stays the same — it works for both install and setup conversations.

- [ ] **Step 4: Update connectorsPanel.ts**

Find `CLI_CREATE_INSTALL_CONVERSATION` in `packages/ui/src/browser/connectorsPanel.ts` and apply the same change (replace channel name, change `{ toolId }` to `{ query: toolId }`, handle error response).

- [ ] **Step 5: Remove CLI_CREATE_INSTALL_CONVERSATION from IPC_CHANNELS and preload**

In `packages/platform/src/ipc/common/ipc.ts`:
- Remove `CLI_CREATE_INSTALL_CONVERSATION: 'cli:create-install-conversation'` from IPC_CHANNELS
- Remove `CLICreateInstallRequestSchema` and `CLICreateInstallResponseSchema`

In `apps/desktop/src/preload/index.ts`:
- Remove `IPC_CHANNELS.CLI_CREATE_INSTALL_CONVERSATION` from `ALLOWED_INVOKE_CHANNELS`

- [ ] **Step 6: Build the full project**

Run: `npx turbo build`
Expected: Clean build, no references to `CLI_CREATE_INSTALL_CONVERSATION` remain.

- [ ] **Step 7: Verify no remaining references**

Run: `grep -r "CLI_CREATE_INSTALL_CONVERSATION\|createInstallConversation" packages/ apps/ --include='*.ts' -l`
Expected: No results (only docs/plans may still reference them).

- [ ] **Step 8: Commit**

```bash
git add packages/ui/src/browser/workbench.ts packages/ui/src/browser/connectorsPanel.ts packages/platform/src/ipc/common/ipc.ts apps/desktop/src/preload/index.ts
git commit -m "refactor: replace CLI_CREATE_INSTALL_CONVERSATION with CONNECTOR_SETUP_CONVERSATION"
```

---

### Task 12: Integration test for setup conversation

**Files:**
- Create: `tests/integration/connectorSetup.test.ts`
- Reference: `packages/agent/src/node/agentServiceImpl.ts`

- [ ] **Step 1: Write the integration test**

```typescript
// tests/integration/connectorSetup.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_ROOT = path.resolve(__dirname, '../../skills');

describe('Setup Conversation — Skill Loading', () => {
  describe('setup skill content', () => {
    it('exists and contains required sections', async () => {
      const skillPath = path.join(SKILLS_ROOT, 'connectors', 'setup.md');
      const content = await fs.readFile(skillPath, 'utf-8');

      // Frontmatter
      expect(content).toContain('connector-setup');

      // Must reference the MCP Registry API
      expect(content).toContain('registry.modelcontextprotocol.io');
      expect(content).toContain('CONNECTOR_ADD');

      // Must cover all registry types
      expect(content).toContain('npm');
      expect(content).toContain('pypi');
      expect(content).toContain('docker');
      expect(content).toContain('streamable_http');
    });

    it('includes error handling guidance', async () => {
      const skillPath = path.join(SKILLS_ROOT, 'connectors', 'setup.md');
      const content = await fs.readFile(skillPath, 'utf-8');

      expect(content).toContain('curl');
      expect(content).toMatch(/fallback|web search/i);
    });

    it('includes environment variable handling', async () => {
      const skillPath = path.join(SKILLS_ROOT, 'connectors', 'setup.md');
      const content = await fs.readFile(skillPath, 'utf-8');

      expect(content).toMatch(/environment/i);
    });
  });

  describe('CLI install skills', () => {
    const TOOL_IDS = ['gh', 'pandoc', 'git', 'mgc', 'az', 'gcloud', 'workiq'];

    for (const toolId of TOOL_IDS) {
      it(`install skill exists for ${toolId}`, async () => {
        const skillPath = path.join(SKILLS_ROOT, 'install', `${toolId}.md`);
        const exists = await fs.access(skillPath).then(() => true).catch(() => false);
        expect(exists, `Install skill missing for ${toolId}`).toBe(true);
      });
    }
  });

  describe('createSetupConversation behavior', () => {
    // The implementing agent should test AgentServiceImpl.createSetupConversation()
    // by constructing the service with mock dependencies:
    //   - Mock IConversationService (createConversation, renameConversation)
    //   - Mock ICopilotSDK (not needed for this method)
    //   - Set _bundledSkillsPath to the real skills/ directory
    //
    // Test cases:
    // 1. createSetupConversation() loads setup skill into system message
    // 2. createSetupConversation('gh') loads setup + gh install skill
    // 3. createSetupConversation('unknown') loads only setup skill (no install skill)
    // 4. createSetupConversation(undefined, platformContext) includes OS/arch in message
    // 5. createSetupConversation() throws when _conversationService is null
    //
    // Read AgentServiceImpl constructor to identify exact mock dependencies needed.
    // The _installContexts map stores the system message — verify it via getInstallContext().

    it('placeholder: implement with real AgentServiceImpl mocks', () => {
      // The implementing agent must read AgentServiceImpl to complete these tests.
      // This placeholder ensures the test file is created and the agent knows what to test.
      expect(true).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/integration/connectorSetup.test.ts`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/connectorSetup.test.ts
git commit -m "test: add integration tests for setup conversation skill loading"
```

---

## Chunk 4: E2E Tests (Playwright)

### Task 13: E2E test — manual connector add

**Files:**
- Create: `tests/e2e/connector-add-manual.spec.ts`
- Reference: `tests/e2e/app-launches.spec.ts` (for Playwright Electron patterns)

- [ ] **Step 1: Read existing E2E test for patterns**

Read `tests/e2e/app-launches.spec.ts` and `tests/e2e/global-setup.ts` to understand the Electron launch pattern, locator strategy, and assertion style used in this project.

- [ ] **Step 2: Write the E2E test**

**IMPORTANT:** Before writing selectors, the implementing agent MUST read the actual widget source files to get exact CSS class names and DOM structure:
- `packages/ui/src/browser/connectors/connectorSidebar.ts` — sidebar layout, button classes
- `packages/ui/src/browser/connectors/connectorDrawer.ts` — drawer layout, action buttons
- `packages/ui/src/browser/connectors/connectorConfigForm.ts` — form input classes
- `packages/ui/src/browser/connectors/connectorListItem.ts` — list item classes, status dot pattern
- `packages/ui/src/browser/connectors/toolListSection.ts` — tool row classes, toggle pattern

Known selector patterns from source code review:
- Status dot: `.connector-status-dot.status-connected` / `.status-disconnected` (not `.connected`)
- Form inputs: `.config-name-input`, `.config-command-input`, `.config-args-input`
- Form save: `.config-save-btn` (text: "Add Connector" for new)
- Drawer buttons: `.drawer-status-btn:has-text("Disconnect")` / `"Connect"`
- Delete: `.config-delete-btn`
- Tool rows: `.tool-row` with `[data-tool-name="echo"]`
- Tool toggle: `.tool-row input[type="checkbox"]`
- CLI tools section: `.connector-group-cli`
- CLI install button: `.cli-tool-list-item .cli-tool-btn:has-text("Install")`
- Chat messages: `.chat-message-assistant` (no space)

```typescript
// tests/e2e/connector-add-manual.spec.ts
import { test, expect, _electron } from '@playwright/test';
import path from 'path';

const FIXTURE_PATH = path.resolve(__dirname, '../fixtures/test-mcp-server.mjs');

test.describe('Manual Connector Add', () => {
  test('add, verify tools, toggle tool, disconnect, remove', async () => {
    const app = await _electron.launch({
      args: [path.resolve(__dirname, '../../apps/desktop/out/main/index.js'), '--mock'],
    });
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    // Navigate to Connectors panel via activity bar
    await page.click('.activity-bar-item[data-panel="connectors"]');

    // Open the manual config form. After Task 11, the main "Add Connector" button
    // creates a setup conversation. The implementing agent must determine how to
    // access the manual config path — options:
    //   (a) drawer.openForNew() is still accessible via a secondary UI element
    //   (b) add a "Configure manually" link in the connector sidebar
    //   (c) invoke CONNECTOR_ADD IPC directly from the test via app.evaluate()
    // Choose whichever matches the actual UI after Task 11 changes.

    // Fill in the connector form
    await page.fill('.config-name-input', 'Test Echo Server');
    // Select stdio transport (radio or selector — read actual form widget)
    await page.fill('.config-command-input', 'node');
    await page.fill('.config-args-input', FIXTURE_PATH);

    // Save
    await page.click('.config-save-btn');

    // Wait for status dot to turn green (connected)
    await expect(page.locator('.connector-status-dot.status-connected')).toBeVisible({ timeout: 15000 });

    // Open drawer and verify tools are listed
    await page.click('.connector-list-item:has-text("Test Echo Server")');
    await expect(page.locator('.tool-row[data-tool-name="echo"]')).toBeVisible();
    await expect(page.locator('.tool-row[data-tool-name="add"]')).toBeVisible();
    await expect(page.locator('.tool-row[data-tool-name="timestamp"]')).toBeVisible();

    // Toggle echo tool off
    await page.click('.tool-row[data-tool-name="echo"] input[type="checkbox"]');

    // Close drawer
    await page.keyboard.press('Escape');

    // Disconnect — open drawer, click disconnect
    await page.click('.connector-list-item:has-text("Test Echo Server")');
    await page.click('.drawer-status-btn:has-text("Disconnect")');
    await expect(page.locator('.connector-status-dot.status-disconnected')).toBeVisible({ timeout: 5000 });

    // Close drawer
    await page.keyboard.press('Escape');

    // Remove connector — open drawer, click delete
    await page.click('.connector-list-item:has-text("Test Echo Server")');
    await page.click('.config-delete-btn');

    // Verify connector is gone
    await expect(page.locator('.connector-list-item:has-text("Test Echo Server")')).not.toBeVisible();

    await app.close();
  });
});
```

**Note for implementing agent:** The "Add Connector" button now creates a setup conversation (per Task 11). This E2E test needs a way to access the manual config form. Options: (1) the drawer's `openForNew()` is still accessible via a secondary path, (2) add a "Configure manually" link in the sidebar, or (3) test manual add via `CONNECTOR_ADD` IPC directly from the Playwright test. Choose the option that matches the actual UI after Task 11 changes.

- [ ] **Step 3: Run the E2E test**

Run: `npx playwright test tests/e2e/connector-add-manual.spec.ts`
Expected: Test passes (or fails on selector mismatch — fix selectors).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/connector-add-manual.spec.ts
git commit -m "test: add E2E test for manual connector add/verify/disconnect/remove"
```

---

### Task 14: E2E test — conversational connector add

**Files:**
- Create: `tests/e2e/connector-add-conversational.spec.ts`

- [ ] **Step 1: Write the E2E test**

```typescript
// tests/e2e/connector-add-conversational.spec.ts
import { test, expect, _electron } from '@playwright/test';
import path from 'path';

test.describe('Conversational Connector Add', () => {
  test('Add Connector button opens conversation with setup skill', async () => {
    const app = await _electron.launch({
      args: [path.resolve(__dirname, '../../apps/desktop/out/main/index.js'), '--mock'],
    });
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    // Navigate to Connectors panel
    await page.click('[data-panel="connectors"]');

    // Click "Add Connector"
    await page.click('.connector-add-btn');

    // Verify a new conversation was created and is active
    // The chat panel should be visible with the setup conversation
    await expect(page.locator('[data-panel="chat"]')).toBeVisible({ timeout: 5000 });

    // In mock mode, the agent should respond to the kickoff message
    // Wait for any agent response
    await expect(page.locator('.chat-message-assistant')).toBeVisible({ timeout: 30000 });

    await app.close();
  });
});
```

Note: This test verifies the conversation creation flow. In mock mode, the agent won't actually set up a real connector — it verifies the UI wiring (button → IPC → conversation creation → navigation to chat).

- [ ] **Step 2: Run the test**

Run: `npx playwright test tests/e2e/connector-add-conversational.spec.ts`
Expected: Test passes.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/connector-add-conversational.spec.ts
git commit -m "test: add E2E test for conversational connector add flow"
```

---

### Task 15: E2E test — CLI tool install via unified flow

**Files:**
- Create: `tests/e2e/cli-tool-install.spec.ts`

- [ ] **Step 1: Write the E2E test**

```typescript
// tests/e2e/cli-tool-install.spec.ts
import { test, expect, _electron } from '@playwright/test';
import path from 'path';

test.describe('CLI Tool Install via Unified Flow', () => {
  test('Install button opens setup conversation with tool query', async () => {
    const app = await _electron.launch({
      args: [path.resolve(__dirname, '../../apps/desktop/out/main/index.js'), '--mock'],
    });
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    // Navigate to Connectors panel
    await page.click('[data-panel="connectors"]');

    // Wait for CLI tools section to load
    await expect(page.locator('.connector-group-cli')).toBeVisible({ timeout: 5000 });

    // Find a tool with an "Install" button (in mock mode, some tools should be not-installed)
    const installBtn = page.locator('.cli-tool-list-item .cli-tool-btn:has-text("Install")').first();
    await expect(installBtn).toBeVisible({ timeout: 5000 });

    await installBtn.click();

    // Verify conversation opened
    await expect(page.locator('[data-panel="chat"]')).toBeVisible({ timeout: 5000 });

    // Wait for agent response (setup skill loaded)
    await expect(page.locator('.chat-message-assistant')).toBeVisible({ timeout: 30000 });

    await app.close();
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx playwright test tests/e2e/cli-tool-install.spec.ts`
Expected: Test passes.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/cli-tool-install.spec.ts
git commit -m "test: add E2E test for CLI install via unified setup flow"
```

---

### Task 16: E2E test — connector reconnect

**Files:**
- Create: `tests/e2e/connector-reconnect.spec.ts`

- [ ] **Step 1: Write the E2E test**

```typescript
// tests/e2e/connector-reconnect.spec.ts
import { test, expect, _electron } from '@playwright/test';
import path from 'path';

const FIXTURE_PATH = path.resolve(__dirname, '../fixtures/test-mcp-server.mjs');

test.describe('Connector Reconnect', () => {
  // Note: The spec describes crash recovery (kill process → heartbeat error → reconnect).
  // That requires waiting 90+ seconds for heartbeat timeout, so this test verifies the
  // disconnect/reconnect mechanism instead. A separate stress test can be added later
  // to cover crash recovery with a shorter heartbeat interval.

  test('disconnect and reconnect preserves tools', async () => {
    const app = await _electron.launch({
      args: [path.resolve(__dirname, '../../apps/desktop/out/main/index.js'), '--mock'],
    });
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    // Navigate to Connectors panel
    await page.click('.activity-bar-item[data-panel="connectors"]');

    // Add the test fixture connector manually via the config form
    // (The implementing agent should determine the correct entry point for
    // manual config after Task 11 changes — see Task 13 notes)
    await page.fill('.config-name-input', 'Reconnect Test');
    await page.fill('.config-command-input', 'node');
    await page.fill('.config-args-input', FIXTURE_PATH);
    await page.click('.config-save-btn');

    // Wait for connected
    await expect(page.locator('.connector-status-dot.status-connected')).toBeVisible({ timeout: 15000 });

    // Disconnect via the drawer
    await page.click('.connector-list-item:has-text("Reconnect Test")');
    await page.click('.drawer-status-btn:has-text("Disconnect")');
    await expect(page.locator('.connector-status-dot.status-disconnected')).toBeVisible({ timeout: 5000 });

    // Reconnect
    await page.click('.drawer-status-btn:has-text("Connect")');
    await expect(page.locator('.connector-status-dot.status-connected')).toBeVisible({ timeout: 15000 });

    // Verify tools still listed
    await expect(page.locator('.tool-row')).toHaveCount(3, { timeout: 5000 });

    // Cleanup
    await page.click('.config-delete-btn');
    await app.close();
  });
});
```

Note: Testing true crash recovery (kill process → heartbeat detects → reconnect) requires waiting 90+ seconds for heartbeat timeout. The disconnect/reconnect test above verifies the reconnection mechanism works without the long wait. A separate stress test could be added later for crash recovery.

- [ ] **Step 2: Run the test**

Run: `npx playwright test tests/e2e/connector-reconnect.spec.ts`
Expected: Test passes.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/connector-reconnect.spec.ts
git commit -m "test: add E2E test for connector disconnect/reconnect flow"
```

---

## Chunk 5: Final Verification

### Task 17: Full build and test verification

- [ ] **Step 1: Run full lint**

Run: `npx turbo lint`
Expected: 0 errors.

- [ ] **Step 2: Run full build**

Run: `npx turbo build`
Expected: Clean build, no type errors.

- [ ] **Step 3: Run all unit and integration tests**

Run: `npx vitest run`
Expected: All tests pass (existing + new).

- [ ] **Step 4: Run all E2E tests**

Run: `npx playwright test`
Expected: All tests pass (existing + new).

- [ ] **Step 5: Verify no remaining CLI_CREATE_INSTALL_CONVERSATION references in production code**

Run: `grep -r "CLI_CREATE_INSTALL_CONVERSATION\|createInstallConversation" packages/ apps/ --include='*.ts' -l`
Expected: No results (only test files, docs, or plans may reference them).

- [ ] **Step 6: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "fix: address lint/build issues from Phase 3 completion"
```
