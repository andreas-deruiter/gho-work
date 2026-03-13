import { createServiceIdentifier } from '@gho-work/base';
import type { IDisposable, Event, MCPServerConfig } from '@gho-work/base';

export interface IConnectorConfigStore extends IDisposable {
	readonly onDidChangeServers: Event<Map<string, MCPServerConfig>>;
	getServers(): Map<string, MCPServerConfig>;
	getServer(name: string): MCPServerConfig | undefined;
	addServer(name: string, config: MCPServerConfig): Promise<void>;
	updateServer(name: string, config: MCPServerConfig): Promise<void>;
	removeServer(name: string): Promise<void>;
	getFilePath(): string;
}

export const IConnectorConfigStore =
	createServiceIdentifier<IConnectorConfigStore>('IConnectorConfigStore');
