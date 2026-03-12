import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ConnectorConfig } from '@gho-work/base';
import type { ToolInfo } from '../common/mcpClientManager.js';
import type { IConnectorRegistry } from '../common/connectorRegistry.js';

// --- Mock MCPConnection ---

type StatusListener = (status: ConnectorConfig['status']) => void;
type ToolsListener = (tools: ToolInfo[]) => void;

interface MockMCPConnectionInstance {
  status: ConnectorConfig['status'];
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  listTools: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  onDidChangeStatus: (listener: StatusListener) => void;
  onDidChangeTools: (listener: ToolsListener) => void;
  _statusListeners: StatusListener[];
  _toolsListeners: ToolsListener[];
  _fireStatus: (s: ConnectorConfig['status']) => void;
  _fireTools: (t: ToolInfo[]) => void;
}

function createMockConnection(
  connectImpl?: () => Promise<void>,
): MockMCPConnectionInstance {
  const instance: MockMCPConnectionInstance = {
    status: 'disconnected' as ConnectorConfig['status'],
    connect: vi.fn().mockImplementation(connectImpl ?? (() => Promise.resolve())),
    disconnect: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockReturnValue([]),
    dispose: vi.fn(),
    onDidChangeStatus: (listener: StatusListener) => {
      instance._statusListeners.push(listener);
    },
    onDidChangeTools: (listener: ToolsListener) => {
      instance._toolsListeners.push(listener);
    },
    _statusListeners: [],
    _toolsListeners: [],
    _fireStatus: (s: ConnectorConfig['status']) => {
      instance.status = s;
      instance._statusListeners.forEach(l => l(s));
    },
    _fireTools: (t: ToolInfo[]) => {
      instance._toolsListeners.forEach(l => l(t));
    },
  };
  return instance;
}

// Keep a reference to the last created instance so tests can inspect it
let lastMockInstance: MockMCPConnectionInstance | null = null;
const mockInstances: MockMCPConnectionInstance[] = [];

vi.mock('../node/mcpConnection.js', () => {
  const MockMCPConnection = vi.fn().mockImplementation(() => {
    const inst = createMockConnection();
    lastMockInstance = inst;
    mockInstances.push(inst);
    return inst;
  });
  return { MCPConnection: MockMCPConnection };
});

// Import after mocks
import { MCPClientManagerImpl } from '../node/mcpClientManagerImpl.js';
import { MCPConnection } from '../node/mcpConnection.js';

// --- Helpers ---

function makeConfig(overrides: Partial<ConnectorConfig> = {}): ConnectorConfig {
  return {
    id: 'conn-1',
    type: 'local_mcp',
    name: 'Test Server',
    transport: 'stdio',
    command: 'node',
    args: ['server.js'],
    enabled: true,
    status: 'disconnected',
    ...overrides,
  };
}

function makeRegistry(
  connectors: ConnectorConfig[] = [],
): IConnectorRegistry & { _statuses: Map<string, ConnectorConfig['status']> } {
  const _statuses = new Map<string, ConnectorConfig['status']>();
  const map = new Map<string, ConnectorConfig>(connectors.map(c => [c.id, c]));

  return {
    _statuses,
    addConnector: vi.fn(),
    updateConnector: vi.fn(),
    removeConnector: vi.fn(),
    getConnector: vi.fn().mockImplementation(async (id: string) => map.get(id)),
    getConnectors: vi.fn().mockResolvedValue(connectors),
    getEnabledConnectors: vi.fn().mockResolvedValue(connectors.filter(c => c.enabled)),
    updateStatus: vi.fn().mockImplementation(async (id: string, status: ConnectorConfig['status']) => {
      _statuses.set(id, status);
    }),
    onDidChangeConnectors: vi.fn() as unknown as IConnectorRegistry['onDidChangeConnectors'],
    onDidChangeStatus: vi.fn() as unknown as IConnectorRegistry['onDidChangeStatus'],
    dispose: vi.fn(),
  };
}

// --- Tests ---

describe('MCPClientManagerImpl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastMockInstance = null;
    mockInstances.length = 0;
    (MCPConnection as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const inst = createMockConnection();
      lastMockInstance = inst;
      mockInstances.push(inst);
      return inst;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // --- connectServer ---

  describe('connectServer()', () => {
    it('gets config from registry and calls connect()', async () => {
      const config = makeConfig();
      const registry = makeRegistry([config]);
      const manager = new MCPClientManagerImpl(registry);

      await manager.connectServer('conn-1');

      expect(registry.getConnector).toHaveBeenCalledWith('conn-1');
      expect(MCPConnection).toHaveBeenCalledWith(config);
      expect(lastMockInstance!.connect).toHaveBeenCalledTimes(1);

      manager.dispose();
    });

    it('throws when connector ID is not found in registry', async () => {
      const registry = makeRegistry([]);
      const manager = new MCPClientManagerImpl(registry);

      await expect(manager.connectServer('unknown-id')).rejects.toThrow('Connector not found: unknown-id');

      manager.dispose();
    });

    it('replaces existing connection when called again for same ID', async () => {
      const config = makeConfig();
      const registry = makeRegistry([config]);
      const manager = new MCPClientManagerImpl(registry);

      await manager.connectServer('conn-1');
      const first = lastMockInstance!;

      await manager.connectServer('conn-1');

      // The first connection should have been disposed
      expect(first.dispose).toHaveBeenCalled();
      // A new connection should have been created
      expect(MCPConnection).toHaveBeenCalledTimes(2);

      manager.dispose();
    });

    it('updates registry status to connected via onDidChangeStatus forwarding', async () => {
      const config = makeConfig();
      const registry = makeRegistry([config]);
      const manager = new MCPClientManagerImpl(registry);

      await manager.connectServer('conn-1');

      // Simulate connection firing a status event
      lastMockInstance!._fireStatus('connected');

      expect(registry.updateStatus).toHaveBeenCalledWith('conn-1', 'connected');

      manager.dispose();
    });

    it('does not throw when connection fails (error is swallowed)', async () => {
      const config = makeConfig();
      const registry = makeRegistry([config]);
      (MCPConnection as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        const inst = createMockConnection(() => Promise.reject(new Error('refused')));
        lastMockInstance = inst;
        mockInstances.push(inst);
        return inst;
      });
      const manager = new MCPClientManagerImpl(registry);

      await expect(manager.connectServer('conn-1')).resolves.not.toThrow();

      manager.dispose();
    });
  });

  // --- disconnectServer ---

  describe('disconnectServer()', () => {
    it('calls disconnect() and dispose() on the connection', async () => {
      const config = makeConfig();
      const registry = makeRegistry([config]);
      const manager = new MCPClientManagerImpl(registry);

      await manager.connectServer('conn-1');
      const conn = lastMockInstance!;
      await manager.disconnectServer('conn-1');

      expect(conn.disconnect).toHaveBeenCalledTimes(1);
      expect(conn.dispose).toHaveBeenCalledTimes(1);

      manager.dispose();
    });

    it('updates registry status to disconnected', async () => {
      const config = makeConfig();
      const registry = makeRegistry([config]);
      const manager = new MCPClientManagerImpl(registry);

      await manager.connectServer('conn-1');
      await manager.disconnectServer('conn-1');

      expect(registry.updateStatus).toHaveBeenCalledWith('conn-1', 'disconnected');

      manager.dispose();
    });

    it('is a no-op for unknown connector ID', async () => {
      const registry = makeRegistry([]);
      const manager = new MCPClientManagerImpl(registry);

      await expect(manager.disconnectServer('unknown')).resolves.not.toThrow();

      manager.dispose();
    });

    it('removes connection from active connections', async () => {
      const config = makeConfig();
      const registry = makeRegistry([config]);
      const manager = new MCPClientManagerImpl(registry);

      await manager.connectServer('conn-1');
      await manager.disconnectServer('conn-1');

      // After disconnect, getTools should return [] (no active connection)
      const tools = await manager.getTools('conn-1');
      expect(tools).toEqual([]);

      manager.dispose();
    });
  });

  // --- disconnectAll ---

  describe('disconnectAll()', () => {
    it('disconnects all active connections', async () => {
      const configs = [makeConfig({ id: 'conn-1' }), makeConfig({ id: 'conn-2' })];
      const registry = makeRegistry(configs);
      const manager = new MCPClientManagerImpl(registry);

      await manager.connectServer('conn-1');
      const conn1 = mockInstances[0];
      await manager.connectServer('conn-2');
      const conn2 = mockInstances[1];

      await manager.disconnectAll();

      expect(conn1.disconnect).toHaveBeenCalled();
      expect(conn2.disconnect).toHaveBeenCalled();

      manager.dispose();
    });

    it('leaves no active connections after call', async () => {
      const configs = [makeConfig({ id: 'conn-1' }), makeConfig({ id: 'conn-2' })];
      const registry = makeRegistry(configs);
      const manager = new MCPClientManagerImpl(registry);

      await manager.connectServer('conn-1');
      await manager.connectServer('conn-2');
      await manager.disconnectAll();

      expect(await manager.getTools('conn-1')).toEqual([]);
      expect(await manager.getTools('conn-2')).toEqual([]);

      manager.dispose();
    });
  });

  // --- getTools ---

  describe('getTools()', () => {
    it('returns tools from active connection', async () => {
      const config = makeConfig();
      const registry = makeRegistry([config]);
      const manager = new MCPClientManagerImpl(registry);
      const tools: ToolInfo[] = [{ name: 'read-file', description: 'Read', enabled: true }];

      await manager.connectServer('conn-1');
      lastMockInstance!.listTools.mockReturnValue(tools);

      const result = await manager.getTools('conn-1');
      expect(result).toEqual(tools);

      manager.dispose();
    });

    it('returns empty array for unknown connector ID', async () => {
      const registry = makeRegistry([]);
      const manager = new MCPClientManagerImpl(registry);

      const result = await manager.getTools('unknown');
      expect(result).toEqual([]);

      manager.dispose();
    });
  });

  // --- getAllTools ---

  describe('getAllTools()', () => {
    it('returns a map of all connections tools', async () => {
      const configs = [makeConfig({ id: 'conn-1' }), makeConfig({ id: 'conn-2' })];
      const registry = makeRegistry(configs);
      const manager = new MCPClientManagerImpl(registry);
      const tools1: ToolInfo[] = [{ name: 'tool-a', description: 'A', enabled: true }];
      const tools2: ToolInfo[] = [{ name: 'tool-b', description: 'B', enabled: true }];

      await manager.connectServer('conn-1');
      mockInstances[0].listTools.mockReturnValue(tools1);
      await manager.connectServer('conn-2');
      mockInstances[1].listTools.mockReturnValue(tools2);

      const result = await manager.getAllTools();

      expect(result.get('conn-1')).toEqual(tools1);
      expect(result.get('conn-2')).toEqual(tools2);

      manager.dispose();
    });

    it('returns empty map when no connections are active', async () => {
      const registry = makeRegistry([]);
      const manager = new MCPClientManagerImpl(registry);

      const result = await manager.getAllTools();
      expect(result.size).toBe(0);

      manager.dispose();
    });
  });

  // --- testConnection ---

  describe('testConnection()', () => {
    it('returns { success: true } when connection succeeds', async () => {
      const config = makeConfig();
      const registry = makeRegistry([]);
      const manager = new MCPClientManagerImpl(registry);

      const result = await manager.testConnection(config);

      expect(result).toEqual({ success: true });
      // Should have connected and disconnected the temp connection
      expect(lastMockInstance!.connect).toHaveBeenCalled();
      expect(lastMockInstance!.disconnect).toHaveBeenCalled();
      expect(lastMockInstance!.dispose).toHaveBeenCalled();

      manager.dispose();
    });

    it('returns { success: false, error: message } when connection fails', async () => {
      const config = makeConfig();
      const registry = makeRegistry([]);
      (MCPConnection as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        const inst = createMockConnection(() => Promise.reject(new Error('ECONNREFUSED')));
        lastMockInstance = inst;
        mockInstances.push(inst);
        return inst;
      });
      const manager = new MCPClientManagerImpl(registry);

      const result = await manager.testConnection(config);

      expect(result.success).toBe(false);
      expect(result.error).toBe('ECONNREFUSED');
      expect(lastMockInstance!.dispose).toHaveBeenCalled();

      manager.dispose();
    });

    it('disposes temp connection on failure', async () => {
      const config = makeConfig();
      const registry = makeRegistry([]);
      (MCPConnection as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        const inst = createMockConnection(() => Promise.reject(new Error('fail')));
        lastMockInstance = inst;
        mockInstances.push(inst);
        return inst;
      });
      const manager = new MCPClientManagerImpl(registry);

      await manager.testConnection(config);

      expect(lastMockInstance!.dispose).toHaveBeenCalled();

      manager.dispose();
    });
  });

  // --- getServerStatus ---

  describe('getServerStatus()', () => {
    it('returns status from active connection', async () => {
      const config = makeConfig();
      const registry = makeRegistry([config]);
      const manager = new MCPClientManagerImpl(registry);

      await manager.connectServer('conn-1');
      lastMockInstance!.status = 'connected';

      const status = manager.getServerStatus('conn-1');
      expect(status).toBe('connected');

      manager.dispose();
    });

    it("returns 'disconnected' for unknown connector ID", () => {
      const registry = makeRegistry([]);
      const manager = new MCPClientManagerImpl(registry);

      expect(manager.getServerStatus('unknown')).toBe('disconnected');

      manager.dispose();
    });
  });

  // --- onDidChangeStatus ---

  describe('onDidChangeStatus event', () => {
    it('fires when a connection fires a status change', async () => {
      const config = makeConfig();
      const registry = makeRegistry([config]);
      const manager = new MCPClientManagerImpl(registry);
      const events: Array<{ connectorId: string; status: ConnectorConfig['status'] }> = [];

      manager.onDidChangeStatus(e => events.push(e));
      await manager.connectServer('conn-1');
      lastMockInstance!._fireStatus('connected');

      expect(events).toContainEqual({ connectorId: 'conn-1', status: 'connected' });

      manager.dispose();
    });
  });

  // --- onDidChangeTools event ---

  describe('onDidChangeTools event', () => {
    it('fires when a connection fires a tools change', async () => {
      const config = makeConfig();
      const registry = makeRegistry([config]);
      const manager = new MCPClientManagerImpl(registry);
      const events: Array<{ connectorId: string; tools: ToolInfo[] }> = [];
      const tools: ToolInfo[] = [{ name: 'my-tool', description: 'desc', enabled: true }];

      manager.onDidChangeTools(e => events.push(e));
      await manager.connectServer('conn-1');
      lastMockInstance!._fireTools(tools);

      expect(events).toContainEqual({ connectorId: 'conn-1', tools });

      manager.dispose();
    });
  });

  // --- dispose ---

  describe('dispose()', () => {
    it('disconnects all active connections on dispose', async () => {
      const configs = [makeConfig({ id: 'conn-1' }), makeConfig({ id: 'conn-2' })];
      const registry = makeRegistry(configs);
      const manager = new MCPClientManagerImpl(registry);

      await manager.connectServer('conn-1');
      const conn1 = mockInstances[0];
      await manager.connectServer('conn-2');
      const conn2 = mockInstances[1];

      manager.dispose();

      // Give async disconnect a tick to run
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(conn1.disconnect).toHaveBeenCalled();
      expect(conn2.disconnect).toHaveBeenCalled();
    });
  });
});
