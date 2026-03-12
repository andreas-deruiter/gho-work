import { createServiceIdentifier } from '@gho-work/base';
import type { IDisposable, Event, ConnectorConfig } from '@gho-work/base';

export interface IConnectorRegistry extends IDisposable {
  addConnector(config: ConnectorConfig): Promise<void>;
  updateConnector(id: string, updates: Partial<ConnectorConfig>): Promise<void>;
  removeConnector(id: string): Promise<void>;
  getConnector(id: string): Promise<ConnectorConfig | undefined>;
  getConnectors(): Promise<ConnectorConfig[]>;
  getEnabledConnectors(): Promise<ConnectorConfig[]>;
  updateStatus(id: string, status: ConnectorConfig['status'], error?: string): Promise<void>;

  readonly onDidChangeConnectors: Event<void>;
  readonly onDidChangeStatus: Event<{ id: string; status: ConnectorConfig['status'] }>;
}

export const IConnectorRegistry = createServiceIdentifier<IConnectorRegistry>('IConnectorRegistry');
