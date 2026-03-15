import { describe, it, expect, vi } from 'vitest';
import { AgentServiceImpl } from '../node/agentServiceImpl.js';
import type { IInstructionResolverLike, IPluginAgentLoaderLike } from '../node/agentServiceImpl.js';
import { SkillRegistryImpl } from '../node/skillRegistryImpl.js';

const noopInstructionResolver: IInstructionResolverLike = { resolve: async () => ({ content: '', sources: [] }) };
const noopPluginAgentLoader: IPluginAgentLoaderLike = { loadAll: async () => [] };

describe('manage_todo_list tool registration', () => {
  it('passes tools array to createSession', async () => {
    const session = {
      sessionId: 'session-1',
      on: vi.fn((_handler: (event: any) => void) => {
        setTimeout(() => _handler({ type: 'session.idle', data: {} }), 10);
        return () => {};
      }),
      send: vi.fn(async () => ''),
      abort: vi.fn(async () => {}),
    };
    const sdk = {
      createSession: vi.fn(async () => session),
    };

    const registry = new SkillRegistryImpl([]);
    await registry.scan();

    const svc = new AgentServiceImpl(
      sdk as any, null, registry,
      noopInstructionResolver, noopPluginAgentLoader,
    );

    const events = [];
    for await (const event of svc.executeTask('hello', { conversationId: 'c1', workspaceId: 'default' })) {
      events.push(event);
    }

    expect(sdk.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.arrayContaining([
          expect.objectContaining({ name: 'manage_todo_list' }),
        ]),
      }),
    );

    registry.dispose();
  });
});
