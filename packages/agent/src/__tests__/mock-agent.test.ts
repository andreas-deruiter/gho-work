import { describe, it, expect } from 'vitest';
import { MockCopilotSDK, MockAgentService } from '../mock-agent.js';
import type { AgentEvent, AgentContext } from '@gho-work/base';

describe('MockCopilotSDK', () => {
  it('should create a session and stream events', async () => {
    const sdk = new MockCopilotSDK();
    const context: AgentContext = {
      conversationId: 'test',
      workspaceId: 'test-ws',
    };

    const sessionId = await sdk.createSession(context);
    expect(sessionId).toBeTruthy();

    const events: AgentEvent[] = [];
    for await (const event of sdk.sendMessage(sessionId, 'hello')) {
      events.push(event);
    }

    // Should have at least thinking + text deltas + done
    expect(events.length).toBeGreaterThan(2);
    expect(events[0].type).toBe('thinking');
    expect(events[events.length - 1].type).toBe('done');

    // Should have text deltas
    const textDeltas = events.filter((e) => e.type === 'text_delta');
    expect(textDeltas.length).toBeGreaterThan(0);

    sdk.dispose();
  });

  it('should include tool calls for file-related prompts', async () => {
    const sdk = new MockCopilotSDK();
    const context: AgentContext = {
      conversationId: 'test',
      workspaceId: 'test-ws',
    };

    const sessionId = await sdk.createSession(context);
    const events: AgentEvent[] = [];
    for await (const event of sdk.sendMessage(sessionId, 'search for a file')) {
      events.push(event);
    }

    const toolStart = events.find((e) => e.type === 'tool_call_start');
    expect(toolStart).toBeTruthy();

    const toolResult = events.find((e) => e.type === 'tool_call_result');
    expect(toolResult).toBeTruthy();

    sdk.dispose();
  });
});

describe('MockAgentService', () => {
  it('should execute a task and stream events', async () => {
    const sdk = new MockCopilotSDK();
    const agent = new MockAgentService(sdk);
    const context: AgentContext = {
      conversationId: 'test',
      workspaceId: 'test-ws',
    };

    const events: AgentEvent[] = [];
    for await (const event of agent.executeTask('draft an email', context)) {
      events.push(event);
    }

    expect(events.length).toBeGreaterThan(2);
    expect(events[events.length - 1].type).toBe('done');

    // Should contain email-related content in text deltas
    const text = events
      .filter((e) => e.type === 'text_delta')
      .map((e) => (e as { type: 'text_delta'; content: string }).content)
      .join('');
    expect(text.toLowerCase()).toContain('email');

    sdk.dispose();
  });
});
