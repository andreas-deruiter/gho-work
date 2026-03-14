import { Disposable, Emitter } from '@gho-work/base';
import type { Event } from '@gho-work/base';
import { h } from '../dom.js';
import { createFolderIcon } from './icons.js';

export interface WorkspaceData {
  path: string | null;
}

export class WorkspaceItem extends Disposable {
  private readonly _onDidClick = this._register(new Emitter<void>());
  readonly onDidClick: Event<void> = this._onDidClick.event;

  private readonly _labelEl: HTMLElement;
  readonly element: HTMLElement;

  constructor() {
    super();

    const { root, label } = h('span.status-bar-item.sb-workspace', [
      h('span.sb-workspace-icon'),
      h('span.sb-workspace-label@label'),
    ]);

    this.element = root;
    this._labelEl = label;

    // Insert folder icon into icon span
    const iconSpan = root.querySelector('.sb-workspace-icon')!;
    iconSpan.appendChild(createFolderIcon());

    this._labelEl.textContent = 'Loading…';

    root.setAttribute('role', 'button');
    root.setAttribute('tabindex', '0');
    root.setAttribute('aria-label', 'Workspace');

    this._register({ dispose: () => {} });

    root.addEventListener('click', () => this._onDidClick.fire());
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this._onDidClick.fire();
      }
    });
  }

  update(data: WorkspaceData): void {
    if (data.path === null) {
      this._labelEl.textContent = 'No workspace';
      this.element.removeAttribute('title');
      return;
    }

    this.element.setAttribute('title', data.path);
    this._labelEl.textContent = this._shortenPath(data.path);
  }

  private _shortenPath(path: string): string {
    const home = (typeof process !== 'undefined' && process.env.HOME) ? process.env.HOME : '';
    if (home && path.startsWith(home)) {
      return '~' + path.slice(home.length);
    }

    const parts = path.split('/').filter(Boolean);
    if (parts.length <= 2) {
      return path;
    }
    return '…/' + parts.slice(-2).join('/');
  }
}
