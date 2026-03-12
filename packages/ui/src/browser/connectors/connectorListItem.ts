import { Emitter } from '@gho-work/base';
import type { Event, ConnectorConfig } from '@gho-work/base';
import { Widget } from '../widget.js';
import { h } from '../dom.js';

export class ConnectorListItemWidget extends Widget {
  private readonly _dotEl: HTMLElement;
  private _config: ConnectorConfig;

  private readonly _onDidClick = this._register(new Emitter<string>());
  readonly onDidClick: Event<string> = this._onDidClick.event;

  constructor(config: ConnectorConfig) {
    const layout = h('div.connector-list-item', [
      h('span.connector-status-dot@dot'),
      h('span.connector-list-item-name@name'),
    ]);
    super(layout.root);
    this._config = config;
    this._dotEl = layout.dot;
    layout.name.textContent = config.name;
    this._updateDot(config.status);

    this.element.setAttribute('tabindex', '0');
    this.element.setAttribute('role', 'button');
    this.element.setAttribute('aria-label', `${config.name}, ${config.status}`);

    this.listen(this.element, 'click', () => this._onDidClick.fire(this._config.id));
    this.listen(this.element, 'keydown', (e) => {
      const key = (e as KeyboardEvent).key;
      if (key === 'Enter' || key === ' ') {
        e.preventDefault();
        this._onDidClick.fire(this._config.id);
      }
    });
  }

  get connectorId(): string { return this._config.id; }

  updateStatus(status: ConnectorConfig['status']): void {
    this._config = { ...this._config, status };
    this._updateDot(status);
    this.element.setAttribute('aria-label', `${this._config.name}, ${status}`);
  }

  setHighlighted(active: boolean): void {
    this.element.classList.toggle('active', active);
  }

  private _updateDot(status: ConnectorConfig['status']): void {
    this._dotEl.className = `connector-status-dot status-${status}`;
  }
}
