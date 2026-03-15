import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FilesPanel } from '../filesPanel.js';
import { createMockIPC } from '../../test/mockIpc.js';

describe('FilesPanel', () => {
  let panel: FilesPanel;
  let ipc: ReturnType<typeof createMockIPC>;

  beforeEach(async () => {
    ipc = createMockIPC();
    (ipc.invoke as ReturnType<typeof vi.fn>).mockImplementation(async (channel: string, args?: Record<string, unknown>) => {
      if (channel === 'workspace:get-root') { return { path: '/test/workspace' }; }
      if (channel === 'files:stat') {
        return { name: 'workspace', path: '/test/workspace', type: 'directory', size: 0, mtime: Date.now(), isHidden: false };
      }
      if (channel === 'files:read-dir') {
        return [
          { name: 'readme.md', path: '/test/workspace/readme.md', type: 'file', size: 1024, mtime: Date.now(), isHidden: false },
          { name: 'src', path: '/test/workspace/src', type: 'directory', size: 0, mtime: Date.now(), isHidden: false },
          { name: '.git', path: '/test/workspace/.git', type: 'directory', size: 0, mtime: Date.now(), isHidden: true },
        ];
      }
      if (channel === 'files:search') {
        const query = (args as { query?: string })?.query ?? '';
        const all = [
          { name: 'readme.md', path: '/test/workspace/readme.md', type: 'file', size: 1024, mtime: Date.now(), isHidden: false },
          { name: 'index.ts', path: '/test/workspace/src/index.ts', type: 'file', size: 512, mtime: Date.now(), isHidden: false },
        ];
        return all.filter(e => e.name.toLowerCase().includes(query.toLowerCase()));
      }
      if (channel === 'files:watch') { return { watchId: 'w1' }; }
      return {};
    });
    panel = new FilesPanel('/test/workspace', ipc);
    document.body.appendChild(panel.getDomNode());
    await panel.load();
  });

  afterEach(() => {
    panel.dispose();
    document.body.textContent = '';
  });

  it('renders header with title and SVG action buttons', () => {
    const header = panel.getDomNode().querySelector('.files-header');
    expect(header).toBeTruthy();
    expect(header!.textContent).toContain('FILES');
    // 3 buttons: toggle hidden, sort, refresh (no new-file button)
    const buttons = header!.querySelectorAll('button');
    expect(buttons.length).toBe(3);
    // Each button should contain an SVG icon
    for (const btn of buttons) {
      expect(btn.querySelector('svg')).toBeTruthy();
    }
  });

  it('renders file tree with entries', () => {
    const rows = panel.getDomNode().querySelectorAll('.tree-row');
    // Should show readme.md and src (not .git — hidden by default)
    expect(rows.length).toBe(2);
  });

  it('hides dotfiles by default', () => {
    const allText = panel.getDomNode().textContent;
    expect(allText).not.toContain('.git');
  });

  it('shows dotfiles when toggle hidden is clicked', async () => {
    const toggleBtn = panel.getDomNode().querySelector('[aria-label="Toggle hidden files"]') as HTMLElement;
    toggleBtn.click();
    await vi.waitFor(() => {
      const allText = panel.getDomNode().textContent;
      expect(allText).toContain('.git');
    });
  });

  it('fires onDidRequestAttach when attach button is clicked', () => {
    const attached: unknown[] = [];
    panel.onDidRequestAttach(file => attached.push(file));
    const attachBtn = panel.getDomNode().querySelector('.tree-attach-btn') as HTMLElement;
    attachBtn?.click();
    expect(attached.length).toBe(1);
  });

  it('triggers search via IPC when filter input has text', async () => {
    const input = panel.getDomNode().querySelector('.files-filter-input') as HTMLInputElement;
    input.value = 'readme';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    // Wait for debounce (300ms) + search completion
    await vi.waitFor(() => {
      const searchRows = panel.getDomNode().querySelectorAll('.files-search-row');
      expect(searchRows.length).toBe(1);
    }, { timeout: 2000 });

    // Verify IPC was called with search channel
    const invokeMock = ipc.invoke as ReturnType<typeof vi.fn>;
    const searchCalls = invokeMock.mock.calls.filter(
      (call: unknown[]) => call[0] === 'files:search',
    );
    expect(searchCalls.length).toBe(1);
    expect(searchCalls[0][1]).toMatchObject({ query: 'readme' });
  });

  it('refreshes tree when refresh button is clicked', () => {
    const invokeMock = ipc.invoke as ReturnType<typeof vi.fn>;
    const callCountBefore = invokeMock.mock.calls.length;
    const refreshBtn = panel.getDomNode().querySelector('[aria-label="Refresh"]') as HTMLElement;
    refreshBtn.click();
    expect(invokeMock.mock.calls.length).toBeGreaterThan(callCountBefore);
  });

  it('has title attribute on tree-name spans for tooltip', () => {
    const nameSpans = panel.getDomNode().querySelectorAll('.tree-name');
    for (const span of nameSpans) {
      expect(span.getAttribute('title')).toBeTruthy();
    }
  });
});
