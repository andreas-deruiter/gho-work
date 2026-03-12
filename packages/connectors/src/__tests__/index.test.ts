import { describe, it, expect } from 'vitest';
import { IConnectorRegistry } from '../common/connectorRegistry.js';
import { IMCPClientManager } from '../common/mcpClientManager.js';
import { ICLIDetectionService } from '../common/cliDetection.js';

describe('connectors package interfaces', () => {
  it('IConnectorRegistry service id is defined', () => {
    expect(IConnectorRegistry).toBeDefined();
    expect((IConnectorRegistry as any).id).toBe('IConnectorRegistry');
  });

  it('IMCPClientManager service id is defined', () => {
    expect(IMCPClientManager).toBeDefined();
    expect((IMCPClientManager as any).id).toBe('IMCPClientManager');
  });

  it('ICLIDetectionService service id is defined', () => {
    expect(ICLIDetectionService).toBeDefined();
    expect((ICLIDetectionService as any).id).toBe('ICLIDetectionService');
  });
});
