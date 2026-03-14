/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { ActivityBar } from '../../browser/activityBar.js';
import { StatusBar } from '../../browser/statusBar/statusBar.js';

describe('ActivityBar', () => {
  it('should render all activity items', () => {
    const bar = new ActivityBar();
    const el = bar.getDomNode();
    const buttons = el.querySelectorAll('.activity-bar-item');
    expect(buttons.length).toBe(4);
    bar.dispose();
  });

  it('should emit onDidSelectItem when item clicked', () => {
    const bar = new ActivityBar();
    const listener = vi.fn();
    bar.onDidSelectItem(listener);

    const toolsBtn = bar.getDomNode().querySelector('[data-item="tools"]') as HTMLElement;
    toolsBtn.click();

    expect(listener).toHaveBeenCalledWith('tools');
    bar.dispose();
  });

  it('should update active state', () => {
    const bar = new ActivityBar();
    bar.setActiveItem('settings');

    const settingsBtn = bar.getDomNode().querySelector('[data-item="settings"]') as HTMLElement;
    expect(settingsBtn.classList.contains('active')).toBe(true);

    const chatBtn = bar.getDomNode().querySelector('[data-item="chat"]') as HTMLElement;
    expect(chatBtn.classList.contains('active')).toBe(false);
    bar.dispose();
  });

  it('should have ARIA attributes for accessibility', () => {
    const bar = new ActivityBar();
    const buttons = bar.getDomNode().querySelectorAll('.activity-bar-item');
    for (const btn of Array.from(buttons)) {
      expect(btn.getAttribute('role')).toBe('tab');
      expect(btn.getAttribute('aria-label')).toBeTruthy();
    }
    bar.dispose();
  });
});

describe('StatusBar (workbench)', () => {
  it('should render left and right sections', () => {
    const bar = new StatusBar();
    const el = bar.getDomNode();
    expect(el.querySelector('.status-bar-left')).toBeTruthy();
    expect(el.querySelector('.status-bar-right')).toBeTruthy();
    bar.dispose();
  });

  it('should update agent state', () => {
    const bar = new StatusBar();
    bar.updateAgentState({ state: 'idle' });
    const label = bar.getDomNode().querySelector('.sb-agent-label');
    expect(label?.textContent).toBe('Agent idle');
    bar.dispose();
  });
});
