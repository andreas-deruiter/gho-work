import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsPanel } from '../settingsPanel.js';

function createMockIPC() {
  return {
    invoke: vi.fn().mockResolvedValue({}),
    on: vi.fn(),
    removeListener: vi.fn(),
  };
}

function createMockThemeService() {
  return {
    currentTheme: 'system' as const,
    onDidChangeTheme: vi.fn(() => ({ dispose: vi.fn() })),
    setTheme: vi.fn(),
    init: vi.fn(),
  };
}

describe('SettingsPanel', () => {
  let ipc: ReturnType<typeof createMockIPC>;
  let themeService: ReturnType<typeof createMockThemeService>;

  beforeEach(() => {
    ipc = createMockIPC();
    themeService = createMockThemeService();
  });

  it('renders nav with Appearance and Skills items', () => {
    const panel = new SettingsPanel(ipc, themeService);
    const dom = panel.getDomNode();
    const navItems = dom.querySelectorAll('.settings-nav-item');
    expect(navItems.length).toBe(2);
    expect(navItems[0].textContent).toBe('Appearance');
    expect(navItems[1].textContent).toBe('Skills');
    panel.dispose();
  });

  it('defaults to Appearance page', () => {
    const panel = new SettingsPanel(ipc, themeService);
    const dom = panel.getDomNode();
    const activeNav = dom.querySelector('.settings-nav-item.active');
    expect(activeNav?.textContent).toBe('Appearance');
    const content = dom.querySelector('.settings-content');
    expect(content?.querySelector('.theme-card')).toBeTruthy();
    panel.dispose();
  });

  it('switches to Skills page on nav click', () => {
    const panel = new SettingsPanel(ipc, themeService);
    const dom = panel.getDomNode();
    const navItems = dom.querySelectorAll('.settings-nav-item');
    (navItems[1] as HTMLElement).click();
    const activeNav = dom.querySelector('.settings-nav-item.active');
    expect(activeNav?.textContent).toBe('Skills');
    const content = dom.querySelector('.settings-content');
    expect(content?.querySelector('.skill-source-list')).toBeTruthy();
    panel.dispose();
  });

  it('disposes active page when switching', () => {
    const panel = new SettingsPanel(ipc, themeService);
    const dom = panel.getDomNode();
    const content = dom.querySelector('.settings-content')!;
    const initialChild = content.firstElementChild;
    const navItems = dom.querySelectorAll('.settings-nav-item');
    (navItems[1] as HTMLElement).click();
    expect(content.firstElementChild).not.toBe(initialChild);
    panel.dispose();
  });

  it('cleans up on dispose', () => {
    const panel = new SettingsPanel(ipc, themeService);
    panel.dispose();
  });
});
