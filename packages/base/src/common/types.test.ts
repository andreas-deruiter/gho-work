import { describe, it, expect } from 'vitest';
import type { AgentEvent, FileMeta } from './types.js';

describe('AgentEvent new types', () => {
  it('plan_created event has correct shape', () => {
    const event: AgentEvent = {
      type: 'plan_created',
      plan: {
        id: 'plan-1',
        steps: [
          { id: 'step-1', label: 'First step' },
          { id: 'step-2', label: 'Second step' },
        ],
      },
    };
    expect(event.type).toBe('plan_created');
    if (event.type === 'plan_created') {
      expect(event.plan.id).toBe('plan-1');
      expect(event.plan.steps).toHaveLength(2);
      expect(event.plan.steps[0].label).toBe('First step');
    }
  });

  it('plan_step_updated event has correct shape', () => {
    const event: AgentEvent = {
      type: 'plan_step_updated',
      planId: 'plan-1',
      stepId: 'step-1',
      state: 'completed',
      startedAt: 1000,
      completedAt: 2000,
    };
    expect(event.type).toBe('plan_step_updated');
    if (event.type === 'plan_step_updated') {
      expect(event.planId).toBe('plan-1');
      expect(event.stepId).toBe('step-1');
      expect(event.state).toBe('completed');
      expect(event.startedAt).toBe(1000);
      expect(event.completedAt).toBe(2000);
    }
  });

  it('plan_step_updated supports optional fields', () => {
    const event: AgentEvent = {
      type: 'plan_step_updated',
      planId: 'plan-1',
      stepId: 'step-2',
      state: 'failed',
      error: 'Something went wrong',
      messageId: 'msg-1',
    };
    expect(event.type).toBe('plan_step_updated');
    if (event.type === 'plan_step_updated') {
      expect(event.error).toBe('Something went wrong');
      expect(event.messageId).toBe('msg-1');
    }
  });

  it('attachment_added event has correct shape', () => {
    const event: AgentEvent = {
      type: 'attachment_added',
      messageId: 'msg-1',
      attachment: {
        name: 'file.txt',
        path: '/path/to/file.txt',
        source: 'user',
      },
    };
    expect(event.type).toBe('attachment_added');
    if (event.type === 'attachment_added') {
      expect(event.messageId).toBe('msg-1');
      expect(event.attachment.name).toBe('file.txt');
      expect(event.attachment.path).toBe('/path/to/file.txt');
      expect(event.attachment.source).toBe('user');
    }
  });

  it('tool_call_result event supports fileMeta', () => {
    const fileMeta: FileMeta = {
      path: '/output/result.txt',
      size: 1024,
      action: 'created',
    };
    const event: AgentEvent = {
      type: 'tool_call_result',
      toolCallId: 'tc-1',
      result: { success: true, content: 'done' },
      fileMeta,
    };
    expect(event.type).toBe('tool_call_result');
    if (event.type === 'tool_call_result') {
      expect(event.fileMeta).toBeDefined();
      expect(event.fileMeta?.path).toBe('/output/result.txt');
      expect(event.fileMeta?.size).toBe(1024);
      expect(event.fileMeta?.action).toBe('created');
    }
  });

  it('tool_call_result event works without fileMeta', () => {
    const event: AgentEvent = {
      type: 'tool_call_result',
      toolCallId: 'tc-2',
      result: { success: false, content: null, error: 'oops' },
    };
    expect(event.type).toBe('tool_call_result');
    if (event.type === 'tool_call_result') {
      expect(event.fileMeta).toBeUndefined();
    }
  });

  it('FileMeta action can be modified', () => {
    const modified: FileMeta = {
      path: '/some/file.ts',
      size: 512,
      action: 'modified',
    };
    expect(modified.action).toBe('modified');
  });
});
