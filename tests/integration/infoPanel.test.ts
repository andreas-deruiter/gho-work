// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { InfoPanel } from '../../packages/ui/src/browser/infoPanel/infoPanel.js';
import type { AgentEvent } from '@gho-work/base';

/**
 * Integration test: verifies InfoPanel correctly processes a realistic
 * sequence of AgentEvents and updates its DOM state.
 */
describe('InfoPanel integration', () => {
  let panel: InfoPanel;

  beforeEach(() => {
    panel = new InfoPanel();
    panel.setConversation('conv-1');
  });

  it('processes a full agent task lifecycle', () => {
    const events: AgentEvent[] = [
      // Agent creates a todo list
      {
        type: 'todo_list_updated',
        todos: [
          { id: 1, title: 'Read input file', status: 'in-progress' },
          { id: 2, title: 'Analyze data', status: 'not-started' },
          { id: 3, title: 'Generate report', status: 'not-started' },
        ],
      },
      // Agent reads a file (input)
      {
        type: 'tool_call_start',
        toolCall: {
          id: 'tc-1', messageId: 'msg-1', toolName: 'readFile', serverName: '',
          arguments: { path: '/data/input.csv' },
          permission: 'allow_once', status: 'executing', timestamp: 1000,
        },
      },
      // User attached a file
      {
        type: 'attachment_added',
        attachment: { name: 'budget.xlsx', path: '/home/user/budget.xlsx', source: 'drag-drop' },
        messageId: 'msg-2',
      },
      // All steps completed
      {
        type: 'todo_list_updated',
        todos: [
          { id: 1, title: 'Read input file', status: 'completed' },
          { id: 2, title: 'Analyze data', status: 'completed' },
          { id: 3, title: 'Generate report', status: 'completed' },
        ],
      },
      // Agent writes a file (output)
      {
        type: 'tool_call_result',
        toolCallId: 'tc-2',
        result: { success: true, content: 'File written' },
        fileMeta: { path: '/data/report.pdf', size: 156000, action: 'created' },
      },
    ];

    for (const event of events) {
      panel.handleEvent(event);
    }

    const root = panel.getDomNode();

    // Todos: all 3 items completed
    const completedItems = root.querySelectorAll('.info-todo-item--completed');
    expect(completedItems.length).toBe(3);

    // Input: 2 entries (readFile + attachment)
    const inputEntries = root.querySelectorAll('.info-panel-input .info-entry');
    expect(inputEntries.length).toBe(2);

    // Output: 1 entry (report.pdf)
    const outputEntries = root.querySelectorAll('.info-panel-output .info-entry');
    expect(outputEntries.length).toBe(1);
    expect(outputEntries[0].querySelector('.info-entry-name')!.textContent).toBe('report.pdf');

    // Empty state hidden
    expect(root.querySelector('.info-panel-empty')!.style.display).toBe('none');
  });

  it('handles tool_call_start for MCP tools as input', () => {
    panel.handleEvent({
      type: 'tool_call_start',
      toolCall: {
        id: 'tc-mcp', messageId: 'msg-5', toolName: 'getCellRange', serverName: 'google-sheets',
        arguments: {}, permission: 'allow_once', status: 'executing', timestamp: 5000,
      },
    });

    const inputEntries = panel.getDomNode().querySelectorAll('.info-panel-input .info-entry');
    expect(inputEntries.length).toBe(1);
    expect(inputEntries[0].querySelector('.info-entry-name')!.textContent).toBe('google-sheets / getCellRange');
  });

  it('ignores tool_call_result without fileMeta for output', () => {
    panel.handleEvent({
      type: 'tool_call_result',
      toolCallId: 'tc-3',
      result: { success: true, content: 'some text response' },
    });

    const outputEntries = panel.getDomNode().querySelectorAll('.info-panel-output .info-entry');
    expect(outputEntries.length).toBe(0);
  });
});
