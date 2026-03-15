import { describe, it, expect, beforeEach } from 'vitest';
import { InfoPanel } from './infoPanel.js';

describe('InfoPanel', () => {
  let panel: InfoPanel;

  beforeEach(() => {
    panel = new InfoPanel();
  });

  it('renders section containers', () => {
    const root = panel.getDomNode();
    expect(root.classList.contains('info-panel')).toBe(true);
    expect(root.querySelector('.info-panel-todo')).not.toBeNull();
    expect(root.querySelector('.info-panel-input')).not.toBeNull();
    expect(root.querySelector('.info-panel-output')).not.toBeNull();
  });

  it('shows empty state when no data', () => {
    const emptyMsg = panel.getDomNode().querySelector('.info-panel-empty');
    expect(emptyMsg).not.toBeNull();
    expect(emptyMsg!.textContent).toContain('Panel will populate');
  });

  it('hides empty state after receiving todo_list_updated event', () => {
    panel.handleEvent({
      type: 'todo_list_updated',
      todos: [
        { id: 1, title: 'Do thing', status: 'not-started' },
        { id: 2, title: 'Other', status: 'not-started' },
      ],
    });
    const emptyMsg = panel.getDomNode().querySelector<HTMLElement>('.info-panel-empty');
    expect(emptyMsg!.style.display).toBe('none');
  });

  it('manages per-conversation state', () => {
    panel.setConversation('conv-1');
    panel.handleEvent({
      type: 'attachment_added',
      attachment: { name: 'f.csv', path: '/f.csv', source: 'drag-drop' },
      messageId: 'msg-1',
    });

    // Switch to different conversation
    panel.setConversation('conv-2');
    // conv-2 should have no inputs
    const inputSection = panel.getDomNode().querySelector('.info-panel-input');
    expect(inputSection!.querySelectorAll('.info-entry').length).toBe(0);

    // Switch back — state restored
    panel.setConversation('conv-1');
    expect(inputSection!.querySelectorAll('.info-entry').length).toBe(1);
  });

  it('has correct ARIA attributes', () => {
    const root = panel.getDomNode();
    expect(root.getAttribute('role')).toBe('complementary');
    expect(root.getAttribute('aria-label')).toBe('Task info');
  });
});
