import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ChatToolCallItem } from './chatToolCallItem.js';

describe('ChatToolCallItem', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('renders with tool name and executing state', () => {
    const item = new ChatToolCallItem('tc-1', 'read_file', 'executing');
    container.appendChild(item.getDomNode());
    const label = item.getDomNode().querySelector('.tool-call-label')!;
    expect(label.textContent).toContain('read_file');
    expect(item.getDomNode().classList.contains('tool-call-executing')).toBe(true);
  });

  it('transitions to completed state', () => {
    const item = new ChatToolCallItem('tc-1', 'grep_search', 'executing');
    container.appendChild(item.getDomNode());
    item.setState('completed');
    expect(item.getDomNode().classList.contains('tool-call-completed')).toBe(true);
    expect(item.getDomNode().classList.contains('tool-call-executing')).toBe(false);
  });

  it('transitions to failed state', () => {
    const item = new ChatToolCallItem('tc-1', 'run_in_terminal', 'executing');
    container.appendChild(item.getDomNode());
    item.setState('failed');
    expect(item.getDomNode().classList.contains('tool-call-failed')).toBe(true);
  });

  it('applies correct icon class based on tool name', () => {
    const item = new ChatToolCallItem('tc-1', 'grep_search', 'executing');
    container.appendChild(item.getDomNode());
    const icon = item.getDomNode().querySelector('.tool-call-type-icon')!;
    expect(icon.classList.contains('icon-search')).toBe(true);
  });

  it('shows shimmer animation while executing', () => {
    const item = new ChatToolCallItem('tc-1', 'read_file', 'executing');
    container.appendChild(item.getDomNode());
    const label = item.getDomNode().querySelector('.tool-call-label')!;
    expect(label.classList.contains('shimmer')).toBe(true);
  });

  it('removes shimmer when completed', () => {
    const item = new ChatToolCallItem('tc-1', 'read_file', 'executing');
    container.appendChild(item.getDomNode());
    item.setState('completed');
    const label = item.getDomNode().querySelector('.tool-call-label')!;
    expect(label.classList.contains('shimmer')).toBe(false);
  });

  it('cleans up on dispose', () => {
    const item = new ChatToolCallItem('tc-1', 'test', 'executing');
    item.dispose();
    expect(item.isDisposed).toBe(true);
  });
});
