import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsPanel } from '../settingsPanel.js';

function createMockIPC() {
  return {
    invoke: vi.fn().mockImplementation((channel: string) => {
      if (channel === 'skill:sources' || channel === 'skill:list') {
        return Promise.resolve([]);
      }
      return Promise.resolve({});
    }),
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

  it('renders nav with General, Skills, Plugins, and Connectors items', () => {
    const panel = new SettingsPanel(ipc, themeService);
    const dom = panel.getDomNode();
    const navItems = dom.querySelectorAll('.settings-nav-item');
    expect(navItems.length).toBe(4);
    expect(navItems[0].textContent).toBe('General');
    expect(navItems[1].textContent).toBe('Skills');
    expect(navItems[2].textContent).toBe('Plugins');
    expect(navItems[3].textContent).toBe('Connectors');
    panel.dispose();
  });

  it('defaults to General page', () => {
    const panel = new SettingsPanel(ipc, themeService);
    const dom = panel.getDomNode();
    const activeNav = dom.querySelector('.settings-nav-item.active');
    expect(activeNav?.textContent).toBe('General');
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
