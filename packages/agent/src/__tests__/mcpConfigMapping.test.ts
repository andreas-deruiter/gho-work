import { describe, it, expect } from 'vitest';
import { toSdkMcpConfig } from '../common/mcpConfigMapping.js';
import type { MCPServerConfig } from '@gho-work/base';

describe('toSdkMcpConfig', () => {
  it('maps stdio config correctly', () => {
    const config: MCPServerConfig = {
      type: 'stdio',
      command: 'node',
      args: ['server.js', '--port', '3000'],
      env: { NODE_ENV: 'production' },
      cwd: '/home/user/project',
    };

    const result = toSdkMcpConfig(config);

    expect(result.command).toBe('node');
    expect(result.args).toEqual(['server.js', '--port', '3000']);
    expect(result.env).toEqual({ NODE_ENV: 'production' });
    expect(result.cwd).toBe('/home/user/project');
    expect(result.tools).toEqual([]);
  });

  it('maps http config correctly', () => {
    const config: MCPServerConfig = {
      type: 'http',
      url: 'https://example.com/mcp',
      headers: { Authorization: 'Bearer token123' },
    };

    const result = toSdkMcpConfig(config);

    expect(result.url).toBe('https://example.com/mcp');
    expect(result.headers).toEqual({ Authorization: 'Bearer token123' });
    expect(result.tools).toEqual([]);
  });

  it('strips the source field', () => {
    const config: MCPServerConfig = {
      type: 'stdio',
      command: 'my-server',
      source: 'plugin:my-plugin',
    };

    const result = toSdkMcpConfig(config);

    expect('source' in result).toBe(false);
  });

  it('always returns tools: []', () => {
    const config: MCPServerConfig = {
      type: 'stdio',
      command: 'server',
    };

    const result = toSdkMcpConfig(config);

    expect(result.tools).toEqual([]);
  });

  it('preserves type field', () => {
    const stdioConfig: MCPServerConfig = { type: 'stdio', command: 'server' };
    const httpConfig: MCPServerConfig = { type: 'http', url: 'https://example.com' };

    expect(toSdkMcpConfig(stdioConfig).type).toBe('stdio');
    expect(toSdkMcpConfig(httpConfig).type).toBe('http');
  });
});
