import { Disposable, Emitter } from '@gho-work/base';
import type { Event } from '@gho-work/base';
import { h } from '../dom.js';

export type ConnectorStatus = 'connected' | 'disconnected' | 'error' | 'initializing';

export interface ConnectorServer {
  name: string;
  status: ConnectorStatus;
}

export interface ConnectorStatusData {
  servers: ConnectorServer[];
}

export class ConnectorStatusItem extends Disposable {
  private readonly _onDidClick = this._register(new Emitter<void>());
  readonly onDidClick: Event<void> = this._onDidClick.event;

  private readonly _dotEl: HTMLElement;
  private readonly _labelEl: HTMLElement;
  readonly element: HTMLElement;

  constructor() {
    super();

    const { root, dot, label } = h('span.status-bar-item.sb-connectors', [
      h('span.sb-dot@dot'),
      h('span.sb-connectors-label@label'),
    ]);

    this.element = root;
    this._dotEl = dot;
    this._labelEl = label;

    this._labelEl.textContent = '…';

    root.setAttribute('role', 'button');
    root.setAttribute('tabindex', '0');
    root.setAttribute('aria-label', 'Connectors');

    root.addEventListener('click', () => this._onDidClick.fire());
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this._onDidClick.fire();
      }
    });
  }

  update(data: ConnectorStatusData): void {
    const { servers } = data;

    if (servers.length === 0) {
      this.element.style.display = 'none';
      return;
    }

    this.element.style.display = '';

    const count = servers.length;
    const label = count === 1 ? '1 connector' : `${count} connectors`;
    this._labelEl.textContent = label;
    this.element.title = servers.map(s => `${s.name}: ${s.status}`).join('\n');

    const allConnected = servers.every((s) => s.status === 'connected');
    const allDisconnected = servers.every(
      (s) => s.status === 'disconnected' || s.status === 'error',
    );

    this._dotEl.className = 'sb-dot';
    if (allConnected) {
      this._dotEl.classList.add('green');
    } else if (allDisconnected) {
      this._dotEl.classList.add('red');
    } else {
      this._dotEl.classList.add('yellow');
    }
  }
}
