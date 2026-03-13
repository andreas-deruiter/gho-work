import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MCPServerConfig, MCPServerStatus } from '@gho-work/base';
import type { ToolInfo } from '../common/mcpClientManager.js';
import type { IConnectorConfigStore } from '../common/connectorConfigStore.js';

// --- Mock MCPConnection ---

type StatusListener = (status: MCPServerStatus) => void;
type ToolsListener = (tools: ToolInfo[]) => void;

interface MockMCPConnectionInstance {
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
  _config: MCPServerConfig;
  config: MCPServerConfig;
}

function createMockConnection(
  config: MCPServerConfig,
  connectImpl?: () => Promise<void>,
): MockMCPConnectionInstance {
  const instance: MockMCPConnectionInstance = {
    status: 'disconnected' as MCPServerStatus,
    _config: config,
    config,
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
    _fireStatus: (s: MCPServerStatus) => {
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
  const MockMCPConnection = vi.fn().mockImplementation(
    (_name: string, config: MCPServerConfig) => {
      const inst = createMockConnection(config);
      lastMockInstance = inst;
      mockInstances.push(inst);
      return inst;
    },
  );
  return { MCPConnection: MockMCPConnection };
});

// Import after mocks
import { MCPClientManagerImpl } from '../node/mcpClientManagerImpl.js';
import { MCPConnection } from '../node/mcpConnection.js';

// --- Helpers ---

function makeConfig(overrides: Partial<MCPServerConfig> = {}): MCPServerConfig {
  return {
    type: 'stdio',
    command: 'node',
    args: ['server.js'],
    ...overrides,
  };
}

type ConfigStoreChangeListener = (servers: Map<string, MCPServerConfig>) => void;

function makeConfigStore(
  initial: Map<string, MCPServerConfig> = new Map(),
): IConnectorConfigStore & { _fire: (servers: Map<string, MCPServerConfig>) => void } {
  const _listeners: ConfigStoreChangeListener[] = [];

  const store: IConnectorConfigStore & { _fire: (servers: Map<string, MCPServerConfig>) => void } =
    {
      onDidChangeServers: vi.fn().mockImplementation((listener: ConfigStoreChangeListener) => {
        _listeners.push(listener);
        return { dispose: vi.fn() };
      }),
      getServers: vi.fn().mockReturnValue(initial),
      getServer: vi.fn().mockImplementation((name: string) => initial.get(name)),
      addServer: vi.fn().mockResolvedValue(undefined),
      updateServer: vi.fn().mockResolvedValue(undefined),
      removeServer: vi.fn().mockResolvedValue(undefined),
      getFilePath: vi.fn().mockReturnValue('/fake/path/servers.json'),
      dispose: vi.fn(),
      _fire: (servers: Map<string, MCPServerConfig>) => {
        _listeners.forEach(l => l(servers));
      },
    };

  return store;
}

// --- Tests ---

describe('MCPClientManagerImpl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastMockInstance = null;
    mockInstances.length = 0;
    (MCPConnection as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_name: string, config: MCPServerConfig) => {
        const inst = createMockConnection(config);
        lastMockInstance = inst;
        mockInstances.push(inst);
        return inst;
      },
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // --- connectServer ---

  describe('connectServer()', () => {
    it('creates a connection and calls connect()', async () => {
      const config = makeConfig();
      const store = makeConfigStore();
      const manager = new MCPClientManagerImpl(store);

      await manager.connectServer('my-server', config);

      expect(MCPConnection).toHaveBeenCalledWith('my-server', config);
      expect(lastMockInstance!.connect).toHaveBeenCalledTimes(1);

      manager.dispose();
    });

    it('replaces existing connection when called again for the same name', async () => {
      const config = makeConfig();
      const store = makeConfigStore();
      const manager = new MCPClientManagerImpl(store);

      await manager.connectServer('my-server', config);
      const first = lastMockInstance!;

      await manager.connectServer('my-server', config);

      expect(first.dispose).toHaveBeenCalled();
      expect(MCPConnection).toHaveBeenCalledTimes(2);

      manager.dispose();
    });

    it('does not throw when connection fails (error is swallowed)', async () => {
      const config = makeConfig();
      const store = makeConfigStore();
      (MCPConnection as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
        (_name: string, cfg: MCPServerConfig) => {
          const inst = createMockConnection(cfg, () => Promise.reject(new Error('refused')));
          lastMockInstance = inst;
          mockInstances.push(inst);
          return inst;
        },
      );
      const manager = new MCPClientManagerImpl(store);

      await expect(manager.connectServer('my-server', config)).resolves.not.toThrow();

      manager.dispose();
    });

    it('forwards onDidChangeStatus events from the connection', async () => {
      const config = makeConfig();
      const store = makeConfigStore();
      const manager = new MCPClientManagerImpl(store);
      const events: Array<{ serverName: string; status: MCPServerStatus }> = [];

      manager.onDidChangeStatus(e => events.push(e));
      await manager.connectServer('my-server', config);
      lastMockInstance!._fireStatus('connected');

      expect(events).toContainEqual({ serverName: 'my-server', status: 'connected' });

      manager.dispose();
    });

    it('forwards onDidChangeTools events from the connection', async () => {
      const config = makeConfig();
      const store = makeConfigStore();
      const manager = new MCPClientManagerImpl(store);
      const events: Array<{ serverName: string; tools: ToolInfo[] }> = [];
      const tools: ToolInfo[] = [{ name: 'my-tool', description: 'desc', enabled: true }];

      manager.onDidChangeTools(e => events.push(e));
      await manager.connectServer('my-server', config);
      lastMockInstance!._fireTools(tools);

      expect(events).toContainEqual({ serverName: 'my-server', tools });

      manager.dispose();
    });
  });

  // --- disconnectServer ---

  describe('disconnectServer()', () => {
    it('calls disconnect() and dispose() on the connection', async () => {
      const config = makeConfig();
      const store = makeConfigStore();
      const manager = new MCPClientManagerImpl(store);

      await manager.connectServer('my-server', config);
      const conn = lastMockInstance!;
      await manager.disconnectServer('my-server');

      expect(conn.disconnect).toHaveBeenCalledTimes(1);
      expect(conn.dispose).toHaveBeenCalledTimes(1);

      manager.dispose();
    });

    it('fires onDidChangeStatus with disconnected after disconnecting', async () => {
      const config = makeConfig();
      const store = makeConfigStore();
      const manager = new MCPClientManagerImpl(store);
      const events: Array<{ serverName: string; status: MCPServerStatus }> = [];

      manager.onDidChangeStatus(e => events.push(e));
      await manager.connectServer('my-server', config);
      await manager.disconnectServer('my-server');

      expect(events).toContainEqual({ serverName: 'my-server', status: 'disconnected' });

      manager.dispose();
    });

    it('is a no-op for an unknown server name', async () => {
      const store = makeConfigStore();
      const manager = new MCPClientManagerImpl(store);

      await expect(manager.disconnectServer('unknown')).resolves.not.toThrow();

      manager.dispose();
    });

    it('removes the connection so getTools returns [] afterwards', async () => {
      const config = makeConfig();
      const store = makeConfigStore();
      const manager = new MCPClientManagerImpl(store);

      await manager.connectServer('my-server', config);
      await manager.disconnectServer('my-server');

      const tools = await manager.getTools('my-server');
      expect(tools).toEqual([]);

      manager.dispose();
    });
  });

  // --- reconcile ---

  describe('reconcile()', () => {
    it('connects new servers not currently tracked', async () => {
      const store = makeConfigStore();
      const manager = new MCPClientManagerImpl(store);
      const config = makeConfig();

      await manager.reconcile(new Map([['new-server', config]]));

      expect(MCPConnection).toHaveBeenCalledWith('new-server', config);
      expect(lastMockInstance!.connect).toHaveBeenCalledTimes(1);

      manager.dispose();
    });

    it('disconnects servers no longer in the map', async () => {
      const config = makeConfig();
      const store = makeConfigStore();
      const manager = new MCPClientManagerImpl(store);

      await manager.connectServer('old-server', config);
      const conn = lastMockInstance!;

      await manager.reconcile(new Map());

      expect(conn.disconnect).toHaveBeenCalled();

      manager.dispose();
    });

    it('leaves unchanged servers connected', async () => {
      const config = makeConfig();
      const store = makeConfigStore();
      const manager = new MCPClientManagerImpl(store);

      await manager.connectServer('stable-server', config);
      const conn = lastMockInstance!;
      const callsBefore = (MCPConnection as unknown as ReturnType<typeof vi.fn>).mock.calls.length;

      await manager.reconcile(new Map([['stable-server', config]]));

      // No new connection should have been created
      expect((MCPConnection as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
        callsBefore,
      );
      expect(conn.dispose).not.toHaveBeenCalled();

      manager.dispose();
    });

    it('reconnects a server when its config changes', async () => {
      const config = makeConfig({ command: 'node' });
      const store = makeConfigStore();
      const manager = new MCPClientManagerImpl(store);

      await manager.connectServer('my-server', config);
      const first = lastMockInstance!;

      const updatedConfig = makeConfig({ command: 'python' });
      await manager.reconcile(new Map([['my-server', updatedConfig]]));

      expect(first.dispose).toHaveBeenCalled();
      expect(MCPConnection).toHaveBeenCalledTimes(2);
      expect(MCPConnection).toHaveBeenLastCalledWith('my-server', updatedConfig);

      manager.dispose();
    });

    it('is triggered automatically when config store fires onDidChangeServers', async () => {
      const store = makeConfigStore();
      const manager = new MCPClientManagerImpl(store);
      const config = makeConfig();

      store._fire(new Map([['auto-server', config]]));
      // Give the async reconcile a tick to run
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(MCPConnection).toHaveBeenCalledWith('auto-server', config);

      manager.dispose();
    });
  });

  // --- getTools ---

  describe('getTools()', () => {
    it('returns tools from active connection', async () => {
      const config = makeConfig();
      const store = makeConfigStore();
      const manager = new MCPClientManagerImpl(store);
      const tools: ToolInfo[] = [{ name: 'read-file', description: 'Read', enabled: true }];

      await manager.connectServer('my-server', config);
      lastMockInstance!.listTools.mockReturnValue(tools);

      const result = await manager.getTools('my-server');
      expect(result).toEqual(tools);

      manager.dispose();
    });

    it('returns empty array for unknown server name', async () => {
      const store = makeConfigStore();
      const manager = new MCPClientManagerImpl(store);

      const result = await manager.getTools('unknown');
      expect(result).toEqual([]);

      manager.dispose();
    });
  });

  // --- getAllTools ---

  describe('getAllTools()', () => {
    it('returns a map of all connections tools', async () => {
      const store = makeConfigStore();
      const manager = new MCPClientManagerImpl(store);
      const tools1: ToolInfo[] = [{ name: 'tool-a', description: 'A', enabled: true }];
      const tools2: ToolInfo[] = [{ name: 'tool-b', description: 'B', enabled: true }];

      await manager.connectServer('server-1', makeConfig());
      mockInstances[0].listTools.mockReturnValue(tools1);
      await manager.connectServer('server-2', makeConfig());
      mockInstances[1].listTools.mockReturnValue(tools2);

      const result = await manager.getAllTools();

      expect(result.get('server-1')).toEqual(tools1);
      expect(result.get('server-2')).toEqual(tools2);

      manager.dispose();
    });

    it('returns empty map when no connections are active', async () => {
      const store = makeConfigStore();
      const manager = new MCPClientManagerImpl(store);

      const result = await manager.getAllTools();
      expect(result.size).toBe(0);

      manager.dispose();
    });
  });

  // --- getServerStatus ---

  describe('getServerStatus()', () => {
    it('returns status from active connection', async () => {
      const config = makeConfig();
      const store = makeConfigStore();
      const manager = new MCPClientManagerImpl(store);

      await manager.connectServer('my-server', config);
      lastMockInstance!.status = 'connected';

      const status = manager.getServerStatus('my-server');
      expect(status).toBe('connected');

      manager.dispose();
    });

    it("returns 'disconnected' for unknown server name", () => {
      const store = makeConfigStore();
      const manager = new MCPClientManagerImpl(store);

      expect(manager.getServerStatus('unknown')).toBe('disconnected');

      manager.dispose();
    });
  });

  // --- disconnectAll ---

  describe('disconnectAll()', () => {
    it('disconnects all active connections', async () => {
      const store = makeConfigStore();
      const manager = new MCPClientManagerImpl(store);

      await manager.connectServer('server-1', makeConfig());
      const conn1 = mockInstances[0];
      await manager.connectServer('server-2', makeConfig());
      const conn2 = mockInstances[1];

      await manager.disconnectAll();

      expect(conn1.disconnect).toHaveBeenCalled();
      expect(conn2.disconnect).toHaveBeenCalled();

      manager.dispose();
    });

    it('leaves no active connections after call', async () => {
      const store = makeConfigStore();
      const manager = new MCPClientManagerImpl(store);

      await manager.connectServer('server-1', makeConfig());
      await manager.connectServer('server-2', makeConfig());
      await manager.disconnectAll();

      expect(await manager.getTools('server-1')).toEqual([]);
      expect(await manager.getTools('server-2')).toEqual([]);

      manager.dispose();
    });
  });

  // --- dispose ---

  describe('dispose()', () => {
    it('disconnects all active connections on dispose', async () => {
      const store = makeConfigStore();
      const manager = new MCPClientManagerImpl(store);

      await manager.connectServer('server-1', makeConfig());
      const conn1 = mockInstances[0];
      await manager.connectServer('server-2', makeConfig());
      const conn2 = mockInstances[1];

      manager.dispose();

      // Give async disconnect a tick to run
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(conn1.disconnect).toHaveBeenCalled();
      expect(conn2.disconnect).toHaveBeenCalled();
    });
  });
});
