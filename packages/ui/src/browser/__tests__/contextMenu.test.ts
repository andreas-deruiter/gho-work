import { describe, it, expect, vi, afterEach } from 'vitest';
import { ContextMenu, type ContextMenuItem } from '../contextMenu.js';

describe('ContextMenu', () => {
  afterEach(() => {
    document.body.textContent = '';
  });

  it('renders menu items', () => {
    const items: ContextMenuItem[] = [
      { label: 'Attach', action: vi.fn() },
      { label: 'Rename', action: vi.fn() },
      { separator: true },
      { label: 'Delete', action: vi.fn() },
    ];
    const menu = ContextMenu.show(items, 100, 200);
    const menuItems = document.querySelectorAll('.context-menu-item');
    expect(menuItems.length).toBe(3);
    const separators = document.querySelectorAll('.context-menu-separator');
    expect(separators.length).toBe(1);
    menu.dispose();
  });

  it('calls action and closes on item click', () => {
    const action = vi.fn();
    const menu = ContextMenu.show([{ label: 'Do Thing', action }], 0, 0);
    const item = document.querySelector('.context-menu-item') as HTMLElement;
    item.click();
    expect(action).toHaveBeenCalledOnce();
    expect(document.querySelector('.context-menu')).toBeNull();
    menu.dispose();
  });

  it('closes on Escape key', () => {
    const menu = ContextMenu.show([{ label: 'Item', action: vi.fn() }], 0, 0);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.context-menu')).toBeNull();
    menu.dispose();
  });
});
