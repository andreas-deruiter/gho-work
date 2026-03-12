import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ChatCollapsible } from './chatCollapsible.js';

describe('ChatCollapsible', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('renders collapsed by default', () => {
    const collapsible = new ChatCollapsible('Test Title');
    container.appendChild(collapsible.getDomNode());

    expect(collapsible.isExpanded).toBe(false);
    expect(collapsible.getDomNode().classList.contains('collapsed')).toBe(true);
    expect(collapsible.getDomNode().querySelector('.collapsible-content')!.children.length).toBe(0);
  });

  it('expands on click and lazily creates content', () => {
    let contentCreated = false;
    const collapsible = new ChatCollapsible('Test Title', {
      createContent: (el) => {
        contentCreated = true;
        el.textContent = 'Expanded content';
      },
    });
    container.appendChild(collapsible.getDomNode());

    expect(contentCreated).toBe(false);
    collapsible.getDomNode().querySelector('button')!.click();
    expect(collapsible.isExpanded).toBe(true);
    expect(contentCreated).toBe(true);
    expect(collapsible.getDomNode().classList.contains('collapsed')).toBe(false);
  });

  it('toggles collapsed on second click', () => {
    const collapsible = new ChatCollapsible('Test Title', {
      createContent: (el) => { el.textContent = 'Content'; },
    });
    container.appendChild(collapsible.getDomNode());

    collapsible.getDomNode().querySelector('button')!.click();
    collapsible.getDomNode().querySelector('button')!.click();

    expect(collapsible.isExpanded).toBe(false);
    expect(collapsible.getDomNode().classList.contains('collapsed')).toBe(true);
  });

  it('sets aria-expanded correctly', () => {
    const collapsible = new ChatCollapsible('Test Title');
    container.appendChild(collapsible.getDomNode());
    const btn = collapsible.getDomNode().querySelector('button')!;

    expect(btn.getAttribute('aria-expanded')).toBe('false');
    btn.click();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });

  it('updates title text', () => {
    const collapsible = new ChatCollapsible('Original');
    container.appendChild(collapsible.getDomNode());

    collapsible.setTitle('Updated');
    const label = collapsible.getDomNode().querySelector('.collapsible-title-label')!;
    expect(label.textContent).toBe('Updated');
  });

  it('cleans up on dispose', () => {
    const collapsible = new ChatCollapsible('Test');
    container.appendChild(collapsible.getDomNode());

    collapsible.dispose();
    expect(collapsible.isDisposed).toBe(true);
  });
});
