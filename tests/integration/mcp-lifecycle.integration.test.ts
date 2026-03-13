/**
 * Integration test: Full MCP lifecycle with real services.
 * Uses ConnectorConfigStoreImpl (file-based) + real MCPClientManagerImpl
 * + the test MCP server fixture (echo + add tools via stdio transport).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConnectorConfigStoreImpl } from '../../packages/connectors/src/node/connectorConfigStore.js';
import { MCPClientManagerImpl } from '../../packages/connectors/src/node/mcpClientManagerImpl.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dirname, '../fixtures/test-mcp-server.mjs');

describe('MCP lifecycle integration', () => {
  let tmpDir: string;
  let store: ConnectorConfigStoreImpl;
  let manager: MCPClientManagerImpl;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'gho-mcp-lifecycle-'));
    store = new ConnectorConfigStoreImpl(join(tmpDir, 'mcp.json'));
    manager = new MCPClientManagerImpl(store);
  });

  afterEach(async () => {
    manager.dispose();
    store.dispose();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('connects to test server, lists tools, and disconnects', async () => {
    const config = {
      type: 'stdio' as const,
      command: 'node',
      args: [FIXTURE_PATH],
    };

    // Add server to config store
    await store.addServer('test-server', config);

    // Verify stored
    const stored = store.getServer('test-server');
    expect(stored).toBeDefined();
    expect(stored?.type).toBe('stdio');

    // Connect directly via manager
    await manager.connectServer('test-server', config);

    // Check status
    expect(manager.getServerStatus('test-server')).toBe('connected');

    // List tools
    const tools = await manager.getTools('test-server');
    expect(tools.length).toBe(3);
    expect(tools.map(t => t.name).sort()).toEqual(['add', 'echo', 'timestamp']);
    expect(tools.every(t => t.enabled)).toBe(true);

    // Disconnect
    await manager.disconnectServer('test-server');
    expect(manager.getServerStatus('test-server')).toBe('disconnected');
  }, 30_000); // 30s timeout for real stdio process
});
