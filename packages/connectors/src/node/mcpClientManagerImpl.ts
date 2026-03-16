import { Disposable, Emitter } from '@gho-work/base';
import type { MCPServerConfig, MCPServerStatus, Event } from '@gho-work/base';
import type { IMCPClientManager, ToolInfo } from '../common/mcpClientManager.js';
import type { IConnectorConfigStore } from '../common/connectorConfigStore.js';
import { MCPConnection } from './mcpConnection.js';

export class MCPClientManagerImpl extends Disposable implements IMCPClientManager {
  private readonly _connections = new Map<string, MCPConnection>();

  private readonly _onDidChangeTools = this._register(
    new Emitter<{ serverName: string; tools: ToolInfo[] }>(),
  );
  readonly onDidChangeTools: Event<{ serverName: string; tools: ToolInfo[] }> =
    this._onDidChangeTools.event;

  private readonly _onDidChangeStatus = this._register(
    new Emitter<{ serverName: string; status: MCPServerStatus }>(),
  );
  readonly onDidChangeStatus: Event<{ serverName: string; status: MCPServerStatus }> =
    this._onDidChangeStatus.event;

  constructor(private readonly _configStore: IConnectorConfigStore) {
    super();
    this._register(
      this._configStore.onDidChangeServers((servers) => {
        void this.reconcile(servers);
      }),
    );
  }

  async connectServer(name: string, config: MCPServerConfig): Promise<void> {
    const existing = this._connections.get(name);
    if (existing) {
      existing.dispose();
      this._connections.delete(name);
    }

    const conn = new MCPConnection(name, config);
    this._connections.set(name, conn);

    conn.onDidChangeStatus(status => {
      this._onDidChangeStatus.fire({ serverName: name, status });
    });
    conn.onDidChangeTools(tools => {
      this._onDidChangeTools.fire({ serverName: name, tools });
    });

    try {
      await conn.connect();
    } catch (err) {
      console.warn(`[MCPClientManager] Failed to connect "${name}":`, err instanceof Error ? err.message : String(err));
    }
  }

  async disconnectServer(name: string): Promise<void> {
    const conn = this._connections.get(name);
    if (!conn) {
      return;
    }
    await conn.disconnect();
    conn.dispose();
    this._connections.delete(name);
    this._onDidChangeStatus.fire({ serverName: name, status: 'disconnected' });
  }

  async disconnectAll(): Promise<void> {
    const names = Array.from(this._connections.keys());
    await Promise.all(names.map(name => this.disconnectServer(name)));
  }

  async reconcile(servers: Map<string, MCPServerConfig>): Promise<void> {
    const currentNames = new Set(this._connections.keys());
    const newNames = new Set(servers.keys());

    for (const name of currentNames) {
      if (!newNames.has(name)) {
        await this.disconnectServer(name);
      }
    }

    for (const [name, config] of servers) {
      if (!currentNames.has(name)) {
        await this.connectServer(name, config);
      } else {
        const conn = this._connections.get(name)!;
        if (JSON.stringify(conn.config) !== JSON.stringify(config)) {
          await this.connectServer(name, config);
        }
      }
    }
  }

  async getTools(name: string): Promise<ToolInfo[]> {
    const conn = this._connections.get(name);
    return conn ? conn.listTools() : [];
  }

  async getAllTools(): Promise<Map<string, ToolInfo[]>> {
    const result = new Map<string, ToolInfo[]>();
    for (const [name, conn] of this._connections) {
      result.set(name, conn.listTools());
    }
    return result;
  }

  getServerStatus(name: string): MCPServerStatus {
    const conn = this._connections.get(name);
    return conn?.status ?? 'disconnected';
  }

  override dispose(): void {
    this.disconnectAll().catch((err) => {
      console.warn('[MCPClientManager] Cleanup error:', err instanceof Error ? err.message : String(err));
    });
    super.dispose();
  }
}
