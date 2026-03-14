import { describe, it, expect, vi } from 'vitest';
import { AppearancePage } from '../appearancePage.js';
import type { ThemeKind } from '../../theme.js';

function createMockThemeService(initial: ThemeKind = 'system') {
  const listeners: Array<(theme: ThemeKind) => void> = [];
  return {
    currentTheme: initial,
    onDidChangeTheme: vi.fn((handler: (theme: ThemeKind) => void) => {
      listeners.push(handler);
      return { dispose: vi.fn() };
    }),
    setTheme: vi.fn((theme: ThemeKind) => {
      listeners.forEach((l) => l(theme));
    }),
    init: vi.fn(),
    _fire(theme: ThemeKind) {
      listeners.forEach((l) => l(theme));
    },
  };
}

describe('AppearancePage', () => {
  it('renders three theme cards', () => {
    const ts = createMockThemeService();
    const page = new AppearancePage(ts);
    const cards = page.getDomNode().querySelectorAll('.theme-card');
    expect(cards.length).toBe(3);
    page.dispose();
  });

  it('marks current theme as selected', () => {
    const ts = createMockThemeService('dark');
    const page = new AppearancePage(ts);
    const selected = page.getDomNode().querySelector('.theme-card.selected');
    expect(selected?.getAttribute('data-theme')).toBe('dark');
    page.dispose();
  });

  it('calls setTheme on card click', () => {
    const ts = createMockThemeService('system');
    const page = new AppearancePage(ts);
    const cards = page.getDomNode().querySelectorAll('.theme-card');
    const lightCard = Array.from(cards).find((c) => c.getAttribute('data-theme') === 'light');
    (lightCard as HTMLElement).click();
    expect(ts.setTheme).toHaveBeenCalledWith('light');
    page.dispose();
  });

  it('updates selected state when theme changes externally', () => {
    const ts = createMockThemeService('system');
    const page = new AppearancePage(ts);
    ts._fire('light');
    const selected = page.getDomNode().querySelector('.theme-card.selected');
    expect(selected?.getAttribute('data-theme')).toBe('light');
    page.dispose();
  });

  it('has accessible radiogroup structure', () => {
    const ts = createMockThemeService('dark');
    const page = new AppearancePage(ts);
    const dom = page.getDomNode();
    const group = dom.querySelector('[role="radiogroup"]');
    expect(group).toBeTruthy();
    const radios = dom.querySelectorAll('[role="radio"]');
    expect(radios.length).toBe(3);
    const checked = dom.querySelector('[aria-checked="true"]');
    expect(checked?.getAttribute('data-theme')).toBe('dark');
    page.dispose();
  });

  it('arrow keys move focus between cards', () => {
    const ts = createMockThemeService('system');
    const page = new AppearancePage(ts);
    const dom = page.getDomNode();
    document.body.appendChild(dom);
    const cards = dom.querySelectorAll('.theme-card') as NodeListOf<HTMLElement>;
    cards[0].focus();
    cards[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(cards[1]);
    cards[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(cards[2]);
    cards[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(cards[0]);
    document.body.removeChild(dom);
    page.dispose();
  });
});
