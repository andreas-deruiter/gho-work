import { createServiceIdentifier } from '@gho-work/base';
import type { IDisposable, Event, MCPServerConfig, MCPServerStatus } from '@gho-work/base';

export interface ToolInfo {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  enabled: boolean;
}

export interface IMCPClientManager extends IDisposable {
  connectServer(name: string, config: MCPServerConfig): Promise<void>;
  disconnectServer(name: string): Promise<void>;
  disconnectAll(): Promise<void>;
  reconcile(servers: Map<string, MCPServerConfig>): Promise<void>;
  getTools(name: string): Promise<ToolInfo[]>;
  getAllTools(): Promise<Map<string, ToolInfo[]>>;
  getServerStatus(name: string): MCPServerStatus;

  readonly onDidChangeTools: Event<{ serverName: string; tools: ToolInfo[] }>;
  readonly onDidChangeStatus: Event<{ serverName: string; status: MCPServerStatus }>;
}

export const IMCPClientManager = createServiceIdentifier<IMCPClientManager>('IMCPClientManager');
