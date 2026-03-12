/**
 * Integration test: Full MCP lifecycle with real services.
 * Uses in-memory SQLite + real ConnectorRegistryImpl + real MCPClientManagerImpl
 * + the test MCP server fixture (echo + add tools via stdio transport).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configurePragmas, migrateDatabase, GLOBAL_MIGRATIONS } from '@gho-work/platform';
import { ConnectorRegistryImpl, MCPClientManagerImpl } from '@gho-work/connectors';
import type { ConnectorConfig } from '@gho-work/base';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('MCP lifecycle integration', () => {
  let db: Database.Database;
  let registry: ConnectorRegistryImpl;
  let manager: MCPClientManagerImpl;

  beforeEach(() => {
    db = new Database(':memory:');
    configurePragmas(db);
    migrateDatabase(db, GLOBAL_MIGRATIONS);
    registry = new ConnectorRegistryImpl(db);
    manager = new MCPClientManagerImpl(registry);
  });

  afterEach(async () => {
    manager.dispose();
    registry.dispose();
    db.close();
  });

  it('connects to test server, lists tools, and disconnects', async () => {
    const config: ConnectorConfig = {
      id: 'test-server',
      type: 'local_mcp',
      name: 'Test MCP Server',
      transport: 'stdio',
      command: 'npx',
      args: ['tsx', resolve(__dirname, '../fixtures/test-mcp-server.ts')],
      enabled: true,
      status: 'disconnected',
    };

    // Register connector
    await registry.addConnector(config);

    // Verify registered
    const registered = await registry.getConnector('test-server');
    expect(registered).toBeDefined();
    expect(registered?.name).toBe('Test MCP Server');

    // Connect
    await manager.connectServer('test-server');

    // Check status
    expect(manager.getServerStatus('test-server')).toBe('connected');

    // List tools
    const tools = await manager.getTools('test-server');
    expect(tools.length).toBe(2);
    expect(tools.map(t => t.name).sort()).toEqual(['add', 'echo']);
    expect(tools.every(t => t.enabled)).toBe(true);

    // Disconnect
    await manager.disconnectServer('test-server');
    expect(manager.getServerStatus('test-server')).toBe('disconnected');
  }, 30_000); // 30s timeout for real stdio process
});
