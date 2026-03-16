import { Widget } from '../widget.js';
import { h, addDisposableListener } from '../dom.js';
import { Emitter } from '@gho-work/base';

export interface CollapsibleSectionOptions {
  defaultCollapsed?: boolean;
}

export class CollapsibleSection extends Widget {
  private _collapsed: boolean;
  private readonly _headerEl: HTMLElement;
  private readonly _bodyEl: HTMLElement;
  private readonly _chevronEl: HTMLElement;
  private readonly _badgeEl: HTMLElement;
  private readonly _titleEl: HTMLElement;

  private readonly _onDidToggle = this._register(new Emitter<boolean>());
  readonly onDidToggle = this._onDidToggle.event;

  constructor(title: string, options?: CollapsibleSectionOptions) {
    const layout = h('section.info-section-container@root', [
      h('div.info-section-header@header', [
        h('span.info-section-chevron@chevron'),
        h('span.info-section-title@title'),
        h('span.info-section-badge@badge'),
      ]),
      h('div.info-section-body@body'),
    ]);

    super(layout.root);

    this._headerEl = layout['header'];
    this._bodyEl = layout['body'];
    this._chevronEl = layout['chevron'];
    this._badgeEl = layout['badge'];
    this._titleEl = layout['title'];

    this._titleEl.textContent = title.toUpperCase();
    this._collapsed = options?.defaultCollapsed ?? false;

    this._updateChevron();
    this._updateBodyVisibility();

    this._register(addDisposableListener(this._headerEl, 'click', () => this.toggle()));
  }

  get isCollapsed(): boolean {
    return this._collapsed;
  }

  get bodyElement(): HTMLElement {
    return this._bodyEl;
  }

  toggle(): void {
    this.setCollapsed(!this._collapsed);
  }

  setCollapsed(collapsed: boolean): void {
    this._collapsed = collapsed;
    this._updateChevron();
    this._updateBodyVisibility();
    this._onDidToggle.fire(collapsed);
  }

  setBadge(text: string): void {
    this._badgeEl.textContent = text;
  }

  setBadgeStyle(style: Partial<CSSStyleDeclaration>): void {
    Object.assign(this._badgeEl.style, style);
  }

  setVisible(visible: boolean): void {
    this.element.style.display = visible ? '' : 'none';
  }

  private _updateChevron(): void {
    this._chevronEl.classList.toggle('info-section-chevron--collapsed', this._collapsed);
  }

  private _updateBodyVisibility(): void {
    this._bodyEl.style.display = this._collapsed ? 'none' : 'block';
  }
}
