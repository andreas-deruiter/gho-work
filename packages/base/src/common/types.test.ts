import { describe, it, expect } from 'vitest';
import type { AgentEvent, FileMeta } from './types.js';

describe('AgentEvent new types', () => {
  it('todo_list_updated event has correct shape', () => {
    const event: AgentEvent = {
      type: 'todo_list_updated',
      todos: [
        { id: 1, title: 'Research files', status: 'completed' },
        { id: 2, title: 'Implement changes', status: 'in-progress' },
        { id: 3, title: 'Write tests', status: 'not-started' },
      ],
    };
    expect(event.type).toBe('todo_list_updated');
    if (event.type === 'todo_list_updated') {
      expect(event.todos).toHaveLength(3);
      expect(event.todos[0].status).toBe('completed');
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
