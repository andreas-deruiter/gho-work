import { Disposable } from '@gho-work/base';
import { h, addDisposableListener } from './dom.js';

let collapsibleCounter = 0;

export interface ChatCollapsibleOptions {
  createContent?: (contentEl: HTMLElement) => void;
  startExpanded?: boolean;
  iconClass?: string;
}

export class ChatCollapsible extends Disposable {
  private readonly _root: HTMLElement;
  private readonly _button: HTMLButtonElement;
  private readonly _titleLabel: HTMLElement;
  private readonly _chevron: HTMLElement;
  private readonly _icon: HTMLElement;
  private readonly _contentEl: HTMLElement;
  private _expanded: boolean;
  private _contentInitialized = false;
  private readonly _createContent?: (el: HTMLElement) => void;

  get isExpanded(): boolean {
    return this._expanded;
  }

  constructor(title: string, options?: ChatCollapsibleOptions) {
    super();
    this._createContent = options?.createContent;
    this._expanded = options?.startExpanded ?? false;

    const result = h('div.chat-collapsible.collapsed', [
      h('button.collapsible-button@btn', [
        h('span.collapsible-chevron@chevron'),
        h('span.collapsible-icon@icon'),
        h('span.collapsible-title-label@label'),
      ]),
      h('div.collapsible-content@content'),
    ]);

    this._root = result.root;
    this._button = result['btn'] as HTMLButtonElement;
    this._chevron = result['chevron'];
    this._icon = result['icon'];
    this._titleLabel = result['label'];
    this._contentEl = result['content'];

    const contentId = `collapsible-content-${collapsibleCounter++}`;
    this._contentEl.id = contentId;
    this._contentEl.setAttribute('role', 'region');

    this._titleLabel.textContent = title;
    this._button.setAttribute('aria-expanded', String(this._expanded));
    this._button.setAttribute('aria-label', title);
    this._button.setAttribute('aria-controls', contentId);
    this._contentEl.setAttribute('aria-labelledby', `${contentId}-btn`);
    this._button.id = `${contentId}-btn`;

    if (options?.iconClass) {
      this._icon.className = `collapsible-icon ${options.iconClass}`;
    }

    this._register(addDisposableListener(this._button, 'click', () => {
      this.toggle();
    }));

    if (this._expanded) {
      this._root.classList.remove('collapsed');
      this._initContent();
    }
  }

  toggle(): void {
    this._expanded = !this._expanded;
    this._button.setAttribute('aria-expanded', String(this._expanded));

    if (this._expanded) {
      this._root.classList.remove('collapsed');
      this._initContent();
    } else {
      this._root.classList.add('collapsed');
    }
  }

  setTitle(title: string): void {
    this._titleLabel.textContent = title;
    this._button.setAttribute('aria-label', title);
  }

  setIconClass(cls: string): void {
    this._icon.className = `collapsible-icon ${cls}`;
  }

  appendContent(el: HTMLElement): void {
    this._contentEl.appendChild(el);
  }

  getContentElement(): HTMLElement {
    return this._contentEl;
  }

  getDomNode(): HTMLElement {
    return this._root;
  }

  private _initContent(): void {
    if (this._contentInitialized) {
      return;
    }
    this._contentInitialized = true;
    this._createContent?.(this._contentEl);
  }
}
