import { describe, it, expect } from 'vitest';
import { IPC_CHANNELS } from '../ipc/common/ipc.js';
import { IIPCRenderer, IIPCMain } from '../ipc/common/ipcService.js';

describe('IPC channel definitions', () => {
  it('IPC_CHANNELS contains expected keys', () => {
    expect(IPC_CHANNELS.AGENT_SEND_MESSAGE).toBe('agent:send-message');
    expect(IPC_CHANNELS.AGENT_CANCEL).toBe('agent:cancel');
    expect(IPC_CHANNELS.CONVERSATION_LIST).toBe('conversation:list');
    expect(IPC_CHANNELS.CONVERSATION_CREATE).toBe('conversation:create');
    expect(IPC_CHANNELS.AGENT_EVENT).toBe('agent:event');
  });

  it('IIPCRenderer service id is defined', () => {
    expect(IIPCRenderer).toBeDefined();
  });

  it('IIPCMain service id is defined', () => {
    expect(IIPCMain).toBeDefined();
  });
});
