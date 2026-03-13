import { describe, it, expect, vi } from 'vitest';
import type { MCPServerConfig } from '@gho-work/base';
import type { IConnectorConfigStore } from '../common/connectorConfigStore.js';
import {
  handleAddMCPServer,
  handleRemoveMCPServer,
  handleListMCPServers,
} from '../node/agentTools.js';

function makeStore(servers: Record<string, MCPServerConfig> = {}): IConnectorConfigStore {
  const map = new Map(Object.entries(servers));
  return {
    getServers: () => new Map(map),
    getServer: (name: string) => map.get(name),
    addServer: vi.fn(async (name: string, config: MCPServerConfig) => {
      if (map.has(name)) { throw new Error(`Server already exists: ${name}`); }
      map.set(name, config);
    }),
    updateServer: vi.fn(),
    removeServer: vi.fn(async (name: string) => {
      if (!map.has(name)) { throw new Error(`Server not found: ${name}`); }
      map.delete(name);
    }),
    getFilePath: () => '/tmp/mcp.json',
    onDidChangeServers: () => ({ dispose: () => {} }),
    dispose: vi.fn(),
  } as unknown as IConnectorConfigStore;
}

describe('handleAddMCPServer', () => {
  it('adds a stdio server', async () => {
    const store = makeStore();
    const result = await handleAddMCPServer(store, {
      name: 'my-server',
      type: 'stdio',
      command: 'node',
      args: ['server.js'],
    });
    expect(result.success).toBe(true);
    expect(store.addServer).toHaveBeenCalledWith('my-server', {
      type: 'stdio',
      command: 'node',
      args: ['server.js'],
    });
  });

  it('adds an http server', async () => {
    const store = makeStore();
    const result = await handleAddMCPServer(store, {
      name: 'remote',
      type: 'http',
      url: 'https://example.com/mcp',
    });
    expect(result.success).toBe(true);
    expect(store.addServer).toHaveBeenCalledWith('remote', {
      type: 'http',
      url: 'https://example.com/mcp',
    });
  });

  it('rejects empty name', async () => {
    const store = makeStore();
    const result = await handleAddMCPServer(store, {
      name: '',
      type: 'stdio',
      command: 'node',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('name');
  });

  it('rejects invalid type', async () => {
    const store = makeStore();
    const result = await handleAddMCPServer(store, {
      name: 'test',
      type: 'invalid' as any,
      command: 'node',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('type');
  });

  it('rejects stdio without command', async () => {
    const store = makeStore();
    const result = await handleAddMCPServer(store, {
      name: 'test',
      type: 'stdio',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('command');
  });

  it('rejects http without url', async () => {
    const store = makeStore();
    const result = await handleAddMCPServer(store, {
      name: 'test',
      type: 'http',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('url');
  });

  it('returns error when server already exists', async () => {
    const store = makeStore({ existing: { type: 'stdio', command: 'x' } });
    const result = await handleAddMCPServer(store, {
      name: 'existing',
      type: 'stdio',
      command: 'y',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('already exists');
  });
});

describe('handleRemoveMCPServer', () => {
  it('removes an existing server', async () => {
    const store = makeStore({ 'my-server': { type: 'stdio', command: 'node' } });
    const result = await handleRemoveMCPServer(store, { name: 'my-server' });
    expect(result.success).toBe(true);
    expect(store.removeServer).toHaveBeenCalledWith('my-server');
  });

  it('rejects empty name', async () => {
    const store = makeStore();
    const result = await handleRemoveMCPServer(store, { name: '' });
    expect(result.success).toBe(false);
  });

  it('returns error when server not found', async () => {
    const store = makeStore();
    const result = await handleRemoveMCPServer(store, { name: 'nope' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });
});

describe('handleListMCPServers', () => {
  it('lists all servers', async () => {
    const store = makeStore({
      s1: { type: 'stdio', command: 'node' },
      s2: { type: 'http', url: 'https://example.com' },
    });
    const result = await handleListMCPServers(store);
    expect(result.servers).toHaveLength(2);
    expect(result.servers[0].name).toBe('s1');
    expect(result.servers[1].name).toBe('s2');
  });

  it('returns empty array when no servers', async () => {
    const store = makeStore();
    const result = await handleListMCPServers(store);
    expect(result.servers).toHaveLength(0);
  });
});
