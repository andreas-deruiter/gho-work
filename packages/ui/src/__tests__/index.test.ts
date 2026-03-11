import { describe, it, expect, vi } from 'vitest';

// ChatPanel uses DOM APIs; vitest.config.ts sets environment: 'jsdom'
import { ChatPanel } from '../browser/chatPanel.js';

describe('ui package', () => {
  it('ChatPanel can be instantiated with a mock IPC renderer', () => {
    const mockIpc = {
      invoke: vi.fn().mockResolvedValue({}),
      on: vi.fn(),
      removeListener: vi.fn(),
    };
    const panel = new ChatPanel(mockIpc);
    expect(panel).toBeDefined();
  });

  it('ChatPanel.render populates the container element', () => {
    const mockIpc = {
      invoke: vi.fn().mockResolvedValue({}),
      on: vi.fn(),
      removeListener: vi.fn(),
    };
    const panel = new ChatPanel(mockIpc);
    const container = document.createElement('div');
    panel.render(container);
    expect(container.querySelector('.chat-panel')).not.toBeNull();
  });
});
