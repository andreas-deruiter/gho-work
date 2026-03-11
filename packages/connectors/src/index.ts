/**
 * Connectors package — MCP client management interfaces.
 * Minimal for the spike; full implementation will use @modelcontextprotocol/sdk.
 */
import { createServiceId } from '@gho-work/base';
import type { ConnectorConfig } from '@gho-work/base';

export interface IMCPClientManager {
  addServer(config: ConnectorConfig): Promise<void>;
  removeServer(connectorId: string): Promise<void>;
  getServers(): ConnectorConfig[];
  getServerStatus(connectorId: string): ConnectorConfig['status'];
}

export const IMCPClientManager = createServiceId<IMCPClientManager>('IMCPClientManager');

/**
 * Mock MCP client manager for the spike.
 */
export class MockMCPClientManager implements IMCPClientManager {
  private servers: Map<string, ConnectorConfig> = new Map();

  async addServer(config: ConnectorConfig): Promise<void> {
    this.servers.set(config.id, { ...config, status: 'connected' });
  }

  async removeServer(connectorId: string): Promise<void> {
    this.servers.delete(connectorId);
  }

  getServers(): ConnectorConfig[] {
    return Array.from(this.servers.values());
  }

  getServerStatus(connectorId: string): ConnectorConfig['status'] {
    return this.servers.get(connectorId)?.status ?? 'disconnected';
  }
}
