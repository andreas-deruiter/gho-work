import { Widget } from './widget.js';
import { h } from './dom.js';

export class StatusBar extends Widget {
  private readonly _leftItems: HTMLElement;
  private readonly _rightItems: HTMLElement;

  constructor() {
    const els = h('div.status-bar', [
      h('div.status-bar-left@left'),
      h('div.status-bar-right@right'),
    ]);
    super(els.root);
    this._leftItems = els.left;
    this._rightItems = els.right;
  }

  addLeftItem(text: string, tooltip?: string): HTMLElement {
    const item = h('span.status-bar-item');
    item.root.textContent = text;
    if (tooltip) { item.root.title = tooltip; }
    this._leftItems.appendChild(item.root);
    return item.root;
  }

  addRightItem(text: string, tooltip?: string): HTMLElement {
    const item = h('span.status-bar-item');
    item.root.textContent = text;
    if (tooltip) { item.root.title = tooltip; }
    this._rightItems.appendChild(item.root);
    return item.root;
  }

  updateItem(element: HTMLElement, text: string): void {
    element.textContent = text;
  }
}
