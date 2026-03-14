import { Disposable, Emitter } from '@gho-work/base';
import type { Event } from '@gho-work/base';
import { h } from '../dom.js';

export interface ModelData {
  modelName: string;
}

export class ModelItem extends Disposable {
  private readonly _onDidClick = this._register(new Emitter<void>());
  readonly onDidClick: Event<void> = this._onDidClick.event;

  private readonly _labelEl: HTMLElement;
  readonly element: HTMLElement;

  constructor() {
    super();

    const { root, label } = h('span.status-bar-item.sb-model', [
      h('span.sb-model-label@label'),
    ]);

    this.element = root;
    this._labelEl = label;

    this._labelEl.textContent = 'Loading…';

    root.setAttribute('role', 'button');
    root.setAttribute('tabindex', '0');
    root.setAttribute('aria-label', 'Active model');

    root.addEventListener('click', () => this._onDidClick.fire());
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this._onDidClick.fire();
      }
    });
  }

  update(data: ModelData): void {
    this._labelEl.textContent = data.modelName;
    this.element.title = `Model: ${data.modelName}`;
  }
}
