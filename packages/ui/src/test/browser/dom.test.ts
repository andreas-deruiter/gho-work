/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { h, addDisposableListener } from '../../browser/dom.js';

describe('h() DOM helper', () => {
  it('should create an element with tag name', () => {
    const { root } = h('div');
    expect(root.tagName).toBe('DIV');
  });

  it('should create an element with classes', () => {
    const { root } = h('div.foo.bar');
    expect(root.classList.contains('foo')).toBe(true);
    expect(root.classList.contains('bar')).toBe(true);
  });

  it('should create an element with id', () => {
    const { root } = h('div#myid');
    expect(root.id).toBe('myid');
  });

  it('should create nested children', () => {
    const result = h('div.parent', [
      h('span.child1@child1'),
      h('span.child2@child2'),
    ]);
    expect(result.root.children.length).toBe(2);
    expect(result.child1.tagName).toBe('SPAN');
    expect(result.child2.classList.contains('child2')).toBe(true);
  });

  it('should support @name references', () => {
    const result = h('div', [
      h('input@input'),
      h('button@btn'),
    ]);
    expect(result.input.tagName).toBe('INPUT');
    expect(result.btn.tagName).toBe('BUTTON');
  });

  it('should default to div when no tag specified', () => {
    const { root } = h('.just-a-class');
    expect(root.tagName).toBe('DIV');
  });
});

describe('addDisposableListener', () => {
  it('should add and remove event listener on dispose', () => {
    const el = document.createElement('div');
    const handler = vi.fn();
    const disposable = addDisposableListener(el, 'click', handler);

    el.click();
    expect(handler).toHaveBeenCalledOnce();

    disposable.dispose();
    el.click();
    expect(handler).toHaveBeenCalledOnce();
  });
});
