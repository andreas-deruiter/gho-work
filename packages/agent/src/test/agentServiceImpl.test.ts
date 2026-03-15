import { describe, it, expect, vi } from 'vitest';
import { AgentServiceImpl } from '../node/agentServiceImpl.js';

const noopInstructionResolver = { resolve: async () => ({ content: '', sources: [] }) };
const noopPluginAgentLoader = { loadAll: async () => [] };

describe('AgentServiceImpl.onDidChangeAgentState', () => {
  it('should fire working when task starts and idle when done', async () => {
    const mockSDK = {
      createSession: vi.fn().mockResolvedValue({
        on: vi.fn((cb) => {
          setTimeout(() => cb({ type: 'session.idle', data: {} }), 10);
          return () => {};
        }),
        send: vi.fn().mockResolvedValue(undefined),
        abort: vi.fn(),
      }),
    };
    const mockSkillRegistry = { getSkill: vi.fn() };

    const service = new AgentServiceImpl(
      mockSDK as any,
      null,
      mockSkillRegistry as any,
      noopInstructionResolver,
      noopPluginAgentLoader,
    );

    const states: string[] = [];
    service.onDidChangeAgentState(e => states.push(e.state));

    for await (const _e of service.executeTask('test', { conversationId: 'c1', workspaceId: 'w1', model: 'gpt-4o' })) {
      // consume events
    }

    expect(states).toContain('working');
    expect(states[states.length - 1]).toBe('idle');
  });

  it('should fire error when task throws', async () => {
    const mockSDK = {
      createSession: vi.fn().mockRejectedValue(new Error('Agent host disconnected')),
    };
    const mockSkillRegistry = { getSkill: vi.fn() };

    const service = new AgentServiceImpl(
      mockSDK as any,
      null,
      mockSkillRegistry as any,
      noopInstructionResolver,
      noopPluginAgentLoader,
    );

    const states: string[] = [];
    service.onDidChangeAgentState(e => states.push(e.state));

    const events: any[] = [];
    for await (const e of service.executeTask('test', { conversationId: 'c2', workspaceId: 'w1', model: 'gpt-4o' })) {
      events.push(e);
    }

    expect(states).toContain('working');
    expect(states[states.length - 1]).toBe('idle');
    expect(events.some(e => e.type === 'error')).toBe(true);
  });
});
