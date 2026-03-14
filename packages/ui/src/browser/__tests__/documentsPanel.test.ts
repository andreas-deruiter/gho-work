import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DocumentsPanel } from '../documentsPanel.js';

function createMockIPC() {
  return {
    invoke: vi.fn().mockImplementation(async (channel: string) => {
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
      if (channel === 'files:watch') { return { watchId: 'w1' }; }
      return {};
    }),
    on: vi.fn().mockReturnValue({ dispose: () => {} }),
    removeListener: vi.fn(),
  };
}

describe('DocumentsPanel', () => {
  let panel: DocumentsPanel;
  let ipc: ReturnType<typeof createMockIPC>;

  beforeEach(async () => {
    ipc = createMockIPC();
    panel = new DocumentsPanel('/test/workspace', ipc);
    document.body.appendChild(panel.getDomNode());
    await panel.load();
  });

  afterEach(() => {
    panel.dispose();
    document.body.textContent = '';
  });

  it('renders header with title and action buttons', () => {
    const header = panel.getDomNode().querySelector('.documents-header');
    expect(header).toBeTruthy();
    expect(header!.textContent).toContain('DOCUMENTS');
    const buttons = header!.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThanOrEqual(3);
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

  it('filters tree when filter input changes', async () => {
    const input = panel.getDomNode().querySelector('.documents-filter-input') as HTMLInputElement;
    input.value = 'readme';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => {
      const rows = panel.getDomNode().querySelectorAll('.tree-row');
      expect(rows.length).toBe(1);
    });
  });

  it('refreshes tree when refresh button is clicked', () => {
    const callCountBefore = ipc.invoke.mock.calls.length;
    const refreshBtn = panel.getDomNode().querySelector('[aria-label="Refresh"]') as HTMLElement;
    refreshBtn.click();
    expect(ipc.invoke.mock.calls.length).toBeGreaterThan(callCountBefore);
  });
});
