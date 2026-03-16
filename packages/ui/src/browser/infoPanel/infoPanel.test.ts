import { describe, it, expect } from 'vitest';
import { InfoPanel } from './infoPanel.js';

describe('InfoPanel (redesigned)', () => {
  it('creates all 7 section containers', () => {
    const panel = new InfoPanel();
    const el = panel.getDomNode();
    const sections = el.querySelectorAll('.info-section-container');
    expect(sections.length).toBe(7);
  });

  it('auto-hides when all sections empty', () => {
    const panel = new InfoPanel();
    expect(panel.getDomNode().style.display).toBe('none');
  });

  it('auto-shows when todos arrive', () => {
    const panel = new InfoPanel();
    panel.handleEvent({
      type: 'todo_list_updated',
      todos: [{ id: 1, title: 'Step 1', status: 'not-started' }],
    });
    expect(panel.getDomNode().style.display).not.toBe('none');
  });

  it('routes skill_invoked to SkillsSection', () => {
    const panel = new InfoPanel();
    panel.handleEvent({ type: 'skill_invoked', skillName: 'brainstorming', state: 'running' });
    const skillEl = panel.getDomNode().querySelector('[data-skill="brainstorming"]');
    expect(skillEl).toBeTruthy();
  });

  it('routes subagent_started to AgentsSection', () => {
    const panel = new InfoPanel();
    panel.handleEvent({
      type: 'subagent_started',
      parentToolCallId: 'tc-1',
      name: 'reviewer',
      displayName: 'Code Reviewer',
    });
    const agentEl = panel.getDomNode().querySelector('[data-agent-id="tc-1"]');
    expect(agentEl).toBeTruthy();
  });

  it('preserves state across conversation switch', () => {
    const panel = new InfoPanel();
    panel.setConversation('conv-1');
    panel.handleEvent({
      type: 'todo_list_updated',
      todos: [{ id: 1, title: 'Step 1', status: 'not-started' }],
    });
    panel.setConversation('conv-2');
    panel.setConversation('conv-1');
    const timeline = panel.getDomNode().querySelector('.info-timeline-node');
    expect(timeline).toBeTruthy();
  });

  it('has correct ARIA attributes', () => {
    const panel = new InfoPanel();
    expect(panel.getDomNode().getAttribute('role')).toBe('complementary');
    expect(panel.getDomNode().getAttribute('aria-label')).toBe('Task info');
  });

  it('fires onDidChangeVisibility when panel becomes visible', () => {
    const panel = new InfoPanel();
    const changes: boolean[] = [];
    panel.onDidChangeVisibility(v => changes.push(v));
    panel.handleEvent({
      type: 'todo_list_updated',
      todos: [{ id: 1, title: 'Step 1', status: 'not-started' }],
    });
    expect(changes).toContain(true);
  });

  it('routes subagent_completed to AgentsSection', () => {
    const panel = new InfoPanel();
    panel.handleEvent({
      type: 'subagent_started',
      parentToolCallId: 'tc-2',
      name: 'writer',
      displayName: 'Writer',
    });
    panel.handleEvent({
      type: 'subagent_completed',
      parentToolCallId: 'tc-2',
      name: 'writer',
      displayName: 'Writer',
      state: 'completed',
    });
    const agentEl = panel.getDomNode().querySelector('[data-agent-id="tc-2"]');
    expect(agentEl?.classList.contains('info-agent-card--dimmed')).toBe(true);
  });

  it('handleQuotaChanged shows usage section', () => {
    const panel = new InfoPanel();
    panel.handleQuotaChanged({ used: 50, total: 100, remainingPercentage: 50 });
    expect(panel.getDomNode().style.display).not.toBe('none');
  });

  it('handleConnectorStatus shows context section', () => {
    const panel = new InfoPanel();
    panel.handleConnectorStatus('my-server', 'connected', 'stdio');
    expect(panel.getDomNode().style.display).not.toBe('none');
  });
});
