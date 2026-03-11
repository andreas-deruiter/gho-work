/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { ActivityBar } from '../../browser/activityBar.js';
import { StatusBar } from '../../browser/statusBar.js';

describe('ActivityBar', () => {
  it('should render all activity items', () => {
    const bar = new ActivityBar();
    const el = bar.getDomNode();
    const buttons = el.querySelectorAll('.activity-bar-item');
    expect(buttons.length).toBe(5);
    bar.dispose();
  });

  it('should emit onDidSelectItem when item clicked', () => {
    const bar = new ActivityBar();
    const listener = vi.fn();
    bar.onDidSelectItem(listener);

    const connBtn = bar.getDomNode().querySelector('[data-item="connectors"]') as HTMLElement;
    connBtn.click();

    expect(listener).toHaveBeenCalledWith('connectors');
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
    for (const btn of buttons) {
      expect(btn.getAttribute('role')).toBe('tab');
      expect(btn.getAttribute('aria-label')).toBeTruthy();
    }
    bar.dispose();
  });
});

describe('StatusBar', () => {
  it('should render left and right sections', () => {
    const bar = new StatusBar();
    const el = bar.getDomNode();
    expect(el.querySelector('.status-bar-left')).toBeTruthy();
    expect(el.querySelector('.status-bar-right')).toBeTruthy();
    bar.dispose();
  });

  it('should add and update items', () => {
    const bar = new StatusBar();
    const item = bar.addLeftItem('Ready', 'System status');
    expect(item.textContent).toBe('Ready');
    expect(item.title).toBe('System status');

    bar.updateItem(item, 'Processing...');
    expect(item.textContent).toBe('Processing...');
    bar.dispose();
  });
});
