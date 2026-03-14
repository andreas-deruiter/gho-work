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
      // Agent creates a plan
      {
        type: 'plan_created',
        plan: {
          id: 'plan-1',
          steps: [
            { id: 's1', label: 'Read input file' },
            { id: 's2', label: 'Analyze data' },
            { id: 's3', label: 'Generate report' },
          ],
        },
      },
      // Step 1 starts
      { type: 'plan_step_updated', planId: 'plan-1', stepId: 's1', state: 'running', startedAt: 1000 },
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
      // Step 1 completes
      { type: 'plan_step_updated', planId: 'plan-1', stepId: 's1', state: 'completed', completedAt: 2000, messageId: 'msg-1' },
      // Step 2 active
      { type: 'plan_step_updated', planId: 'plan-1', stepId: 's2', state: 'running', startedAt: 2000 },
      // Step 2 completes
      { type: 'plan_step_updated', planId: 'plan-1', stepId: 's2', state: 'completed', completedAt: 3000, messageId: 'msg-3' },
      // Step 3 active — agent writes a file
      { type: 'plan_step_updated', planId: 'plan-1', stepId: 's3', state: 'running', startedAt: 3000 },
      {
        type: 'tool_call_result',
        toolCallId: 'tc-2',
        result: { success: true, content: 'File written' },
        fileMeta: { path: '/data/report.pdf', size: 156000, action: 'created' },
      },
      // Step 3 completes
      { type: 'plan_step_updated', planId: 'plan-1', stepId: 's3', state: 'completed', completedAt: 4000, messageId: 'msg-4' },
    ];

    for (const event of events) {
      panel.handleEvent(event);
    }

    const root = panel.getDomNode();

    // Progress: all 3 steps completed
    const completedSteps = root.querySelectorAll('.info-step--completed');
    expect(completedSteps.length).toBe(3);

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
