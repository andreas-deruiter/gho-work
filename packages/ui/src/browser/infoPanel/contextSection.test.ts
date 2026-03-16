import { describe, it, expect } from 'vitest';
import { ContextSection } from './contextSection.js';

describe('ContextSection', () => {
  it('renders instruction sources', () => {
    const section = new ContextSection();
    section.setSources([{ path: '/home/user/.gho/instructions.md', origin: 'user', format: 'md' }]);
    expect(section.getDomNode().querySelectorAll('.info-context-source').length).toBe(1);
  });

  it('renders registered agents', () => {
    const section = new ContextSection();
    section.setAgents([{ name: 'code-reviewer', plugin: 'review-tools' }]);
    expect(section.getDomNode().querySelectorAll('.info-context-agent').length).toBe(1);
  });

  it('renders available skills', () => {
    const section = new ContextSection();
    section.setSkills([{ name: 'brainstorming', source: 'superpowers' }]);
    expect(section.getDomNode().querySelectorAll('.info-context-skill').length).toBe(1);
  });

  it('renders MCP servers', () => {
    const section = new ContextSection();
    section.updateServer('sqlite', 'connected', 'stdio');
    expect(section.getDomNode().querySelectorAll('.info-context-server').length).toBe(1);
  });

  it('shows error for MCP server in error state', () => {
    const section = new ContextSection();
    section.updateServer('github-api', 'error', 'http', 'Connection refused');
    const errorEl = section.getDomNode().querySelector('.info-context-server-error');
    expect(errorEl?.textContent).toContain('Connection refused');
  });

  it('updates badge with total count', () => {
    const section = new ContextSection();
    section.setSources([{ path: '/a', origin: 'user', format: 'md' }]);
    section.setAgents([{ name: 'reviewer', plugin: 'tools' }]);
    section.updateServer('sqlite', 'connected', 'stdio');
    const badge = section.getDomNode().querySelector('.info-section-badge');
    expect(badge?.textContent).toBe('3');
  });

  it('MCP servers persist across clear calls', () => {
    const section = new ContextSection();
    section.updateServer('sqlite', 'connected', 'stdio');
    // Simulate conversation switch — setSources resets sources but servers stay
    section.setSources([]);
    section.setAgents([]);
    expect(section.getDomNode().querySelectorAll('.info-context-server').length).toBe(1);
  });
});
