import { Emitter } from '@gho-work/base';
import type { Event } from '@gho-work/base';
import { Widget } from './widget.js';
import { h } from './dom.js';

export type ActivityBarItem = 'chat' | 'tools' | 'files' | 'settings';

/**
 * Create an SVG icon element for an activity bar item.
 * Icons match the tutorial design spec (24x24 viewBox, stroke-width 2).
 * Uses DOM APIs directly (no innerHTML) to avoid XSS surface.
 */
function createIcon(id: ActivityBarItem): SVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '22');
  svg.setAttribute('height', '22');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.classList.add('activity-bar-icon');

  const STROKE_ATTRS = { stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } as const;

  function setAttrs(el: SVGElement, attrs: Record<string, string>): void {
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, v);
    }
  }

  function makePath(d: string): SVGPathElement {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    setAttrs(p, { ...STROKE_ATTRS });
    return p;
  }

  function makeCircle(cx: string, cy: string, r: string): SVGCircleElement {
    const c = document.createElementNS(NS, 'circle');
    setAttrs(c, { cx, cy, r, ...STROKE_ATTRS });
    return c;
  }

  function makePolyline(points: string): SVGPolylineElement {
    const pl = document.createElementNS(NS, 'polyline');
    setAttrs(pl, { points, ...STROKE_ATTRS });
    return pl;
  }

  switch (id) {
    case 'chat': {
      // Speech bubble (Feather: message-square)
      svg.appendChild(makePath('M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'));
      break;
    }
    case 'tools': {
      // Wrench (Feather: tool)
      svg.appendChild(makePath(
        'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
      ));
      break;
    }
case 'files': {
      // Folder icon (Feather: folder)
      svg.appendChild(makePath('M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'));
      break;
    }
    case 'settings': {
      // Gear (Feather: settings)
      svg.appendChild(makeCircle('12', '12', '3'));
      svg.appendChild(makePath(
        'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
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
      { id: 'tools', label: 'Tool Activity' },
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
