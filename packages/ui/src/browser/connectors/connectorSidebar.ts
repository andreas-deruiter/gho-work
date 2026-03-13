import { Emitter } from '@gho-work/base';
import type { Event, MCPServerStatus } from '@gho-work/base';
import type { IIPCRenderer } from '@gho-work/platform/common';
import { IPC_CHANNELS } from '@gho-work/platform/common';
import { Widget } from '../widget.js';
import { h } from '../dom.js';
import { ConnectorListItemWidget } from './connectorListItem.js';
import type { ConnectorListItemData } from './connectorListItem.js';

export class ConnectorSidebarWidget extends Widget {
  private readonly _listEl: HTMLElement;
  private readonly _items = new Map<string, ConnectorListItemWidget>();

  private readonly _onDidRequestAddConnector = this._register(new Emitter<void>());
  readonly onDidRequestAddConnector: Event<void> = this._onDidRequestAddConnector.event;

  private readonly _onDidRequestConnect = this._register(new Emitter<string>());
  readonly onDidRequestConnect: Event<string> = this._onDidRequestConnect.event;

  private readonly _onDidRequestDisconnect = this._register(new Emitter<string>());
  readonly onDidRequestDisconnect: Event<string> = this._onDidRequestDisconnect.event;

  private readonly _onDidRequestRemove = this._register(new Emitter<string>());
  readonly onDidRequestRemove: Event<string> = this._onDidRequestRemove.event;

  constructor(private readonly _ipc: IIPCRenderer) {
    const layout = h('div.connector-sidebar', [
      h('div.connector-sidebar-header@header'),
      h('div.connector-server-list@list'),
      h('div.connector-sidebar-footer@footer'),
    ]);
    super(layout.root);
    layout.header.textContent = 'Connectors';

    this._listEl = layout.list;

    const addBtn = document.createElement('button');
    addBtn.className = 'connector-add-btn';
    addBtn.textContent = '+ Add Connector';
    this.listen(addBtn, 'click', () => this._onDidRequestAddConnector.fire());
    layout.footer.appendChild(addBtn);

    this._ipc.on(IPC_CHANNELS.CONNECTOR_STATUS_CHANGED, (...args: unknown[]) => {
      const data = args[0] as { name: string; status: MCPServerStatus };
      this._items.get(data.name)?.updateStatus(data.status);
    });

    this._ipc.on(IPC_CHANNELS.CONNECTOR_LIST_CHANGED, () => {
      void this.refresh();
    });
  }

  async activate(): Promise<void> {
    this._listEl.textContent = 'Loading...';
    await this.refresh();
  }

  async refresh(): Promise<void> {
    try {
      const resp = await this._ipc.invoke<{
        servers: ConnectorListItemData[];
      }>(IPC_CHANNELS.CONNECTOR_LIST);
      this._renderServers(resp.servers);
    } catch (err) {
      console.error('Failed to load connectors:', err);
    }
  }

  private _renderServers(servers: ConnectorListItemData[]): void {
    for (const item of this._items.values()) { item.dispose(); }
    this._items.clear();
    while (this._listEl.firstChild) { this._listEl.removeChild(this._listEl.firstChild); }

    if (servers.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'connector-empty';
      empty.textContent = 'No MCP servers configured';
      this._listEl.appendChild(empty);
      return;
    }

    for (const data of servers) {
      const item = this._register(new ConnectorListItemWidget(data));
      item.onDidRequestConnect((name) => this._onDidRequestConnect.fire(name));
      item.onDidRequestDisconnect((name) => this._onDidRequestDisconnect.fire(name));
      item.onDidRequestRemove((name) => this._onDidRequestRemove.fire(name));
      this._items.set(data.name, item);
      this._listEl.appendChild(item.getDomNode());
    }
  }
}
