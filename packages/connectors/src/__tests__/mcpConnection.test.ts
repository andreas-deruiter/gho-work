import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ConnectorConfig } from '@gho-work/base';

const mockClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  listTools: vi.fn().mockResolvedValue({
    tools: [
      { name: 'read-file', description: 'Read a file' },
      { name: 'write-file', description: 'Write a file', inputSchema: { type: 'object' } },
    ],
  }),
  ping: vi.fn().mockResolvedValue({}),
  setNotificationHandler: vi.fn(),
};

vi.mock('@modelcontextprotocol/sdk/client', () => ({
  Client: vi.fn().mockImplementation(() => mockClient),
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio', () => ({
  StdioClientTransport: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp', () => ({
  StreamableHTTPClientTransport: vi.fn(),
}));

// Import after mocks are registered
import { MCPConnection } from '../node/mcpConnection.js';
import { Client } from '@modelcontextprotocol/sdk/client';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp';

const stdioConfig: ConnectorConfig = {
  id: 'test-stdio',
  type: 'local_mcp',
  name: 'Test Stdio Server',
  transport: 'stdio',
  command: 'node',
  args: ['server.js'],
  env: { NODE_ENV: 'test' },
  enabled: true,
  status: 'disconnected',
};

const httpConfig: ConnectorConfig = {
  id: 'test-http',
  type: 'remote_mcp',
  name: 'Test HTTP Server',
  transport: 'streamable_http',
  url: 'http://localhost:3000/mcp',
  headers: { Authorization: 'Bearer token' },
  enabled: true,
  status: 'disconnected',
};

describe('MCPConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.connect.mockResolvedValue(undefined);
    mockClient.close.mockResolvedValue(undefined);
    mockClient.listTools.mockResolvedValue({
      tools: [
        { name: 'read-file', description: 'Read a file' },
        { name: 'write-file', description: 'Write a file', inputSchema: { type: 'object' } },
      ],
    });
    mockClient.ping.mockResolvedValue({});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('connect() with stdio config', () => {
    it('creates StdioClientTransport with correct args', async () => {
      const conn = new MCPConnection(stdioConfig);
      await conn.connect();

      expect(StdioClientTransport).toHaveBeenCalledWith({
        command: 'node',
        args: ['server.js'],
        env: { NODE_ENV: 'test' },
      });
      conn.dispose();
    });

    it('creates Client and calls connect', async () => {
      const conn = new MCPConnection(stdioConfig);
      await conn.connect();

      expect(Client).toHaveBeenCalledWith({ name: 'gho-work', version: '1.0.0' });
      expect(mockClient.connect).toHaveBeenCalledTimes(1);
      conn.dispose();
    });

    it('refreshes tools after connecting', async () => {
      const conn = new MCPConnection(stdioConfig);
      await conn.connect();

      expect(mockClient.listTools).toHaveBeenCalledTimes(1);
      expect(conn.listTools()).toHaveLength(2);
      conn.dispose();
    });

    it('sets status to connected after successful connect', async () => {
      const conn = new MCPConnection(stdioConfig);
      await conn.connect();

      expect(conn.status).toBe('connected');
      conn.dispose();
    });
  });

  describe('connect() with HTTP config', () => {
    it('creates StreamableHTTPClientTransport with correct URL', async () => {
      const conn = new MCPConnection(httpConfig);
      await conn.connect();

      expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
        new URL('http://localhost:3000/mcp'),
        { requestInit: { headers: { Authorization: 'Bearer token' } } },
      );
      conn.dispose();
    });

    it('creates StreamableHTTPClientTransport without requestInit when no headers', async () => {
      const configNoHeaders: ConnectorConfig = {
        ...httpConfig,
        headers: undefined,
      };
      const conn = new MCPConnection(configNoHeaders);
      await conn.connect();

      expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
        new URL('http://localhost:3000/mcp'),
        undefined,
      );
      conn.dispose();
    });
  });

  describe('disconnect()', () => {
    it('calls client.close()', async () => {
      const conn = new MCPConnection(stdioConfig);
      await conn.connect();
      await conn.disconnect();

      expect(mockClient.close).toHaveBeenCalledTimes(1);
    });

    it('sets status to disconnected', async () => {
      const conn = new MCPConnection(stdioConfig);
      await conn.connect();
      await conn.disconnect();

      expect(conn.status).toBe('disconnected');
    });

    it('is safe to call when not connected', async () => {
      const conn = new MCPConnection(stdioConfig);
      await expect(conn.disconnect()).resolves.not.toThrow();
    });
  });

  describe('listTools()', () => {
    it('returns discovered tools with correct shape', async () => {
      const conn = new MCPConnection(stdioConfig);
      await conn.connect();

      const tools = conn.listTools();
      expect(tools).toHaveLength(2);
      expect(tools[0]).toEqual({
        name: 'read-file',
        description: 'Read a file',
        inputSchema: undefined,
        enabled: true,
      });
      expect(tools[1]).toEqual({
        name: 'write-file',
        description: 'Write a file',
        inputSchema: { type: 'object' },
        enabled: true,
      });
      conn.dispose();
    });

    it('returns empty array before connecting', () => {
      const conn = new MCPConnection(stdioConfig);
      expect(conn.listTools()).toEqual([]);
      conn.dispose();
    });
  });

  describe('toolsConfig filtering', () => {
    it('marks tool as disabled when toolsConfig sets it to false', async () => {
      const configWithDisabled: ConnectorConfig = {
        ...stdioConfig,
        toolsConfig: { 'read-file': false },
      };
      const conn = new MCPConnection(configWithDisabled);
      await conn.connect();

      const tools = conn.listTools();
      const readFile = tools.find(t => t.name === 'read-file');
      const writeFile = tools.find(t => t.name === 'write-file');

      expect(readFile?.enabled).toBe(false);
      expect(writeFile?.enabled).toBe(true);
      conn.dispose();
    });

    it('enables all tools when toolsConfig is empty', async () => {
      const configEmpty: ConnectorConfig = {
        ...stdioConfig,
        toolsConfig: {},
      };
      const conn = new MCPConnection(configEmpty);
      await conn.connect();

      const tools = conn.listTools();
      expect(tools.every(t => t.enabled)).toBe(true);
      conn.dispose();
    });

    it('enables all tools when toolsConfig is undefined', async () => {
      const conn = new MCPConnection(stdioConfig);
      await conn.connect();

      const tools = conn.listTools();
      expect(tools.every(t => t.enabled)).toBe(true);
      conn.dispose();
    });
  });

  describe('status events', () => {
    it('fires onDidChangeStatus with initializing then connected on successful connect', async () => {
      const conn = new MCPConnection(stdioConfig);
      const statusEvents: ConnectorConfig['status'][] = [];
      conn.onDidChangeStatus(s => statusEvents.push(s));

      await conn.connect();

      expect(statusEvents).toContain('initializing');
      expect(statusEvents).toContain('connected');
      expect(statusEvents[statusEvents.length - 1]).toBe('connected');
      conn.dispose();
    });

    it('fires onDidChangeStatus with disconnected on disconnect', async () => {
      const conn = new MCPConnection(stdioConfig);
      await conn.connect();

      const statusEvents: ConnectorConfig['status'][] = [];
      conn.onDidChangeStatus(s => statusEvents.push(s));
      await conn.disconnect();

      expect(statusEvents).toContain('disconnected');
    });
  });

  describe('connection error handling', () => {
    it('sets status to error when connect throws', async () => {
      mockClient.connect.mockRejectedValueOnce(new Error('Connection refused'));

      const conn = new MCPConnection(stdioConfig);
      await expect(conn.connect()).rejects.toThrow('Connection refused');

      expect(conn.status).toBe('error');
      conn.dispose();
    });

    it('fires onDidChangeStatus with error on failed connect', async () => {
      mockClient.connect.mockRejectedValueOnce(new Error('Timeout'));

      const conn = new MCPConnection(stdioConfig);
      const statusEvents: ConnectorConfig['status'][] = [];
      conn.onDidChangeStatus(s => statusEvents.push(s));

      await conn.connect().catch(() => {});

      expect(statusEvents).toContain('error');
      conn.dispose();
    });
  });

  describe('dispose()', () => {
    it('calls disconnect and cleans up', async () => {
      const conn = new MCPConnection(stdioConfig);
      await conn.connect();
      conn.dispose();

      // Give async disconnect a tick to run
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(mockClient.close).toHaveBeenCalled();
    });
  });

  describe('onDidChangeTools event', () => {
    it('fires when tools are discovered on connect', async () => {
      const conn = new MCPConnection(stdioConfig);
      const toolEvents: unknown[] = [];
      conn.onDidChangeTools(tools => toolEvents.push(tools));

      await conn.connect();

      expect(toolEvents).toHaveLength(1);
      conn.dispose();
    });
  });

  describe('heartbeat timeout → error status', () => {
    it('sets status to error after 3 consecutive ping failures', async () => {
      vi.useFakeTimers();
      mockClient.ping.mockRejectedValue(new Error('ping failed'));

      const conn = new MCPConnection(stdioConfig);
      await conn.connect();

      expect(conn.status).toBe('connected');

      // Advance 3 × 30s = 90s to trigger 3 missed pings
      await vi.advanceTimersByTimeAsync(30_000);
      await vi.advanceTimersByTimeAsync(30_000);
      await vi.advanceTimersByTimeAsync(30_000);

      expect(conn.status).toBe('error');

      conn.dispose();
      vi.useRealTimers();
    });

    it('fires onDidChangeStatus with error after 3 ping failures', async () => {
      vi.useFakeTimers();
      mockClient.ping.mockRejectedValue(new Error('ping failed'));

      const conn = new MCPConnection(stdioConfig);
      const statusEvents: ConnectorConfig['status'][] = [];
      conn.onDidChangeStatus(s => statusEvents.push(s));

      await conn.connect();

      await vi.advanceTimersByTimeAsync(30_000);
      await vi.advanceTimersByTimeAsync(30_000);
      await vi.advanceTimersByTimeAsync(30_000);

      expect(statusEvents).toContain('error');

      conn.dispose();
      vi.useRealTimers();
    });
  });

  describe('tool list refresh on notification', () => {
    it('calls listTools again when ToolListChanged notification is received', async () => {
      const conn = new MCPConnection(stdioConfig);
      await conn.connect();

      // listTools was called once during connect
      expect(mockClient.listTools).toHaveBeenCalledTimes(1);

      // Capture the notification handler registered with the client
      const setNotificationHandlerCall = mockClient.setNotificationHandler.mock.calls[0];
      expect(setNotificationHandlerCall).toBeDefined();
      const notificationHandler = setNotificationHandlerCall[1] as () => Promise<void>;

      // Update the mock to return new tools
      mockClient.listTools.mockResolvedValue({
        tools: [
          { name: 'read-file', description: 'Read a file' },
          { name: 'write-file', description: 'Write a file', inputSchema: { type: 'object' } },
          { name: 'delete-file', description: 'Delete a file' },
        ],
      });

      // Fire the notification
      await notificationHandler();

      expect(mockClient.listTools).toHaveBeenCalledTimes(2);
      expect(conn.listTools()).toHaveLength(3);

      conn.dispose();
    });

    it('fires onDidChangeTools after notification-triggered refresh', async () => {
      const conn = new MCPConnection(stdioConfig);
      const toolEvents: unknown[][] = [];
      conn.onDidChangeTools(tools => toolEvents.push(tools as unknown[]));

      await conn.connect();
      expect(toolEvents).toHaveLength(1);

      const notificationHandler = mockClient.setNotificationHandler.mock.calls[0][1] as () => Promise<void>;

      mockClient.listTools.mockResolvedValue({
        tools: [{ name: 'new-tool', description: 'A new tool' }],
      });

      await notificationHandler();

      expect(toolEvents).toHaveLength(2);
      const lastTools = toolEvents[1] as Array<{ name: string }>;
      expect(lastTools[0].name).toBe('new-tool');

      conn.dispose();
    });
  });
});
