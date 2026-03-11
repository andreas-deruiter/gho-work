/**
 * Sidebar widget — container for switchable panels controlled by ActivityBar.
 */
import { Widget } from './widget.js';
import { h } from './dom.js';
import type { ActivityBarItem } from './activityBar.js';

export class Sidebar extends Widget {
  private _activePanel: ActivityBarItem = 'chat';
  private readonly _panels = new Map<string, HTMLElement>();

  constructor() {
    const { root } = h('div.sidebar');
    super(root);
  }

  addPanel(id: ActivityBarItem, content: HTMLElement): void {
    this._panels.set(id, content);
    content.style.display = id === this._activePanel ? '' : 'none';
    this.element.appendChild(content);
  }

  showPanel(id: ActivityBarItem): void {
    this._activePanel = id;
    for (const [panelId, el] of this._panels) {
      el.style.display = panelId === id ? '' : 'none';
    }
  }
}
