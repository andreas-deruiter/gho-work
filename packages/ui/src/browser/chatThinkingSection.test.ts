import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ChatThinkingSection } from './chatThinkingSection.js';

describe('ChatThinkingSection', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('renders collapsed with "Working" title', () => {
    const section = new ChatThinkingSection();
    container.appendChild(section.getDomNode());
    const btn = section.getDomNode().querySelector('button')!;
    expect(btn.textContent).toContain('Working');
    expect(section.getDomNode().classList.contains('collapsed')).toBe(true);
  });

  it('shows thinking-active class while active', () => {
    const section = new ChatThinkingSection();
    container.appendChild(section.getDomNode());
    section.setActive(true);
    expect(section.getDomNode().classList.contains('thinking-active')).toBe(true);
  });

  it('removes thinking-active class when deactivated', () => {
    const section = new ChatThinkingSection();
    container.appendChild(section.getDomNode());
    section.setActive(true);
    section.setActive(false);
    expect(section.getDomNode().classList.contains('thinking-active')).toBe(false);
  });

  it('adds tool call items', () => {
    const section = new ChatThinkingSection();
    container.appendChild(section.getDomNode());
    section.addToolCall('tc-1', 'read_file');
    // Expand to see content (triggers lazy init)
    section.getDomNode().querySelector('button')!.click();
    const items = section.getDomNode().querySelectorAll('.chat-tool-call-item');
    expect(items.length).toBe(1);
  });

  it('updates tool call state', () => {
    const section = new ChatThinkingSection();
    container.appendChild(section.getDomNode());
    section.addToolCall('tc-1', 'grep_search');
    section.updateToolCall('tc-1', 'completed');
    // Expand to see content
    section.getDomNode().querySelector('button')!.click();
    const item = section.getDomNode().querySelector('.chat-tool-call-item')!;
    expect(item.classList.contains('tool-call-completed')).toBe(true);
  });

  it('appends thinking text', () => {
    const section = new ChatThinkingSection();
    container.appendChild(section.getDomNode());
    section.appendThinkingText('Analyzing the code...');
    // Expand to see content
    section.getDomNode().querySelector('button')!.click();
    const thinkingEl = section.getDomNode().querySelector('.thinking-text');
    expect(thinkingEl).not.toBeNull();
    expect(thinkingEl!.textContent).toContain('Analyzing the code...');
  });

  it('shows tool count in title when deactivated', () => {
    const section = new ChatThinkingSection();
    container.appendChild(section.getDomNode());
    section.addToolCall('tc-1', 'read_file');
    section.updateToolCall('tc-1', 'completed');
    section.addToolCall('tc-2', 'grep_search');
    section.updateToolCall('tc-2', 'completed');
    section.setActive(false);
    const btn = section.getDomNode().querySelector('button')!;
    expect(btn.textContent).toContain('2');
  });

  it('cleans up on dispose', () => {
    const section = new ChatThinkingSection();
    section.addToolCall('tc-1', 'read_file');
    section.dispose();
    expect(section.isDisposed).toBe(true);
  });
});
