import { Emitter } from '@gho-work/base';
import type { Event, ConnectorConfig } from '@gho-work/base';
import type { IIPCRenderer } from '@gho-work/platform/common';
import { IPC_CHANNELS } from '@gho-work/platform/common';
import { Widget } from '../widget.js';
import { h } from '../dom.js';
import { ConnectorListItemWidget } from './connectorListItem.js';
import { CLIToolListItemWidget } from './cliToolListItem.js';
import type { CLIToolInfo } from './cliToolListItem.js';

export class ConnectorSidebarWidget extends Widget {
  private readonly _installedEl: HTMLElement;
  private readonly _cliEl: HTMLElement;
  private readonly _items = new Map<string, ConnectorListItemWidget>();
  private readonly _cliItems = new Map<string, CLIToolListItemWidget>();

  private readonly _onDidSelectConnector = this._register(new Emitter<string>());
  readonly onDidSelectConnector: Event<string> = this._onDidSelectConnector.event;

  private readonly _onDidRequestAddConnector = this._register(new Emitter<void>());
  readonly onDidRequestAddConnector: Event<void> = this._onDidRequestAddConnector.event;

  private readonly _onDidRequestInstallCLI = this._register(new Emitter<string>());
  readonly onDidRequestInstallCLI: Event<string> = this._onDidRequestInstallCLI.event;

  private readonly _onDidRequestAuthCLI = this._register(new Emitter<string>());
  readonly onDidRequestAuthCLI: Event<string> = this._onDidRequestAuthCLI.event;

  constructor(private readonly _ipc: IIPCRenderer) {
    const layout = h('div.connector-sidebar', [
      h('div.connector-sidebar-header@header'),
      h('div.connector-group-installed@installed'),
      h('div.connector-group-cli@cli'),
      h('div.connector-sidebar-footer@footer'),
    ]);
    super(layout.root);
    layout.header.textContent = 'Connectors';

    this._installedEl = layout.installed;
    this._cliEl = layout.cli;

    const addBtn = document.createElement('button');
    addBtn.className = 'connector-add-btn';
    addBtn.textContent = '+ Add Connector';
    this.listen(addBtn, 'click', () => this._onDidRequestAddConnector.fire());
    layout.footer.appendChild(addBtn);

    // Listen for status push events
    this._ipc.on(IPC_CHANNELS.CONNECTOR_STATUS_CHANGED, (...args: unknown[]) => {
      const data = args[0] as { id: string; status: ConnectorConfig['status'] };
      this._items.get(data.id)?.updateStatus(data.status);
    });

    // Listen for connector list changes (e.g., after programmatic add/remove)
    this._ipc.on(IPC_CHANNELS.CONNECTOR_LIST_CHANGED, () => {
      void this.refreshConnectors();
    });

    // Listen for CLI tool changes (e.g., after background auth completes)
    this._ipc.on(IPC_CHANNELS.CLI_TOOLS_CHANGED, () => {
      void this.refreshCLITools();
    });
  }

  async activate(): Promise<void> {
    this._installedEl.textContent = 'Loading...';
    this._cliEl.textContent = 'Loading...';
    await Promise.all([this._loadConnectors(), this._loadCLITools()]);
  }

  highlightConnector(id: string | null): void {
    for (const [cid, item] of this._items) { item.setHighlighted(cid === id); }
  }

  async refreshCLITools(): Promise<void> { await this._loadCLITools(); }
  async refreshConnectors(): Promise<void> { await this._loadConnectors(); }

  setCLIToolLoading(toolId: string, label: string): void {
    this._cliItems.get(toolId)?.setLoading(label);
  }

  showCLIToolCheckAgain(toolId: string): void {
    this._cliItems.get(toolId)?.showCheckAgain();
  }

  isCLIToolInstalled(toolId: string): boolean {
    const item = this._cliItems.get(toolId);
    if (!item) { return false; }
    return !!item.getDomNode().querySelector('.cli-checkmark') || !!item.getDomNode().querySelector('button')?.textContent?.includes('Authenticate');
  }

  private async _loadConnectors(): Promise<void> {
    try {
      const resp = await this._ipc.invoke<{ connectors: ConnectorConfig[] }>(IPC_CHANNELS.CONNECTOR_LIST);
      this._renderConnectors(resp.connectors);
    } catch (err) { console.error('Failed to load connectors:', err); }
  }

  private _renderConnectors(connectors: ConnectorConfig[]): void {
    for (const item of this._items.values()) { item.dispose(); }
    this._items.clear();
    while (this._installedEl.firstChild) { this._installedEl.removeChild(this._installedEl.firstChild); }

    const label = document.createElement('div');
    label.className = 'connector-group-label';
    label.textContent = 'Installed Connectors';
    this._installedEl.appendChild(label);

    if (connectors.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'connector-empty';
      empty.textContent = 'No connectors configured';
      this._installedEl.appendChild(empty);
      return;
    }

    for (const config of connectors) {
      const item = this._register(new ConnectorListItemWidget(config));
      item.onDidClick((id) => this._onDidSelectConnector.fire(id));
      this._items.set(config.id, item);
      this._installedEl.appendChild(item.getDomNode());
    }
  }

  private async _loadCLITools(): Promise<void> {
    try {
      const resp = await this._ipc.invoke<{ tools: CLIToolInfo[] }>(IPC_CHANNELS.CLI_DETECT_ALL);
      this._renderCLITools(resp.tools);
    } catch (err) { console.error('Failed to detect CLI tools:', err); }
  }

  private _renderCLITools(tools: CLIToolInfo[]): void {
    for (const item of this._cliItems.values()) { item.dispose(); }
    this._cliItems.clear();
    while (this._cliEl.firstChild) { this._cliEl.removeChild(this._cliEl.firstChild); }

    const label = document.createElement('div');
    label.className = 'connector-group-label';
    label.textContent = 'CLI Tools';
    this._cliEl.appendChild(label);

    for (const tool of tools) {
      const item = this._register(new CLIToolListItemWidget(tool));
      item.onDidRequestInstall((id) => this._onDidRequestInstallCLI.fire(id));
      item.onDidRequestAuth((id) => this._onDidRequestAuthCLI.fire(id));
      this._cliItems.set(tool.id, item);
      this._cliEl.appendChild(item.getDomNode());
    }
  }
}
