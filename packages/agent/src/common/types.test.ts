import { describe, it, expect } from 'vitest';
import type { SessionConfig } from './types.js';

describe('SessionConfig', () => {
  it('accepts a tools array with handler', () => {
    const config: SessionConfig = {
      tools: [{
        name: 'manage_todo_list',
        description: 'Track todos',
        parameters: { type: 'object', properties: {} },
        handler: async () => ({ success: true }),
      }],
    };
    expect(config.tools).toHaveLength(1);
    expect(config.tools![0].name).toBe('manage_todo_list');
  });
});
