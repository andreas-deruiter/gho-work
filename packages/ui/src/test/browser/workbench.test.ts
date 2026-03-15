/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { ActivityBar } from '../../browser/activityBar.js';

describe('ActivityBar', () => {
  it('should render all activity items', () => {
    const bar = new ActivityBar();
    const el = bar.getDomNode();
    const buttons = el.querySelectorAll('.activity-bar-item');
    expect(buttons.length).toBe(3);
    bar.dispose();
  });

  it('should emit onDidSelectItem when item clicked', () => {
    const bar = new ActivityBar();
    const listener = vi.fn();
    bar.onDidSelectItem(listener);

    const settingsBtn = bar.getDomNode().querySelector('[data-item="settings"]') as HTMLElement;
    settingsBtn.click();

    expect(listener).toHaveBeenCalledWith('settings');
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

