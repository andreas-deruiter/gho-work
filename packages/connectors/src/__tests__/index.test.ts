import { describe, it, expect } from 'vitest';
import { IMCPClientManager, MockMCPClientManager } from '../index.js';

describe('connectors package', () => {
  it('IMCPClientManager service id is defined', () => {
    expect(IMCPClientManager).toBeDefined();
  });

  it('MockMCPClientManager can be instantiated', () => {
    const manager = new MockMCPClientManager();
    expect(manager).toBeDefined();
  });

  it('MockMCPClientManager.getServers returns empty array initially', () => {
    const manager = new MockMCPClientManager();
    expect(manager.getServers()).toEqual([]);
  });

  it('MockMCPClientManager.addServer stores a server', async () => {
    const manager = new MockMCPClientManager();
    await manager.addServer({
      id: 'test',
      name: 'Test Server',
      type: 'local_mcp',
      transport: 'stdio',
      enabled: true,
      status: 'disconnected',
    });
    expect(manager.getServers()).toHaveLength(1);
    expect(manager.getServerStatus('test')).toBe('connected');
  });
});
