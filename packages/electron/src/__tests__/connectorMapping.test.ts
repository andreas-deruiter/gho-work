import { describe, it, expect } from 'vitest';
import type { ConnectorConfig } from '@gho-work/base';
import { mapConnectorsToSDKConfig } from '../main/connectorMapping.js';

describe('mapConnectorsToSDKConfig', () => {
  it('maps stdio connector', () => {
    const connectors: ConnectorConfig[] = [{
      id: 'c1', type: 'local_mcp', name: 'FileServer', transport: 'stdio',
      command: '/usr/bin/mcp-fs', args: ['--root', '/tmp'], env: { DEBUG: '1' },
      enabled: true, status: 'connected',
      toolsConfig: { 'read-file': true, 'write-file': true },
    }];
    const result = mapConnectorsToSDKConfig(connectors);
    expect(result['FileServer']).toEqual({
      type: 'stdio',
      command: '/usr/bin/mcp-fs',
      args: ['--root', '/tmp'],
      env: { DEBUG: '1' },
      tools: ['read-file', 'write-file'],
    });
  });

  it('maps HTTP connector', () => {
    const connectors: ConnectorConfig[] = [{
      id: 'c2', type: 'remote_mcp', name: 'RemoteServer', transport: 'streamable_http',
      url: 'https://example.com/mcp', headers: { 'Authorization': 'Bearer token' },
      enabled: true, status: 'connected',
    }];
    const result = mapConnectorsToSDKConfig(connectors);
    expect(result['RemoteServer']).toEqual({
      type: 'http',
      url: 'https://example.com/mcp',
      headers: { 'Authorization': 'Bearer token' },
      tools: [],
    });
  });

  it('filters disabled tools via toolsConfig', () => {
    const connectors: ConnectorConfig[] = [{
      id: 'c3', type: 'local_mcp', name: 'Mixed', transport: 'stdio',
      command: 'mcp', enabled: true, status: 'connected',
      toolsConfig: { 'read': true, 'write': false, 'delete': true },
    }];
    const result = mapConnectorsToSDKConfig(connectors);
    expect(result['Mixed'].tools).toEqual(['read', 'delete']);
  });

  it('handles empty list', () => {
    expect(mapConnectorsToSDKConfig([])).toEqual({});
  });

  it('deduplicates names by appending id', () => {
    const connectors: ConnectorConfig[] = [
      { id: 'c1', type: 'local_mcp', name: 'Server', transport: 'stdio', command: 'a', enabled: true, status: 'connected' },
      { id: 'c2', type: 'local_mcp', name: 'Server', transport: 'stdio', command: 'b', enabled: true, status: 'connected' },
    ];
    const result = mapConnectorsToSDKConfig(connectors);
    expect(Object.keys(result)).toHaveLength(2);
    expect(result['Server']).toBeDefined();
    expect(result['Server (c2)']).toBeDefined();
  });
});
