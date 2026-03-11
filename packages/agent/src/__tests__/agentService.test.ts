import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { AgentContext, AgentEvent } from '@gho-work/base';
import { MockCopilotSDK } from '../node/mockCopilotSDK.js';
import { AgentServiceImpl } from '../node/agentServiceImpl.js';

describe('AgentServiceImpl', () => {
  let sdk: MockCopilotSDK;
  let service: AgentServiceImpl;

  beforeEach(async () => {
    sdk = new MockCopilotSDK();
    await sdk.start();
    service = new AgentServiceImpl(sdk);
  });

  afterEach(async () => {
    await sdk.stop();
  });

  it('streams events from executeTask', async () => {
    const context: AgentContext = {
      conversationId: 'test-conv',
      workspaceId: 'test-ws',
      model: 'gpt-4o',
    };

    const events: AgentEvent[] = [];
    for await (const event of service.executeTask('Hello', context)) {
      events.push(event);
    }

    expect(events.length).toBeGreaterThan(0);
    const types = events.map((e) => e.type);
    expect(types).toContain('text_delta');
    expect(types).toContain('done');
  });

  it('tracks active task id', async () => {
    expect(service.getActiveTaskId()).toBeNull();

    const context: AgentContext = {
      conversationId: 'test-conv',
      workspaceId: 'test-ws',
    };

    const events: AgentEvent[] = [];
    for await (const event of service.executeTask('Hello', context)) {
      events.push(event);
      if (events.length === 1) {
        expect(service.getActiveTaskId()).toBeTruthy();
      }
    }

    expect(service.getActiveTaskId()).toBeNull();
  });

  it('cancels active task', async () => {
    const context: AgentContext = {
      conversationId: 'test-conv',
      workspaceId: 'test-ws',
    };

    const iterator = service.executeTask('Tell me a very long story about files and searching', context)[Symbol.asyncIterator]();

    const first = await iterator.next();
    expect(first.done).not.toBe(true);

    const taskId = service.getActiveTaskId();
    expect(taskId).toBeTruthy();
    service.cancelTask(taskId!);

    // Should terminate without hanging
    let count = 0;
    while (count < 50) {
      const next = await iterator.next();
      if (next.done) {
        break;
      }
      count++;
    }
    expect(count).toBeLessThan(50);
  });

  it('includes tool call events for file-related prompts', async () => {
    const context: AgentContext = {
      conversationId: 'test-conv',
      workspaceId: 'test-ws',
    };

    const events: AgentEvent[] = [];
    for await (const event of service.executeTask('Read this file for me', context)) {
      events.push(event);
    }

    const types = events.map((e) => e.type);
    expect(types).toContain('tool_call_start');
    expect(types).toContain('tool_call_result');
  });

  it('includes thinking events', async () => {
    const context: AgentContext = {
      conversationId: 'test-conv',
      workspaceId: 'test-ws',
    };

    const events: AgentEvent[] = [];
    for await (const event of service.executeTask('Hello', context)) {
      events.push(event);
    }

    const types = events.map((e) => e.type);
    expect(types).toContain('thinking');
  });

  it('injects system prompt from context', async () => {
    const context: AgentContext = {
      conversationId: 'test-conv',
      workspaceId: 'test-ws',
      systemPrompt: 'You are a helpful assistant.',
    };

    const events: AgentEvent[] = [];
    for await (const event of service.executeTask('Hello', context)) {
      events.push(event);
    }

    // Should complete successfully with system prompt injected
    const types = events.map((e) => e.type);
    expect(types).toContain('done');
  });

  it('uses context file reader when provided', async () => {
    const serviceWithContext = new AgentServiceImpl(sdk, async () => 'Context from files');

    const context: AgentContext = {
      conversationId: 'test-conv',
      workspaceId: 'test-ws',
    };

    const events: AgentEvent[] = [];
    for await (const event of serviceWithContext.executeTask('Hello', context)) {
      events.push(event);
    }

    const types = events.map((e) => e.type);
    expect(types).toContain('done');
  });

  it('emits error event when SDK fails', async () => {
    const badSdk = new MockCopilotSDK();
    // Don't call start() — createSession will throw
    const badService = new AgentServiceImpl(badSdk);

    const context: AgentContext = {
      conversationId: 'test-conv',
      workspaceId: 'test-ws',
    };

    const events: AgentEvent[] = [];
    for await (const event of badService.executeTask('Hello', context)) {
      events.push(event);
    }

    expect(events.length).toBe(1);
    expect(events[0].type).toBe('error');
  });
});
