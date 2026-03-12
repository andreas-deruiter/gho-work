import { describe, it, expect } from 'vitest';
import type { ConnectorConfig } from '../common/types.js';

describe('ConnectorConfig type', () => {
  it('accepts error and toolsConfig fields', () => {
    const config: ConnectorConfig = {
      id: 'test',
      type: 'local_mcp',
      name: 'Test',
      transport: 'stdio',
      command: 'echo',
      enabled: true,
      status: 'disconnected',
      error: 'Connection refused',
      toolsConfig: { 'read-file': true, 'write-file': false },
    };
    expect(config.error).toBe('Connection refused');
    expect(config.toolsConfig?.['write-file']).toBe(false);
  });
});
