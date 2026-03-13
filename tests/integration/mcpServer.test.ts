/**
 * Integration test: MCPConnection with a real MCP server process.
 * Spawns the test fixture server via stdio, connects MCPConnection directly,
 * lists tools, verifies tool metadata, and disconnects cleanly.
 *
 * MCPConnection does not expose callTool() — tool invocation is handled
 * at the MCPClientManager level. This test covers connect/listTools/disconnect.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ConnectorConfig } from '@gho-work/base';
import { MCPConnection } from '../../packages/connectors/src/node/mcpConnection.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dirname, '../fixtures/test-mcp-server.mjs');

describe('MCP Server Integration (MCPConnection)', () => {
  let connection: MCPConnection | null = null;

  afterEach(async () => {
    if (connection) {
      await connection.disconnect();
      connection.dispose();
      connection = null;
    }
  });

  it('connects to real MCP server, lists tools, and disconnects cleanly', async () => {
    const config: ConnectorConfig = {
      id: 'test-integration',
      type: 'local_mcp',
      name: 'Integration Test Server',
      transport: 'stdio',
      command: 'node',
      args: [FIXTURE_PATH],
      enabled: true,
      status: 'disconnected',
    };

    connection = new MCPConnection(config);

    // Track status transitions
    const statuses: ConnectorConfig['status'][] = [];
    connection.onDidChangeStatus(s => statuses.push(s));

    // Connect
    await connection.connect();
    expect(connection.status).toBe('connected');

    // List tools
    const tools = connection.listTools();
    expect(tools).toHaveLength(3);

    const toolNames = tools.map(t => t.name);
    expect(toolNames).toContain('echo');
    expect(toolNames).toContain('add');
    expect(toolNames).toContain('timestamp');

    // All tools should be enabled by default (no toolsConfig provided)
    expect(tools.every(t => t.enabled)).toBe(true);

    // Tools should have descriptions
    const echoTool = tools.find(t => t.name === 'echo');
    expect(echoTool?.description).toBe('Returns the input text');

    const addTool = tools.find(t => t.name === 'add');
    expect(addTool?.description).toBe('Adds two numbers');

    // Disconnect
    await connection.disconnect();
    expect(connection.status).toBe('disconnected');

    // Verify status transitions: initializing → connected → disconnected
    expect(statuses).toContain('initializing');
    expect(statuses).toContain('connected');
    expect(statuses).toContain('disconnected');
  }, 15_000); // generous timeout for process spawn

  it('respects toolsConfig to disable specific tools', async () => {
    const config: ConnectorConfig = {
      id: 'test-integration-tools-config',
      type: 'local_mcp',
      name: 'Integration Test Server (tools config)',
      transport: 'stdio',
      command: 'node',
      args: [FIXTURE_PATH],
      enabled: true,
      status: 'disconnected',
      toolsConfig: { echo: false }, // disable echo tool
    };

    connection = new MCPConnection(config);
    await connection.connect();

    const tools = connection.listTools();
    expect(tools).toHaveLength(3);

    const echoTool = tools.find(t => t.name === 'echo');
    expect(echoTool?.enabled).toBe(false);

    const addTool = tools.find(t => t.name === 'add');
    expect(addTool?.enabled).toBe(true);

    const timestampTool = tools.find(t => t.name === 'timestamp');
    expect(timestampTool?.enabled).toBe(true);

    await connection.disconnect();
  }, 15_000);

  it('fires onDidChangeTools when tools are loaded', async () => {
    const config: ConnectorConfig = {
      id: 'test-integration-tools-event',
      type: 'local_mcp',
      name: 'Integration Test Server (tools event)',
      transport: 'stdio',
      command: 'node',
      args: [FIXTURE_PATH],
      enabled: true,
      status: 'disconnected',
    };

    connection = new MCPConnection(config);

    const toolsChangedEvents: number[] = [];
    connection.onDidChangeTools(tools => toolsChangedEvents.push(tools.length));

    await connection.connect();

    // At least one tools-changed event should have fired during connect
    expect(toolsChangedEvents.length).toBeGreaterThanOrEqual(1);
    expect(toolsChangedEvents[toolsChangedEvents.length - 1]).toBe(3);

    await connection.disconnect();
  }, 15_000);
});
