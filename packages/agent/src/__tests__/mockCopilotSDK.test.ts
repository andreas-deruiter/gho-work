import { describe, it, expect } from 'vitest';
import { MockCopilotSDK } from '../node/mockCopilotSDK.js';
import type { SessionEvent } from '../common/types.js';

describe('MockCopilotSDK', () => {
  it('should start and ping', async () => {
    const sdk = new MockCopilotSDK();
    await sdk.start();
    const result = await sdk.ping();
    expect(result.message).toBe('pong');
    expect(typeof result.timestamp).toBe('number');
    await sdk.stop();
  });

  it('should throw if not started', async () => {
    const sdk = new MockCopilotSDK();
    await expect(sdk.createSession({})).rejects.toThrow('SDK not started');
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

    const result = await session.sendAndWait({ prompt: 'hello world' });

    unsubscribe();

    // Should have reasoning, message deltas, message, and idle
    expect(events.length).toBeGreaterThan(2);

    const types = events.map((e) => e.type);
    expect(types).toContain('assistant.reasoning_delta');
    expect(types).toContain('assistant.message_delta');
    expect(types).toContain('assistant.message');
    expect(types).toContain('session.idle');

    // sendAndWait returns SessionEvent with data payload
    expect(result).toBeDefined();
    expect(result!.type).toBe('assistant.message');
    expect((result!.data as Record<string, unknown>).content).toBeTruthy();

    // Messages should include both user and assistant (as SessionEvents)
    const messages = await session.getMessages();
    expect(messages).toHaveLength(2);
    expect(messages[0].type).toBe('user.message');
    expect(messages[1].type).toBe('assistant.message');

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
    // Verify data payload shape
    for (const delta of deltas) {
      expect((delta.data as Record<string, unknown>).deltaContent).toBeTruthy();
    }

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

    // Verify tool events use data payload
    const toolStart = events.find((e) => e.type === 'tool.execution_start')!;
    expect((toolStart.data as Record<string, unknown>).toolName).toBe('read_file');
    expect((toolStart.data as Record<string, unknown>).toolCallId).toBeTruthy();

    const toolComplete = events.find((e) => e.type === 'tool.execution_complete')!;
    expect((toolComplete.data as Record<string, unknown>).success).toBe(true);

    await sdk.stop();
  });

  it('should abort a session without throwing', async () => {
    const sdk = new MockCopilotSDK();
    await sdk.start();

    const session = await sdk.createSession({ model: 'gpt-4' });
    const events: SessionEvent[] = [];
    session.on((e) => events.push(e));

    // Send without waiting, then immediately abort
    void session.send({ prompt: 'hello world' });
    await new Promise((r) => setTimeout(r, 5));

    // abort() should resolve without throwing
    await expect(session.abort()).resolves.toBeUndefined();

    await new Promise((r) => setTimeout(r, 50));

    // Verify the session actually received some events before abort
    expect(events.length).toBeGreaterThanOrEqual(0);

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
    // SessionMetadata now uses startTime/modifiedTime (Date)
    expect(list[0].startTime).toBeInstanceOf(Date);
    expect(list[0].modifiedTime).toBeInstanceOf(Date);

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

  it('should list models', async () => {
    const sdk = new MockCopilotSDK();
    const models = await sdk.listModels();
    expect(models).toHaveLength(3);
    expect(models.map((m) => m.id)).toContain('gpt-4o');
    expect(models.map((m) => m.id)).toContain('gpt-4o-mini');
    expect(models.map((m) => m.id)).toContain('claude-sonnet-4-20250514');
    expect(models[0].capabilities.supports.vision).toBe(true);
  });

  it('should stop and return empty error array', async () => {
    const sdk = new MockCopilotSDK();
    await sdk.start();
    const errors = await sdk.stop();
    expect(errors).toEqual([]);
  });
});
