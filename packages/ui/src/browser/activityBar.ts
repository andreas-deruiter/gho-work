import { Emitter } from '@gho-work/base';
import type { Event } from '@gho-work/base';
import { Widget } from './widget.js';
import { h } from './dom.js';

export type ActivityBarItem = 'chat' | 'tools' | 'connectors' | 'documents' | 'settings';

export class ActivityBar extends Widget {
  private _activeItem: ActivityBarItem = 'chat';
  private readonly _onDidSelectItem = this._register(new Emitter<ActivityBarItem>());
  readonly onDidSelectItem: Event<ActivityBarItem> = this._onDidSelectItem.event;
  private readonly _buttons = new Map<ActivityBarItem, HTMLElement>();

  constructor() {
    const { root } = h('div.activity-bar');
    super(root);

    const items: { id: ActivityBarItem; label: string; bottom?: boolean }[] = [
      { id: 'chat', label: 'Chat' },
      { id: 'tools', label: 'Tool Activity' },
      { id: 'connectors', label: 'Connectors' },
      { id: 'documents', label: 'Documents' },
      { id: 'settings', label: 'Settings', bottom: true },
    ];

    const topGroup = h('div.activity-bar-top');
    const bottomGroup = h('div.activity-bar-bottom');

    for (const item of items) {
      const btn = h('button.activity-bar-item');
      btn.root.setAttribute('title', item.label);
      btn.root.setAttribute('aria-label', item.label);
      btn.root.setAttribute('role', 'tab');
      btn.root.dataset.item = item.id;
      btn.root.textContent = item.label.charAt(0);

      this.listen(btn.root, 'click', () => {
        this.setActiveItem(item.id);
      });

      this._buttons.set(item.id, btn.root);
      (item.bottom ? bottomGroup : topGroup).root.appendChild(btn.root);
    }

    this.element.appendChild(topGroup.root);
    this.element.appendChild(bottomGroup.root);
    this._updateActive();
  }

  setActiveItem(item: ActivityBarItem): void {
    if (this._activeItem !== item) {
      this._activeItem = item;
      this._updateActive();
      this._onDidSelectItem.fire(item);
    }
  }

  private _updateActive(): void {
    for (const [id, btn] of this._buttons) {
      btn.classList.toggle('active', id === this._activeItem);
      btn.setAttribute('aria-selected', String(id === this._activeItem));
    }
  }
}
