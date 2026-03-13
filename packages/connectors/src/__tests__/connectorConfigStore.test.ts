import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { MCPServerConfig } from '@gho-work/base';
import { ConnectorConfigStoreImpl } from '../node/connectorConfigStore.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'connector-config-store-test-'));
}

function makeStdioConfig(overrides: Partial<MCPServerConfig> = {}): MCPServerConfig {
  return {
    type: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    env: { NODE_ENV: 'test' },
    ...overrides,
  };
}

describe('ConnectorConfigStoreImpl', () => {
  let tmpDir: string;
  let filePath: string;
  let store: ConnectorConfigStoreImpl;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    filePath = path.join(tmpDir, 'mcp.json');
    store = new ConnectorConfigStoreImpl(filePath);
  });

  afterEach(() => {
    store.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // --- File creation ---

  it('creates mcp.json with empty servers if file does not exist', () => {
    expect(fs.existsSync(filePath)).toBe(true);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed).toHaveProperty('servers');
    expect(parsed.servers).toEqual({});
  });

  it('reads existing mcp.json on construction', async () => {
    // Write a pre-existing config
    const existing = {
      servers: {
        'pre-existing': makeStdioConfig({ command: 'pre-cmd' }),
      },
    };
    fs.writeFileSync(filePath, JSON.stringify(existing, null, 2), 'utf-8');
    store.dispose();

    const store2 = new ConnectorConfigStoreImpl(filePath);
    try {
      const config = store2.getServer('pre-existing');
      expect(config).toBeDefined();
      expect(config!.command).toBe('pre-cmd');
    } finally {
      store2.dispose();
    }
  });

  // --- getFilePath ---

  it('returns file path via getFilePath()', () => {
    expect(store.getFilePath()).toBe(filePath);
  });

  // --- getServer ---

  it('getServer returns undefined for unknown server', () => {
    expect(store.getServer('nonexistent')).toBeUndefined();
  });

  it('getServer returns config after addServer', async () => {
    await store.addServer('my-server', makeStdioConfig());
    const config = store.getServer('my-server');
    expect(config).toBeDefined();
    expect(config!.command).toBe('npx');
    expect(config!.type).toBe('stdio');
  });

  // --- addServer ---

  it('addServer persists to disk', async () => {
    const config = makeStdioConfig();
    await store.addServer('test-server', config);

    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.servers['test-server']).toBeDefined();
    expect(parsed.servers['test-server'].command).toBe('npx');
  });

  it('addServer fires onDidChangeServers event', async () => {
    const events: Map<string, MCPServerConfig>[] = [];
    const sub = store.onDidChangeServers(e => events.push(e));
    await store.addServer('test-server', makeStdioConfig());
    sub.dispose();

    expect(events).toHaveLength(1);
    expect(events[0].has('test-server')).toBe(true);
  });

  it('addServer throws if name already exists', async () => {
    await store.addServer('test-server', makeStdioConfig());
    await expect(store.addServer('test-server', makeStdioConfig())).rejects.toThrow(
      'Server already exists: test-server',
    );
  });

  // --- updateServer ---

  it('updateServer updates and persists to disk', async () => {
    await store.addServer('test-server', makeStdioConfig());
    const updated = makeStdioConfig({ command: 'bun', args: ['run', 'server.ts'] });
    await store.updateServer('test-server', updated);

    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.servers['test-server'].command).toBe('bun');
  });

  it('updateServer throws if server not found', async () => {
    await expect(store.updateServer('nonexistent', makeStdioConfig())).rejects.toThrow(
      'Server not found: nonexistent',
    );
  });

  it('updateServer fires onDidChangeServers event', async () => {
    await store.addServer('test-server', makeStdioConfig());
    const events: Map<string, MCPServerConfig>[] = [];
    const sub = store.onDidChangeServers(e => events.push(e));
    await store.updateServer('test-server', makeStdioConfig({ command: 'bun' }));
    sub.dispose();

    expect(events).toHaveLength(1);
    expect(events[0].get('test-server')!.command).toBe('bun');
  });

  // --- removeServer ---

  it('removeServer removes and persists to disk', async () => {
    await store.addServer('test-server', makeStdioConfig());
    await store.removeServer('test-server');

    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.servers['test-server']).toBeUndefined();
  });

  it('removeServer fires onDidChangeServers event', async () => {
    await store.addServer('test-server', makeStdioConfig());
    const events: Map<string, MCPServerConfig>[] = [];
    const sub = store.onDidChangeServers(e => events.push(e));
    await store.removeServer('test-server');
    sub.dispose();

    expect(events).toHaveLength(1);
    expect(events[0].has('test-server')).toBe(false);
  });

  it('removeServer throws if server not found', async () => {
    await expect(store.removeServer('nonexistent')).rejects.toThrow(
      'Server not found: nonexistent',
    );
  });

  // --- getServers ---

  it('getServers returns a copy of all servers', async () => {
    await store.addServer('server-a', makeStdioConfig({ command: 'cmd-a' }));
    await store.addServer('server-b', makeStdioConfig({ command: 'cmd-b' }));

    const servers = store.getServers();
    expect(servers.size).toBe(2);
    expect(servers.has('server-a')).toBe(true);
    expect(servers.has('server-b')).toBe(true);

    // Verify it's a copy — mutations don't affect internal state
    servers.delete('server-a');
    expect(store.getServers().size).toBe(2);
  });

  // --- Atomic writes ---

  it('no .tmp file left behind after write', async () => {
    await store.addServer('test-server', makeStdioConfig());
    const tmpFile = filePath + '.tmp';
    expect(fs.existsSync(tmpFile)).toBe(false);
  });

  // --- Corruption handling ---

  it('keeps last-known-good config when mcp.json is corrupted', async () => {
    await store.addServer('good-server', makeStdioConfig());

    // Corrupt the file
    fs.writeFileSync(filePath, '{ this is not valid JSON }', 'utf-8');

    // Re-read from corrupted file — should keep last-known-good in memory
    store._readFile();

    // In-memory state should still be the last good state
    expect(store.getServer('good-server')).toBeDefined();
  });

  it('loads empty state when mcp.json is corrupted on construction', () => {
    // Write corrupted file before construction
    store.dispose();
    fs.writeFileSync(filePath, '{ corrupted }', 'utf-8');

    const store2 = new ConnectorConfigStoreImpl(filePath);
    try {
      // Should not throw; should have empty servers
      expect(store2.getServers().size).toBe(0);
    } finally {
      store2.dispose();
    }
  });

  // --- HTTP server config ---

  it('stores and retrieves http server config', async () => {
    const httpConfig: MCPServerConfig = {
      type: 'http',
      url: 'https://example.com/mcp',
      headers: { Authorization: 'Bearer token123' },
    };
    await store.addServer('http-server', httpConfig);

    const retrieved = store.getServer('http-server');
    expect(retrieved).toBeDefined();
    expect(retrieved!.type).toBe('http');
    expect(retrieved!.url).toBe('https://example.com/mcp');
    expect(retrieved!.headers).toEqual({ Authorization: 'Bearer token123' });

    // Verify persisted correctly
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.servers['http-server'].url).toBe('https://example.com/mcp');
  });

  // --- Dispose ---

  it('dispose cleans up without throwing', () => {
    expect(() => store.dispose()).not.toThrow();
  });

  it('dispose closes file watcher', async () => {
    await store.addServer('test-server', makeStdioConfig());
    store.dispose();
    // Verify no watcher is running by writing to disk — no errors expected
    fs.writeFileSync(filePath, JSON.stringify({ servers: {} }, null, 2), 'utf-8');
  });
});
