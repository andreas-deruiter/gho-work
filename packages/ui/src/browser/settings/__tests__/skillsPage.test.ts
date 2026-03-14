import { describe, it, expect, vi } from 'vitest';
import { SkillsPage } from '../skillsPage.js';

function createMockIPC(data?: {
  skills?: Array<{ id: string; category: string; name: string; description: string; sourceId: string; filePath: string }>;
  sources?: Array<{ id: string; priority: number; basePath: string }>;
}) {
  const skills = data?.skills ?? [
    { id: 'install/gh', category: 'install', name: 'gh', description: 'Install GitHub CLI', sourceId: 'bundled', filePath: '/skills/install/gh.md' },
    { id: 'auth/gh', category: 'auth', name: 'gh', description: 'Authenticate with GitHub', sourceId: 'bundled', filePath: '/skills/auth/gh.md' },
  ];
  const sources = data?.sources ?? [
    { id: 'bundled', priority: 0, basePath: 'skills/' },
    { id: 'user', priority: 10, basePath: '~/.gho-work/skills/' },
  ];

  return {
    invoke: vi.fn(async (channel: string, ..._args: unknown[]) => {
      if (channel === 'skill:list') { return skills; }
      if (channel === 'skill:sources') { return sources; }
      if (channel === 'skill:add-path') { return { ok: true }; }
      if (channel === 'skill:remove-path') { return {}; }
      if (channel === 'skill:rescan') { return skills; }
      return {};
    }),
    on: vi.fn(),
    removeListener: vi.fn(),
  };
}

describe('SkillsPage', () => {
  it('renders page title and subtitle', () => {
    const ipc = createMockIPC();
    const page = new SkillsPage(ipc);
    const dom = page.getDomNode();
    expect(dom.querySelector('.settings-page-title')?.textContent).toBe('Skills');
    expect(dom.querySelector('.settings-page-subtitle')?.textContent).toContain('skill');
    page.dispose();
  });

  it('renders skill sources after load', async () => {
    const ipc = createMockIPC();
    const page = new SkillsPage(ipc);
    await page.load();
    const dom = page.getDomNode();
    const sources = dom.querySelectorAll('.skill-source-item');
    expect(sources.length).toBe(2);
    page.dispose();
  });

  it('renders skills grouped by category after load', async () => {
    const ipc = createMockIPC();
    const page = new SkillsPage(ipc);
    await page.load();
    const dom = page.getDomNode();
    const categories = dom.querySelectorAll('.skill-category');
    expect(categories.length).toBe(2);
    const items = dom.querySelectorAll('.skill-item');
    expect(items.length).toBe(2);
    page.dispose();
  });

  it('shows remove button only for user paths (priority > 0)', async () => {
    const ipc = createMockIPC();
    const page = new SkillsPage(ipc);
    await page.load();
    const dom = page.getDomNode();
    const removeBtns = dom.querySelectorAll('.skill-source-remove');
    expect(removeBtns.length).toBe(1);
    page.dispose();
  });

  it('calls skill:add-path IPC when adding a path', async () => {
    const ipc = createMockIPC();
    const page = new SkillsPage(ipc);
    await page.load();
    const dom = page.getDomNode();
    const input = dom.querySelector('.skill-path-input') as HTMLInputElement;
    const addBtn = dom.querySelector('.skill-path-add-btn') as HTMLButtonElement;
    input.value = '/new/path';
    addBtn.click();
    expect(ipc.invoke).toHaveBeenCalledWith('skill:add-path', { path: '/new/path' });
    page.dispose();
  });

  it('shows error when add-path fails', async () => {
    const ipc = createMockIPC();
    ipc.invoke.mockImplementation(async (channel: string) => {
      if (channel === 'skill:add-path') { return { error: 'Directory not found' }; }
      if (channel === 'skill:list') { return []; }
      if (channel === 'skill:sources') { return []; }
      return {};
    });
    const page = new SkillsPage(ipc);
    await page.load();
    const dom = page.getDomNode();
    const input = dom.querySelector('.skill-path-input') as HTMLInputElement;
    const addBtn = dom.querySelector('.skill-path-add-btn') as HTMLButtonElement;
    input.value = '/bad/path';
    addBtn.click();
    await vi.waitFor(() => {
      const error = dom.querySelector('.skill-path-input-error');
      expect(error?.textContent).toBe('Directory not found');
    });
    page.dispose();
  });

  it('calls skill:rescan IPC on rescan click', async () => {
    const ipc = createMockIPC();
    const page = new SkillsPage(ipc);
    await page.load();
    const dom = page.getDomNode();
    const rescanBtn = dom.querySelector('.skill-rescan-btn') as HTMLButtonElement;
    rescanBtn.click();
    expect(ipc.invoke).toHaveBeenCalledWith('skill:rescan');
    page.dispose();
  });

  it('shows empty state when no skills', async () => {
    const ipc = createMockIPC({ skills: [], sources: [] });
    const page = new SkillsPage(ipc);
    await page.load();
    const dom = page.getDomNode();
    const empty = dom.querySelector('.skill-empty-state');
    expect(empty).toBeTruthy();
    page.dispose();
  });

  it('renders toggle switches for each skill', async () => {
    const ipc = createMockIPC();
    const page = new SkillsPage(ipc);
    await page.load();
    const dom = page.getDomNode();
    const toggles = dom.querySelectorAll('.skill-toggle');
    expect(toggles.length).toBe(2);
    toggles.forEach(t => {
      expect(t.getAttribute('role')).toBe('switch');
      expect(t.getAttribute('aria-checked')).toBe('true');
      expect(t.getAttribute('tabindex')).toBe('0');
    });
    page.dispose();
  });

  it('renders disabled skills with aria-checked=false and dimmed row', async () => {
    const ipc = createMockIPC();
    ipc.invoke.mockImplementation(async (channel: string) => {
      if (channel === 'skill:list') {
        return [
          { id: 'install/gh', category: 'install', name: 'gh', description: 'Install GitHub CLI', sourceId: 'bundled', filePath: '/skills/install/gh.md', disabled: true },
        ];
      }
      if (channel === 'skill:sources') { return []; }
      if (channel === 'skill:disabled-list') { return ['install/gh']; }
      return {};
    });
    const page = new SkillsPage(ipc);
    await page.load();
    const dom = page.getDomNode();
    const toggle = dom.querySelector('.skill-toggle');
    expect(toggle?.getAttribute('aria-checked')).toBe('false');
    const item = dom.querySelector('.skill-item');
    expect(item?.classList.contains('disabled')).toBe(true);
    page.dispose();
  });

  it('calls skill:toggle IPC when toggle is clicked', async () => {
    const ipc = createMockIPC();
    const page = new SkillsPage(ipc);
    await page.load();
    const dom = page.getDomNode();
    const toggle = dom.querySelector('.skill-toggle') as HTMLElement;
    toggle.click();
    expect(ipc.invoke).toHaveBeenCalledWith('skill:toggle', { skillId: 'install/gh', enabled: false });
    page.dispose();
  });

  it('shows disclaimer after first toggle', async () => {
    const ipc = createMockIPC();
    const page = new SkillsPage(ipc);
    await page.load();
    const dom = page.getDomNode();
    // No disclaimer before toggle
    expect(dom.querySelector('.skill-toggle-disclaimer')).toBeNull();
    // Click toggle
    const toggle = dom.querySelector('.skill-toggle') as HTMLElement;
    toggle.click();
    await vi.waitFor(() => {
      expect(dom.querySelector('.skill-toggle-disclaimer')).toBeTruthy();
      expect(dom.querySelector('.skill-toggle-disclaimer')?.textContent).toContain('new conversations');
    });
    page.dispose();
  });

  it('toggle responds to Enter key', async () => {
    const ipc = createMockIPC();
    const page = new SkillsPage(ipc);
    await page.load();
    const dom = page.getDomNode();
    const toggle = dom.querySelector('.skill-toggle') as HTMLElement;
    toggle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(ipc.invoke).toHaveBeenCalledWith('skill:toggle', { skillId: 'install/gh', enabled: false });
    page.dispose();
  });

  it('toggle responds to Space key', async () => {
    const ipc = createMockIPC();
    const page = new SkillsPage(ipc);
    await page.load();
    const dom = page.getDomNode();
    const toggle = dom.querySelector('.skill-toggle') as HTMLElement;
    toggle.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(ipc.invoke).toHaveBeenCalledWith('skill:toggle', { skillId: 'install/gh', enabled: false });
    page.dispose();
  });
});
