import { describe, it, expect } from 'vitest';
import { IPC_CHANNELS, SendMessageRequestSchema, AgentEventSchema } from '../common/ipc.js';

describe('IPC Channel Schemas', () => {
  it('should validate SendMessageRequest', () => {
    const valid = { conversationId: 'conv-1', content: 'hello' };
    expect(SendMessageRequestSchema.parse(valid)).toEqual(valid);
  });

  it('should reject invalid SendMessageRequest', () => {
    expect(() => SendMessageRequestSchema.parse({ content: 123 })).toThrow();
  });

  it('should validate AgentEvent text_delta', () => {
    const event = { type: 'text_delta', content: 'hello' };
    expect(AgentEventSchema.parse(event)).toEqual(event);
  });

  it('should validate AgentEvent tool_call_start', () => {
    const event = {
      type: 'tool_call_start',
      toolCall: {
        id: 'tc-1',
        messageId: 'msg-1',
        toolName: 'read_file',
        serverName: 'builtin',
        arguments: { path: '/tmp/test' },
        permission: 'pending',
        status: 'pending',
        timestamp: Date.now(),
      },
    };
    expect(AgentEventSchema.parse(event)).toBeTruthy();
  });

  it('should export all channel name constants', () => {
    expect(IPC_CHANNELS.AGENT_SEND_MESSAGE).toBe('agent:send-message');
    expect(IPC_CHANNELS.AGENT_EVENT).toBe('agent:event');
    expect(IPC_CHANNELS.AUTH_LOGIN).toBe('auth:login');
    expect(IPC_CHANNELS.STORAGE_GET).toBe('storage:get');
  });
});
