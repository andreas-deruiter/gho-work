import { describe, it, expect } from 'vitest';
import { AgentsSection } from './agentsSection.js';

describe('AgentsSection', () => {
  it('starts hidden with no agents', () => {
    const section = new AgentsSection();
    expect(section.getDomNode().style.display).toBe('none');
  });

  it('shows when agent starts', () => {
    const section = new AgentsSection();
    section.addAgent('tc-1', 'code-reviewer', 'Code Reviewer');
    expect(section.getDomNode().style.display).not.toBe('none');
  });

  it('shows running badge', () => {
    const section = new AgentsSection();
    section.addAgent('tc-1', 'reviewer', 'Code Reviewer');
    const badge = section.getDomNode().querySelector('.info-section-badge');
    expect(badge?.textContent).toBe('1 running');
  });

  it('updates agent to completed', () => {
    const section = new AgentsSection();
    section.addAgent('tc-1', 'reviewer', 'Code Reviewer');
    section.updateAgent('tc-1', 'completed');
    const statusBadge = section.getDomNode().querySelector('[data-agent-id="tc-1"] .info-agent-status');
    expect(statusBadge?.textContent).toBe('DONE');
  });

  it('updates agent to failed', () => {
    const section = new AgentsSection();
    section.addAgent('tc-1', 'reviewer', 'Code Reviewer');
    section.updateAgent('tc-1', 'failed', 'timeout');
    const statusBadge = section.getDomNode().querySelector('[data-agent-id="tc-1"] .info-agent-status');
    expect(statusBadge?.textContent).toBe('FAILED');
  });

  it('updates header badge count', () => {
    const section = new AgentsSection();
    section.addAgent('tc-1', 'reviewer', 'Code Reviewer');
    section.addAgent('tc-2', 'tester', 'Test Runner');
    expect(section.getDomNode().querySelector('.info-section-badge')?.textContent).toBe('2 running');
    section.updateAgent('tc-1', 'completed');
    expect(section.getDomNode().querySelector('.info-section-badge')?.textContent).toBe('1 running');
    section.updateAgent('tc-2', 'completed');
    expect(section.getDomNode().querySelector('.info-section-badge')?.textContent).toBe('all done');
  });
});
