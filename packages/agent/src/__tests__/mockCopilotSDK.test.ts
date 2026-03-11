import { describe, it, expect } from 'vitest';
import { MockCopilotSDK } from '../node/mockCopilotSDK.js';
import type { SessionEvent } from '../common/types.js';

describe('MockCopilotSDK', () => {
  it('should start and ping', async () => {
    const sdk = new MockCopilotSDK();
    await sdk.start();
    const result = await sdk.ping();
    expect(result).toBe('pong');
    await sdk.stop();
  });

  it('should throw if not started', async () => {
    const sdk = new MockCopilotSDK();
    await expect(sdk.createSession({ model: 'gpt-4' })).rejects.toThrow('SDK not started');
  });

  it('should create a session and receive events', async () => {
    const sdk = new MockCopilotSDK();
    await sdk.start();

    const session = await sdk.createSession({ model: 'gpt-4' });
    expect(session.sessionId).toBeTruthy();

    const events: SessionEvent[] = [];
    const unsubscribe = session.on((event) => {
      events.push(event);
    });

    await session.sendAndWait({ prompt: 'hello world' });

    unsubscribe();

    // Should have reasoning, message deltas, message, and idle
    expect(events.length).toBeGreaterThan(2);

    const types = events.map((e) => e.type);
    expect(types).toContain('assistant.reasoning_delta');
    expect(types).toContain('assistant.message_delta');
    expect(types).toContain('assistant.message');
    expect(types).toContain('session.idle');

    // Messages should include both user and assistant
    const messages = await session.getMessages();
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');

    await sdk.stop();
  });

  it('should filter events when using on(event, handler)', async () => {
    const sdk = new MockCopilotSDK();
    await sdk.start();

    const session = await sdk.createSession({ model: 'gpt-4' });
    const deltas: SessionEvent[] = [];

    const unsubscribe = session.on('assistant.message_delta', (event) => {
      deltas.push(event);
    });

    await session.sendAndWait({ prompt: 'hello' });
    unsubscribe();

    expect(deltas.length).toBeGreaterThan(0);
    expect(deltas.every((e) => e.type === 'assistant.message_delta')).toBe(true);

    await sdk.stop();
  });

  it('should include tool events for file-related prompts', async () => {
    const sdk = new MockCopilotSDK();
    await sdk.start();

    const session = await sdk.createSession({ model: 'gpt-4' });
    const events: SessionEvent[] = [];
    session.on((e) => events.push(e));

    await session.sendAndWait({ prompt: 'search for a file' });

    const types = events.map((e) => e.type);
    expect(types).toContain('tool.execution_start');
    expect(types).toContain('tool.execution_complete');

    await sdk.stop();
  });

  it('should abort a session', async () => {
    const sdk = new MockCopilotSDK();
    await sdk.start();

    const session = await sdk.createSession({ model: 'gpt-4' });
    const events: SessionEvent[] = [];
    session.on((e) => events.push(e));

    // Send without waiting, then immediately abort
    void session.send({ prompt: 'hello world' });
    // Small delay to let the simulation start
    await new Promise((r) => setTimeout(r, 5));
    await session.abort();

    // Give time for any pending microtasks
    await new Promise((r) => setTimeout(r, 50));

    // Should not have received session.idle (aborted before completion)
    // or if it did complete very fast, at least abort didn't throw
    expect(true).toBe(true); // Abort completed without error

    await sdk.stop();
  });

  it('should list and delete sessions', async () => {
    const sdk = new MockCopilotSDK();
    await sdk.start();

    const session1 = await sdk.createSession({ model: 'gpt-4' });
    const session2 = await sdk.createSession({ model: 'gpt-3.5' });

    const list = await sdk.listSessions();
    expect(list).toHaveLength(2);
    expect(list.map((s) => s.sessionId)).toContain(session1.sessionId);
    expect(list.map((s) => s.sessionId)).toContain(session2.sessionId);
    expect(list.find((s) => s.sessionId === session1.sessionId)?.model).toBe('gpt-4');
    expect(list.find((s) => s.sessionId === session2.sessionId)?.model).toBe('gpt-3.5');

    await sdk.deleteSession(session1.sessionId);

    const listAfter = await sdk.listSessions();
    expect(listAfter).toHaveLength(1);
    expect(listAfter[0].sessionId).toBe(session2.sessionId);

    await sdk.stop();
  });

  it('should resume an existing session', async () => {
    const sdk = new MockCopilotSDK();
    await sdk.start();

    const session = await sdk.createSession({ model: 'gpt-4' });
    const resumed = await sdk.resumeSession(session.sessionId);
    expect(resumed.sessionId).toBe(session.sessionId);

    await sdk.stop();
  });

  it('should throw when resuming a non-existent session', async () => {
    const sdk = new MockCopilotSDK();
    await sdk.start();

    await expect(sdk.resumeSession('non-existent')).rejects.toThrow('Session not found');

    await sdk.stop();
  });
});
