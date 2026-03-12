import { createServiceIdentifier } from '@gho-work/base';
import type { IDisposable, Event, ConnectorConfig } from '@gho-work/base';

export interface ToolInfo {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  enabled: boolean;
}

export interface IMCPClientManager extends IDisposable {
  connectServer(connectorId: string): Promise<void>;
  disconnectServer(connectorId: string): Promise<void>;
  disconnectAll(): Promise<void>;
  getTools(connectorId: string): Promise<ToolInfo[]>;
  getAllTools(): Promise<Map<string, ToolInfo[]>>;
  testConnection(config: ConnectorConfig): Promise<{ success: boolean; error?: string }>;
  getServerStatus(connectorId: string): ConnectorConfig['status'];

  readonly onDidChangeTools: Event<{ connectorId: string; tools: ToolInfo[] }>;
  readonly onDidChangeStatus: Event<{ connectorId: string; status: ConnectorConfig['status'] }>;
}

export const IMCPClientManager = createServiceIdentifier<IMCPClientManager>('IMCPClientManager');
