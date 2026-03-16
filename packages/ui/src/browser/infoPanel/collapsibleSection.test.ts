import { describe, it, expect } from 'vitest';
import { CollapsibleSection } from './collapsibleSection.js';

describe('CollapsibleSection', () => {
  it('renders header with title and chevron', () => {
    const section = new CollapsibleSection('Progress');
    const el = section.getDomNode();
    expect(el.querySelector('.info-section-chevron')).toBeTruthy();
    expect(el.querySelector('.info-section-title')?.textContent).toBe('PROGRESS');
  });

  it('starts expanded by default', () => {
    const section = new CollapsibleSection('Progress');
    const body = section.getDomNode().querySelector('.info-section-body');
    expect(body?.getAttribute('style')).not.toContain('display: none');
  });

  it('starts collapsed when defaultCollapsed is true', () => {
    const section = new CollapsibleSection('Progress', { defaultCollapsed: true });
    expect(section.isCollapsed).toBe(true);
  });

  it('toggles collapse state on header click', () => {
    const section = new CollapsibleSection('Progress');
    const header = section.getDomNode().querySelector('.info-section-header') as HTMLElement;
    header.click();
    expect(section.isCollapsed).toBe(true);
    header.click();
    expect(section.isCollapsed).toBe(false);
  });

  it('updates badge text', () => {
    const section = new CollapsibleSection('Progress');
    section.setBadge('3 / 5');
    const badge = section.getDomNode().querySelector('.info-section-badge');
    expect(badge?.textContent).toBe('3 / 5');
  });

  it('shows and hides section', () => {
    const section = new CollapsibleSection('Test');
    section.setVisible(false);
    expect(section.getDomNode().style.display).toBe('none');
    section.setVisible(true);
    expect(section.getDomNode().style.display).toBe('');
  });

  it('provides body element for content', () => {
    const section = new CollapsibleSection('Test');
    expect(section.bodyElement).toBeInstanceOf(HTMLElement);
    expect(section.bodyElement.classList.contains('info-section-body')).toBe(true);
  });

  it('rotates chevron on collapse', () => {
    const section = new CollapsibleSection('Test');
    const chevron = section.getDomNode().querySelector('.info-section-chevron') as HTMLElement;
    section.setCollapsed(true);
    expect(chevron.classList.contains('info-section-chevron--collapsed')).toBe(true);
  });
});
