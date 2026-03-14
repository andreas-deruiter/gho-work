import { Emitter } from '@gho-work/base';
import type { Event } from '@gho-work/base';
import { Widget } from './widget.js';
import { h } from './dom.js';

export type ActivityBarItem = 'chat' | 'files' | 'settings';

/**
 * Create a 20x20 SVG icon element for an activity bar item.
 * Uses DOM APIs directly (no innerHTML) to avoid XSS surface.
 */
function createIcon(id: ActivityBarItem): SVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('fill', 'none');
  svg.classList.add('activity-bar-icon');

  const STROKE_ATTRS = { stroke: 'currentColor', 'stroke-width': '1.4' } as const;

  function makePath(d: string, extra?: Record<string, string>): SVGPathElement {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    for (const [k, v] of Object.entries({ ...STROKE_ATTRS, ...extra })) {
      p.setAttribute(k, v);
    }
    return p;
  }

  switch (id) {
    case 'chat': {
      // Speech bubble
      svg.appendChild(makePath(
        'M4 4h12a1 1 0 011 1v7a1 1 0 01-1 1h-3.5l-3 3v-3H4a1 1 0 01-1-1V5a1 1 0 011-1z',
        { 'stroke-linejoin': 'round' },
      ));
      break;
    }
    case 'files': {
      // Folder icon (Feather: folder)
      svg.appendChild(makePath('M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'));
      break;
    }
    case 'tools': {
      // Network/activity graph
      svg.appendChild(makePath('M10 3v14', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      svg.appendChild(makePath('M5 6l5-3 5 3', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      svg.appendChild(makePath('M5 14l5 3 5-3', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      svg.appendChild(makePath('M3 10h14', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      break;
    }
    case 'connectors': {
      // Connector hub with center box
      svg.appendChild(makePath(
        'M8 4v3a1 1 0 01-1 1H4M12 4v3a1 1 0 001 1h3M8 16v-3a1 1 0 00-1-1H4M12 16v-3a1 1 0 011-1h3',
        { 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
      ));
      const rect = document.createElementNS(NS, 'rect');
      for (const [k, v] of Object.entries({ x: '7', y: '7', width: '6', height: '6', rx: '1', ...STROKE_ATTRS })) {
        rect.setAttribute(k, v);
      }
      svg.appendChild(rect);
      break;
    }
    case 'documents': {
      // Document with folded corner
      svg.appendChild(makePath(
        'M6 3h5l4 4v10a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z',
        { 'stroke-linejoin': 'round' },
      ));
      svg.appendChild(makePath('M11 3v4h4', { 'stroke-linejoin': 'round' }));
      break;
    }
    case 'settings': {
      // Gear (circle + sun rays)
      const circle = document.createElementNS(NS, 'circle');
      for (const [k, v] of Object.entries({ cx: '10', cy: '10', r: '2.5', ...STROKE_ATTRS })) {
        circle.setAttribute(k, v);
      }
      svg.appendChild(circle);
      svg.appendChild(makePath(
        'M10 3v2M10 15v2M17 10h-2M5 10H3M14.95 5.05l-1.41 1.41M6.46 13.54l-1.41 1.41M14.95 14.95l-1.41-1.41M6.46 6.46L5.05 5.05',
        { 'stroke-linecap': 'round' },
      ));
      break;
    }
  }
  return svg;
}

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
      { id: 'files', label: 'Files' },
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
      btn.root.appendChild(createIcon(item.id));

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
