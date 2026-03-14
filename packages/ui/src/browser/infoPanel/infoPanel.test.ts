import { describe, it, expect, beforeEach } from 'vitest';
import { InfoPanel } from './infoPanel.js';

describe('InfoPanel', () => {
  let panel: InfoPanel;

  beforeEach(() => {
    panel = new InfoPanel();
  });

  it('renders three section containers', () => {
    const root = panel.getDomNode();
    expect(root.classList.contains('info-panel')).toBe(true);
    expect(root.querySelector('.info-panel-progress')).not.toBeNull();
    expect(root.querySelector('.info-panel-input')).not.toBeNull();
    expect(root.querySelector('.info-panel-output')).not.toBeNull();
  });

  it('shows empty state when no data', () => {
    const emptyMsg = panel.getDomNode().querySelector('.info-panel-empty');
    expect(emptyMsg).not.toBeNull();
    expect(emptyMsg!.textContent).toContain('Panel will populate');
  });

  it('hides empty state after receiving plan event', () => {
    panel.handleEvent({
      type: 'plan_created',
      plan: { id: 'p1', steps: [{ id: 's1', label: 'Do thing' }, { id: 's2', label: 'Other' }] },
    });
    const emptyMsg = panel.getDomNode().querySelector('.info-panel-empty');
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
