import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThemeService } from '../theme.js';
import { createMockIPC } from '../../test/mockIpc.js';

describe('ThemeService', () => {
  let ipc: ReturnType<typeof createMockIPC>;

  beforeEach(() => {
    const stored: Record<string, string> = {};
    ipc = createMockIPC();
    (ipc.invoke as ReturnType<typeof vi.fn>).mockImplementation(async (channel: string, ...args: unknown[]) => {
      if (channel === 'storage:get') {
        const { key } = args[0] as { key: string };
        return { value: stored[key] ?? null };
      }
      if (channel === 'storage:set') {
        const { key, value } = args[0] as { key: string; value: string };
        stored[key] = value;
        return {};
      }
      return {};
    });
    document.documentElement.setAttribute('data-theme', 'system');
    // jsdom doesn't implement matchMedia — provide a stub
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
  });

  it('defaults to system theme', () => {
    const service = new ThemeService(ipc);
    expect(service.currentTheme).toBe('system');
  });

  it('persists theme on setTheme', () => {
    const service = new ThemeService(ipc);
    service.setTheme('dark');
    expect(ipc.invoke).toHaveBeenCalledWith('storage:set', { key: 'theme', value: 'dark' });
  });

  it('fires onDidChangeTheme event', () => {
    const service = new ThemeService(ipc);
    const handler = vi.fn();
    service.onDidChangeTheme(handler);
    service.setTheme('light');
    expect(handler).toHaveBeenCalledWith('light');
  });

  it('loads persisted theme on init', async () => {
    (ipc.invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ value: 'dark' });
    const service = new ThemeService(ipc);
    await service.init();
    expect(service.currentTheme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('stays system if no persisted theme', async () => {
    (ipc.invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ value: null });
    const service = new ThemeService(ipc);
    await service.init();
    expect(service.currentTheme).toBe('system');
  });
});
