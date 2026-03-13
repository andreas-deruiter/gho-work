import { describe, it, expect } from 'vitest';
import type { MCPServerConfig, MCPServerState, MCPServerStatus } from '../common/types.js';

describe('MCPServerConfig type', () => {
  it('accepts stdio config fields', () => {
    const config: MCPServerConfig = {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem'],
      env: { PATH: '/usr/bin' },
      cwd: '/home/user',
    };
    expect(config.command).toBe('npx');
    expect(config.cwd).toBe('/home/user');
  });

  it('accepts http config fields', () => {
    const config: MCPServerConfig = {
      type: 'http',
      url: 'https://example.com/mcp',
      headers: { Authorization: 'Bearer token' },
    };
    expect(config.url).toBe('https://example.com/mcp');
  });
});

describe('MCPServerState type', () => {
  it('accepts error and status fields', () => {
    const state: MCPServerState = {
      name: 'filesystem',
      config: { type: 'stdio', command: 'npx' },
      status: 'error',
      error: 'Connection refused',
    };
    expect(state.error).toBe('Connection refused');
    const status: MCPServerStatus = state.status;
    expect(status).toBe('error');
  });
});
