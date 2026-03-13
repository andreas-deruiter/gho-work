import { Emitter } from '@gho-work/base';
import type { Event, MCPServerStatus } from '@gho-work/base';
import { Widget } from '../widget.js';
import { h } from '../dom.js';

export interface ConnectorListItemData {
  name: string;
  type: 'stdio' | 'http';
  status: MCPServerStatus;
}

export class ConnectorListItemWidget extends Widget {
  private readonly _dotEl: HTMLElement;
  private readonly _actionsEl: HTMLElement;
  private _data: ConnectorListItemData;

  private readonly _onDidRequestConnect = this._register(new Emitter<string>());
  readonly onDidRequestConnect: Event<string> = this._onDidRequestConnect.event;

  private readonly _onDidRequestDisconnect = this._register(new Emitter<string>());
  readonly onDidRequestDisconnect: Event<string> = this._onDidRequestDisconnect.event;

  private readonly _onDidRequestRemove = this._register(new Emitter<string>());
  readonly onDidRequestRemove: Event<string> = this._onDidRequestRemove.event;

  constructor(data: ConnectorListItemData) {
    const layout = h('div.connector-list-item', [
      h('span.connector-status-dot@dot'),
      h('span.connector-list-item-name@name'),
      h('span.connector-transport-badge@badge'),
      h('div.connector-list-item-actions@actions'),
    ]);
    super(layout.root);
    this._data = data;
    this._dotEl = layout.dot;
    this._actionsEl = layout.actions;
    layout.name.textContent = data.name;
    layout.badge.textContent = data.type;
    layout.badge.className = `connector-transport-badge badge-${data.type}`;
    this._updateDot(data.status);
    this._renderActions();

    this.element.setAttribute('role', 'listitem');
    this.element.setAttribute('aria-label', `${data.name}, ${data.type}, ${data.status}`);
  }

  get serverName(): string { return this._data.name; }

  updateStatus(status: MCPServerStatus): void {
    this._data = { ...this._data, status };
    this._updateDot(status);
    this._renderActions();
    this.element.setAttribute('aria-label', `${this._data.name}, ${this._data.type}, ${status}`);
  }

  private _updateDot(status: MCPServerStatus): void {
    this._dotEl.className = `connector-status-dot status-${status}`;
  }

  private _renderActions(): void {
    while (this._actionsEl.firstChild) {
      this._actionsEl.removeChild(this._actionsEl.firstChild);
    }

    if (this._data.status === 'connected') {
      const btn = document.createElement('button');
      btn.className = 'connector-action-btn';
      btn.textContent = 'Disconnect';
      this.listen(btn, 'click', (e) => {
        e.stopPropagation();
        this._onDidRequestDisconnect.fire(this._data.name);
      });
      this._actionsEl.appendChild(btn);
    } else {
      const btn = document.createElement('button');
      btn.className = 'connector-action-btn';
      btn.textContent = 'Connect';
      this.listen(btn, 'click', (e) => {
        e.stopPropagation();
        this._onDidRequestConnect.fire(this._data.name);
      });
      this._actionsEl.appendChild(btn);
    }

    const removeBtn = document.createElement('button');
    removeBtn.className = 'connector-action-btn connector-remove-btn';
    removeBtn.textContent = 'Remove';
    this.listen(removeBtn, 'click', (e) => {
      e.stopPropagation();
      this._onDidRequestRemove.fire(this._data.name);
    });
    this._actionsEl.appendChild(removeBtn);
  }
}
