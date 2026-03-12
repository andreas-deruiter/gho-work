import { Emitter } from '@gho-work/base';
import type { Event } from '@gho-work/base';
import { Widget } from '../widget.js';
import { h } from '../dom.js';

export interface CLIToolInfo {
  id: string;
  name: string;
  installed: boolean;
  version?: string;
  authenticated?: boolean;
  installUrl: string;
  authCommand?: string;
}

export class CLIToolListItemWidget extends Widget {
  private _tool: CLIToolInfo;
  private readonly _actionEl: HTMLElement;
  private readonly _versionEl: HTMLElement;

  private readonly _onDidRequestInstall = this._register(new Emitter<string>());
  readonly onDidRequestInstall: Event<string> = this._onDidRequestInstall.event;

  private readonly _onDidRequestAuth = this._register(new Emitter<string>());
  readonly onDidRequestAuth: Event<string> = this._onDidRequestAuth.event;

  constructor(tool: CLIToolInfo) {
    const layout = h('div.cli-tool-list-item', [
      h('div.cli-tool-info', [
        h('span.cli-tool-name@name'),
        h('span.cli-tool-version@version'),
      ]),
      h('div.cli-tool-action@action'),
    ]);
    super(layout.root);
    this._tool = tool;
    this._actionEl = layout.action;
    this._versionEl = layout.version;
    layout.name.textContent = tool.name;
    this.element.setAttribute('tabindex', '0');
    this._renderAction();
  }

  get toolId(): string { return this._tool.id; }

  update(tool: CLIToolInfo): void {
    this._tool = tool;
    this._renderAction();
  }

  setLoading(label: string): void {
    this._clearAction();
    const spinner = document.createElement('span');
    spinner.className = 'cli-tool-spinner';
    spinner.textContent = label;
    this._actionEl.appendChild(spinner);
  }

  showCheckAgain(): void {
    this._clearAction();
    const btn = document.createElement('button');
    btn.className = 'cli-tool-btn';
    btn.textContent = 'Check Again';
    this.listen(btn, 'click', (e) => { e.stopPropagation(); this._onDidRequestInstall.fire(this._tool.id); });
    this._actionEl.appendChild(btn);
  }

  private _renderAction(): void {
    this._clearAction();
    this._versionEl.textContent = this._tool.version ?? '';

    if (this._tool.installed && this._tool.authenticated !== false) {
      const check = document.createElement('span');
      check.className = 'cli-checkmark';
      check.textContent = '\u2713';
      check.setAttribute('aria-label', 'Installed and ready');
      this._actionEl.appendChild(check);
    } else if (this._tool.installed && this._tool.authenticated === false) {
      const btn = document.createElement('button');
      btn.className = 'cli-tool-btn';
      btn.textContent = 'Authenticate';
      this.listen(btn, 'click', (e) => { e.stopPropagation(); this._onDidRequestAuth.fire(this._tool.id); });
      this._actionEl.appendChild(btn);
    } else {
      const btn = document.createElement('button');
      btn.className = 'cli-tool-btn';
      btn.textContent = 'Install';
      this.listen(btn, 'click', (e) => { e.stopPropagation(); this._onDidRequestInstall.fire(this._tool.id); });
      this._actionEl.appendChild(btn);
    }
  }

  private _clearAction(): void {
    while (this._actionEl.firstChild) { this._actionEl.removeChild(this._actionEl.firstChild); }
  }
}
