import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChatPanel } from '../chatPanel.js';

function createMockIPC() {
  return {
    invoke: vi.fn().mockResolvedValue({}),
    on: vi.fn().mockReturnValue({ dispose: () => {} }),
    removeListener: vi.fn(),
  };
}

describe('ChatPanel attachment public API', () => {
  let chatPanel: ChatPanel;
  let ipc: ReturnType<typeof createMockIPC>;

  beforeEach(() => {
    ipc = createMockIPC();
    chatPanel = new ChatPanel(ipc as any);
    // ChatPanel needs render() to initialize DOM elements
    const container = document.createElement('div');
    chatPanel.render(container);
    document.body.appendChild(container);
  });

  afterEach(() => {
    chatPanel.dispose();
    document.body.textContent = '';
  });

  it('addAttachment adds a pill to the attachment list', () => {
    const entry = {
      name: 'test.md',
      path: '/test/test.md',
      type: 'file' as const,
      size: 100,
      mtime: Date.now(),
      isHidden: false,
    };
    chatPanel.addAttachment(entry);
    const pills = document.querySelectorAll('.attachment-pill');
    expect(pills.length).toBe(1);
    expect(pills[0].textContent).toContain('test.md');
  });

  it('addAttachment deduplicates by path', () => {
    const entry = {
      name: 'test.md',
      path: '/test/test.md',
      type: 'file' as const,
      size: 100,
      mtime: Date.now(),
      isHidden: false,
    };
    chatPanel.addAttachment(entry);
    chatPanel.addAttachment(entry);
    const pills = document.querySelectorAll('.attachment-pill');
    expect(pills.length).toBe(1);
  });

  it('removeAttachment removes the pill', () => {
    const entry = {
      name: 'test.md',
      path: '/test/test.md',
      type: 'file' as const,
      size: 100,
      mtime: Date.now(),
      isHidden: false,
    };
    chatPanel.addAttachment(entry);
    chatPanel.removeAttachment('/test/test.md');
    const pills = document.querySelectorAll('.attachment-pill');
    expect(pills.length).toBe(0);
  });

  it('fires onDidChangeAttachments when attachments are added', () => {
    const events: unknown[] = [];
    chatPanel.onDidChangeAttachments(list => events.push(list));
    const entry = {
      name: 'test.md',
      path: '/test/test.md',
      type: 'file' as const,
      size: 100,
      mtime: Date.now(),
      isHidden: false,
    };
    chatPanel.addAttachment(entry);
    expect(events.length).toBe(1);
  });

  it('fires onDidChangeAttachments when attachments are removed', () => {
    const entry = {
      name: 'test.md',
      path: '/test/test.md',
      type: 'file' as const,
      size: 100,
      mtime: Date.now(),
      isHidden: false,
    };
    chatPanel.addAttachment(entry);
    const events: unknown[] = [];
    chatPanel.onDidChangeAttachments(list => events.push(list));
    chatPanel.removeAttachment('/test/test.md');
    expect(events.length).toBe(1);
    expect(events[0]).toEqual([]);
  });

  it('does not fire onDidChangeAttachments for duplicate add', () => {
    const events: unknown[] = [];
    chatPanel.onDidChangeAttachments(list => events.push(list));
    const entry = {
      name: 'test.md',
      path: '/test/test.md',
      type: 'file' as const,
      size: 100,
      mtime: Date.now(),
      isHidden: false,
    };
    chatPanel.addAttachment(entry);
    chatPanel.addAttachment(entry); // duplicate — should be ignored
    expect(events.length).toBe(1);
  });
});
