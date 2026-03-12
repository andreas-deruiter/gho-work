import { Emitter } from '@gho-work/base';
import type { Event, ConnectorConfig } from '@gho-work/base';
import { Widget } from '../widget.js';
import { h } from '../dom.js';

export type BannerAction = 'reconnect' | 'reauthenticate' | 'restart';

export class StatusBannerWidget extends Widget {
  private readonly _messageEl: HTMLElement;
  private readonly _actionsEl: HTMLElement;
  private _action: BannerAction = 'reconnect';

  private readonly _onDidRequestAction = this._register(new Emitter<BannerAction>());
  readonly onDidRequestAction: Event<BannerAction> = this._onDidRequestAction.event;

  constructor() {
    const layout = h('div.connector-status-banner', [
      h('span.banner-message@message'),
      h('div.banner-actions@actions'),
    ]);
    super(layout.root);
    this._messageEl = layout.message;
    this._actionsEl = layout.actions;
    this.element.style.display = 'none';
  }

  update(status: ConnectorConfig['status'], error?: string): void {
    if (status === 'connected') {
      this.element.style.display = 'none';
      return;
    }
    this.element.style.display = '';
    this.element.className = 'connector-status-banner';

    if (status === 'error') {
      this.element.classList.add('banner-error');
      this._messageEl.textContent = error ?? 'An error occurred';
      const errLower = error?.toLowerCase() ?? '';
      if (errLower.includes('auth')) { this._action = 'reauthenticate'; }
      else if (errLower.includes('crash') || errLower.includes('exit')) { this._action = 'restart'; }
      else { this._action = 'reconnect'; }
    } else {
      this.element.classList.add('banner-warning');
      this._messageEl.textContent = error ?? (status === 'disconnected' ? 'Disconnected' : 'Connecting...');
      this._action = 'reconnect';
    }

    while (this._actionsEl.firstChild) { this._actionsEl.removeChild(this._actionsEl.firstChild); }
    const btn = document.createElement('button');
    btn.className = 'banner-action-btn';
    const labels: Record<BannerAction, string> = { reconnect: 'Reconnect', reauthenticate: 'Re-authenticate', restart: 'Restart' };
    btn.textContent = labels[this._action];
    this.listen(btn, 'click', () => this._onDidRequestAction.fire(this._action));
    this._actionsEl.appendChild(btn);
  }
}
