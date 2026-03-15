import { describe, it, expect, beforeEach } from 'vitest';
import { ContextSection } from './contextSection.js';

describe('ContextSection', () => {
  let section: ContextSection;

  beforeEach(() => {
    section = new ContextSection();
    document.body.appendChild(section.getDomNode());
  });

  it('is hidden when no data is set', () => {
    expect(section.getDomNode().style.display).toBe('none');
  });

  it('shows sources when set', () => {
    section.setSources([
      { path: '/home/user/.gho/GHO.md', origin: 'user', format: 'gho' },
      { path: '/project/CLAUDE.md', origin: 'project', format: 'claude' },
    ]);

    expect(section.getDomNode().style.display).toBe('');
    const items = section.getDomNode().querySelectorAll('.info-context-source');
    expect(items.length).toBe(2);
  });

  it('shows agents when set', () => {
    section.setAgents([
      { name: 'Code Simplifier', plugin: 'code-tools' },
    ]);

    expect(section.getDomNode().style.display).toBe('');
    const items = section.getDomNode().querySelectorAll('.info-context-agent');
    expect(items.length).toBe(1);
  });

  it('hides when sources and agents are cleared', () => {
    section.setSources([{ path: '/test', origin: 'user', format: 'gho' }]);
    expect(section.getDomNode().style.display).toBe('');

    section.setSources([]);
    section.setAgents([]);
    expect(section.getDomNode().style.display).toBe('none');
  });

  it('renders origin badge on source items', () => {
    section.setSources([
      { path: '/home/user/.gho/GHO.md', origin: 'user', format: 'gho' },
    ]);

    const badge = section.getDomNode().querySelector('.info-context-badge--user');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe('user');
  });

  it('renders plugin badge on agent items', () => {
    section.setAgents([
      { name: 'Test Agent', plugin: 'my-plugin' },
    ]);

    const badge = section.getDomNode().querySelector('.info-context-badge--plugin');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe('my-plugin');
  });
});
