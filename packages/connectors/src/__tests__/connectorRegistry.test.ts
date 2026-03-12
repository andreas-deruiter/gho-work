import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { GLOBAL_MIGRATIONS, migrateDatabase, configurePragmas } from '@gho-work/platform';
import type { ConnectorConfig } from '@gho-work/base';
import { ConnectorRegistryImpl } from '../node/connectorRegistryImpl.js';

function makeConfig(overrides: Partial<ConnectorConfig> = {}): ConnectorConfig {
  return {
    id: 'conn-1',
    type: 'local_mcp',
    name: 'Test Server',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    env: { NODE_ENV: 'test' },
    enabled: true,
    status: 'disconnected',
    ...overrides,
  };
}

describe('ConnectorRegistryImpl', () => {
  let db: Database.Database;
  let registry: ConnectorRegistryImpl;

  beforeEach(() => {
    db = new Database(':memory:');
    configurePragmas(db);
    migrateDatabase(db, GLOBAL_MIGRATIONS);
    registry = new ConnectorRegistryImpl(db);
  });

  afterEach(() => {
    registry.dispose();
    db.close();
  });

  // --- Basic CRUD ---

  it('addConnector + getConnector round-trip', async () => {
    const config = makeConfig();
    await registry.addConnector(config);
    const result = await registry.getConnector('conn-1');
    expect(result).toBeDefined();
    expect(result!.id).toBe('conn-1');
    expect(result!.name).toBe('Test Server');
    expect(result!.type).toBe('local_mcp');
    expect(result!.transport).toBe('stdio');
    expect(result!.command).toBe('npx');
    expect(result!.enabled).toBe(true);
    expect(result!.status).toBe('disconnected');
  });

  it('getConnector returns undefined for unknown id', async () => {
    const result = await registry.getConnector('nonexistent');
    expect(result).toBeUndefined();
  });

  it('getConnectors returns all connectors', async () => {
    await registry.addConnector(makeConfig({ id: 'conn-1', name: 'Server A' }));
    await registry.addConnector(makeConfig({ id: 'conn-2', name: 'Server B' }));
    const all = await registry.getConnectors();
    expect(all).toHaveLength(2);
    const names = all.map(c => c.name);
    expect(names).toContain('Server A');
    expect(names).toContain('Server B');
  });

  it('getEnabledConnectors filters out disabled connectors', async () => {
    await registry.addConnector(makeConfig({ id: 'conn-1', name: 'Enabled', enabled: true }));
    await registry.addConnector(makeConfig({ id: 'conn-2', name: 'Disabled', enabled: false }));
    const enabled = await registry.getEnabledConnectors();
    expect(enabled).toHaveLength(1);
    expect(enabled[0].name).toBe('Enabled');
  });

  it('updateConnector modifies fields', async () => {
    await registry.addConnector(makeConfig());
    await registry.updateConnector('conn-1', { name: 'Updated Server', enabled: false });
    const result = await registry.getConnector('conn-1');
    expect(result!.name).toBe('Updated Server');
    expect(result!.enabled).toBe(false);
  });

  it('removeConnector deletes the connector', async () => {
    await registry.addConnector(makeConfig());
    await registry.removeConnector('conn-1');
    const result = await registry.getConnector('conn-1');
    expect(result).toBeUndefined();
  });

  it('updateStatus changes status and error', async () => {
    await registry.addConnector(makeConfig());
    await registry.updateStatus('conn-1', 'error', 'Connection refused');
    const result = await registry.getConnector('conn-1');
    expect(result!.status).toBe('error');
    expect(result!.error).toBe('Connection refused');
  });

  it('updateStatus clears error when transitioning to connected', async () => {
    await registry.addConnector(makeConfig({ error: 'old error', status: 'error' }));
    await registry.updateStatus('conn-1', 'connected');
    const result = await registry.getConnector('conn-1');
    expect(result!.status).toBe('connected');
    expect(result!.error).toBeUndefined();
  });

  it('addConnector throws if ID already exists', async () => {
    await registry.addConnector(makeConfig());
    await expect(registry.addConnector(makeConfig())).rejects.toThrow();
  });

  // --- JSON field serialization ---

  it('stores and retrieves args as JSON array', async () => {
    const config = makeConfig({ args: ['arg1', 'arg2', '--flag'] });
    await registry.addConnector(config);
    const result = await registry.getConnector('conn-1');
    expect(result!.args).toEqual(['arg1', 'arg2', '--flag']);
  });

  it('stores and retrieves env as JSON object', async () => {
    const config = makeConfig({ env: { FOO: 'bar', BAZ: 'qux' } });
    await registry.addConnector(config);
    const result = await registry.getConnector('conn-1');
    expect(result!.env).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });

  it('stores and retrieves toolsConfig as JSON', async () => {
    const config = makeConfig({
      toolsConfig: { read_file: true, write_file: false, delete_file: true },
    });
    await registry.addConnector(config);
    const result = await registry.getConnector('conn-1');
    expect(result!.toolsConfig).toEqual({ read_file: true, write_file: false, delete_file: true });
  });

  it('stores and retrieves capabilities as JSON', async () => {
    const config = makeConfig({
      capabilities: { tools: true, resources: false, prompts: true },
    });
    await registry.addConnector(config);
    const result = await registry.getConnector('conn-1');
    expect(result!.capabilities).toEqual({ tools: true, resources: false, prompts: true });
  });

  it('handles http transport with url and headers', async () => {
    const config = makeConfig({
      id: 'http-conn',
      transport: 'streamable_http',
      url: 'https://example.com/mcp',
      headers: { Authorization: 'Bearer token123' },
      command: undefined,
      args: undefined,
    });
    await registry.addConnector(config);
    const result = await registry.getConnector('http-conn');
    expect(result!.transport).toBe('streamable_http');
    expect(result!.url).toBe('https://example.com/mcp');
    expect(result!.headers).toEqual({ Authorization: 'Bearer token123' });
  });

  // --- Event emission ---

  it('onDidChangeConnectors fires on addConnector', async () => {
    const fired: void[] = [];
    const sub = registry.onDidChangeConnectors(() => fired.push(undefined));
    await registry.addConnector(makeConfig());
    sub.dispose();
    expect(fired).toHaveLength(1);
  });

  it('onDidChangeConnectors fires on removeConnector', async () => {
    await registry.addConnector(makeConfig());
    const fired: void[] = [];
    const sub = registry.onDidChangeConnectors(() => fired.push(undefined));
    await registry.removeConnector('conn-1');
    sub.dispose();
    expect(fired).toHaveLength(1);
  });

  it('onDidChangeConnectors fires on updateConnector', async () => {
    await registry.addConnector(makeConfig());
    const fired: void[] = [];
    const sub = registry.onDidChangeConnectors(() => fired.push(undefined));
    await registry.updateConnector('conn-1', { name: 'Updated' });
    sub.dispose();
    expect(fired).toHaveLength(1);
  });

  it('onDidChangeStatus fires on updateStatus', async () => {
    await registry.addConnector(makeConfig());
    const events: { id: string; status: ConnectorConfig['status'] }[] = [];
    const sub = registry.onDidChangeStatus(e => events.push(e));
    await registry.updateStatus('conn-1', 'connected');
    sub.dispose();
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('conn-1');
    expect(events[0].status).toBe('connected');
  });

  it('onDidChangeStatus does not fire on updateConnector', async () => {
    await registry.addConnector(makeConfig());
    const events: unknown[] = [];
    const sub = registry.onDidChangeStatus(e => events.push(e));
    await registry.updateConnector('conn-1', { name: 'Changed' });
    sub.dispose();
    expect(events).toHaveLength(0);
  });

  // --- Dispose ---

  it('dispose cleans up emitters without throwing', () => {
    expect(() => registry.dispose()).not.toThrow();
  });

  it('isDisposed is true after dispose', () => {
    registry.dispose();
    expect(registry.isDisposed).toBe(true);
  });
});
