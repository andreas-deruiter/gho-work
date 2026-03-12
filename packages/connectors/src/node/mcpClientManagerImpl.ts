import { Disposable, Emitter } from '@gho-work/base';
import type { ConnectorConfig, Event } from '@gho-work/base';
import type { IMCPClientManager, ToolInfo } from '../common/mcpClientManager.js';
import type { IConnectorRegistry } from '../common/connectorRegistry.js';
import { MCPConnection } from './mcpConnection.js';

export class MCPClientManagerImpl extends Disposable implements IMCPClientManager {
  private readonly _connections = new Map<string, MCPConnection>();

  private readonly _onDidChangeTools = this._register(
    new Emitter<{ connectorId: string; tools: ToolInfo[] }>(),
  );
  readonly onDidChangeTools: Event<{ connectorId: string; tools: ToolInfo[] }> =
    this._onDidChangeTools.event;

  private readonly _onDidChangeStatus = this._register(
    new Emitter<{ connectorId: string; status: ConnectorConfig['status'] }>(),
  );
  readonly onDidChangeStatus: Event<{ connectorId: string; status: ConnectorConfig['status'] }> =
    this._onDidChangeStatus.event;

  constructor(private readonly _registry: IConnectorRegistry) {
    super();
  }

  async connectServer(connectorId: string): Promise<void> {
    const config = await this._registry.getConnector(connectorId);
    if (!config) {
      throw new Error(`Connector not found: ${connectorId}`);
    }

    // Disconnect and dispose existing connection if present
    const existing = this._connections.get(connectorId);
    if (existing) {
      existing.dispose();
      this._connections.delete(connectorId);
    }

    const conn = new MCPConnection(config);
    this._connections.set(connectorId, conn);

    // Forward status events to registry and own emitter
    conn.onDidChangeStatus(status => {
      this._registry.updateStatus(connectorId, status).catch(() => {});
      this._onDidChangeStatus.fire({ connectorId, status });
    });

    // Forward tools events to own emitter
    conn.onDidChangeTools(tools => {
      this._onDidChangeTools.fire({ connectorId, tools });
    });

    try {
      await conn.connect();
    } catch {
      // MCPConnection already sets status to 'error' and fires the event.
      // Do not rethrow — let the status event inform callers.
    }
  }

  async disconnectServer(connectorId: string): Promise<void> {
    const conn = this._connections.get(connectorId);
    if (!conn) {
      return;
    }
    await conn.disconnect();
    conn.dispose();
    this._connections.delete(connectorId);
    await this._registry.updateStatus(connectorId, 'disconnected');
  }

  async disconnectAll(): Promise<void> {
    const ids = Array.from(this._connections.keys());
    await Promise.all(ids.map(id => this.disconnectServer(id)));
  }

  async getTools(connectorId: string): Promise<ToolInfo[]> {
    const conn = this._connections.get(connectorId);
    return conn ? conn.listTools() : [];
  }

  async getAllTools(): Promise<Map<string, ToolInfo[]>> {
    const result = new Map<string, ToolInfo[]>();
    for (const [id, conn] of this._connections) {
      result.set(id, conn.listTools());
    }
    return result;
  }

  async testConnection(
    config: ConnectorConfig,
  ): Promise<{ success: boolean; error?: string }> {
    const conn = new MCPConnection(config);
    try {
      await conn.connect();
      await conn.disconnect();
      conn.dispose();
      return { success: true };
    } catch (err: unknown) {
      conn.dispose();
      const message =
        err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error';
      return { success: false, error: message };
    }
  }

  getServerStatus(connectorId: string): ConnectorConfig['status'] {
    const conn = this._connections.get(connectorId);
    return conn?.status ?? 'disconnected';
  }

  override dispose(): void {
    this.disconnectAll().catch(() => {});
    super.dispose();
  }
}
