import type { IIPCRenderer } from '@gho-work/platform/common';
import { IPC_CHANNELS } from '@gho-work/platform/common';
import { Widget } from '../widget.js';
import { h } from '../dom.js';

// DTOs — defined locally to avoid pulling in Node.js code from @gho-work/platform
interface MCPServerStatusDTO {
  name: string;
  type: string;       // 'stdio' | 'http'
  connected: boolean;
  error?: string;
  source?: string;    // undefined = user-added, "plugin:<name>" = plugin-managed
}

export class ConnectorsPage extends Widget {
  private readonly _ipc: IIPCRenderer;
  private _servers: MCPServerStatusDTO[] = [];
  private readonly _listEl: HTMLElement;

  constructor(ipc: IIPCRenderer) {
    const layout = h('div.settings-page-connectors', [
      h('h2.settings-page-title@title'),
      h('p.settings-page-subtitle@subtitle'),
      h('div.connector-list@list'),
    ]);
    super(layout.root);
    this._ipc = ipc;

    layout.title.textContent = 'Connectors';
    layout.subtitle.textContent = 'Manage MCP server connections';
    this._listEl = layout.list;

    // Listen for status changes
    const onStatusChanged = () => void this.load();
    this._ipc.on(IPC_CHANNELS.CONNECTOR_STATUS_CHANGED, onStatusChanged);
    this._register({ dispose: () => this._ipc.removeListener(IPC_CHANNELS.CONNECTOR_STATUS_CHANGED, onStatusChanged) });

    const onListChanged = () => void this.load();
    this._ipc.on(IPC_CHANNELS.CONNECTOR_LIST_CHANGED, onListChanged);
    this._register({ dispose: () => this._ipc.removeListener(IPC_CHANNELS.CONNECTOR_LIST_CHANGED, onListChanged) });
  }

  async load(): Promise<void> {
    try {
      const servers = await this._ipc.invoke<MCPServerStatusDTO[]>(IPC_CHANNELS.CONNECTOR_LIST);
      this._servers = servers;
      this._render();
    } catch (err) {
      console.error('[ConnectorsPage] Failed to load:', err);
      this._listEl.textContent = 'Failed to load connectors.';
    }
  }

  private _render(): void {
    // Clear list
    while (this._listEl.firstChild) {
      this._listEl.removeChild(this._listEl.firstChild);
    }

    if (this._servers.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'connector-empty-state';
      empty.textContent = 'No MCP servers configured.';
      this._listEl.appendChild(empty);
      return;
    }

    for (const server of this._servers) {
      const item = this._buildRow(server);
      this._listEl.appendChild(item);
    }
  }

  private _buildRow(server: MCPServerStatusDTO): HTMLElement {
    const item = document.createElement('div');
    item.className = 'connector-item';

    // Info section
    const info = document.createElement('div');
    info.className = 'connector-info';

    const header = document.createElement('div');
    header.className = 'connector-header';

    const nameEl = document.createElement('span');
    nameEl.className = 'connector-name';
    nameEl.textContent = server.name;
    header.appendChild(nameEl);

    const typeBadge = document.createElement('span');
    typeBadge.className = 'connector-type-badge';
    typeBadge.textContent = server.type;
    header.appendChild(typeBadge);

    const statusDot = document.createElement('span');
    statusDot.className = 'connector-status-dot';
    if (server.error) {
      statusDot.dataset['status'] = 'error';
    } else if (server.connected) {
      statusDot.dataset['status'] = 'connected';
    } else {
      statusDot.dataset['status'] = 'disconnected';
    }
    header.appendChild(statusDot);

    if (server.source) {
      const sourceBadge = document.createElement('span');
      sourceBadge.className = 'connector-source-badge';
      sourceBadge.textContent = server.source;
      header.appendChild(sourceBadge);
    }

    info.appendChild(header);

    if (server.error) {
      const errorEl = document.createElement('div');
      errorEl.className = 'connector-error';
      errorEl.textContent = server.error;
      info.appendChild(errorEl);
    }

    item.appendChild(info);

    // Actions section
    const actions = document.createElement('div');
    actions.className = 'connector-actions';

    const connectBtn = document.createElement('button');
    connectBtn.className = 'connector-connect-btn';
    if (server.connected) {
      connectBtn.textContent = 'Disconnect';
      connectBtn.setAttribute('aria-label', `Disconnect ${server.name}`);
      this.listen(connectBtn, 'click', () => void this._disconnect(server.name));
    } else {
      connectBtn.textContent = 'Connect';
      connectBtn.setAttribute('aria-label', `Connect ${server.name}`);
      this.listen(connectBtn, 'click', () => void this._connect(server.name));
    }
    actions.appendChild(connectBtn);

    // Remove button: user-added only (no source)
    if (!server.source) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'connector-remove-btn';
      removeBtn.textContent = 'Remove';
      removeBtn.setAttribute('aria-label', `Remove ${server.name}`);
      this.listen(removeBtn, 'click', () => void this._remove(server.name));
      actions.appendChild(removeBtn);
    } else if (server.source.startsWith('plugin:')) {
      const managedLabel = document.createElement('span');
      managedLabel.className = 'connector-managed-label';
      managedLabel.textContent = 'Managed by plugin';
      actions.appendChild(managedLabel);
    }

    item.appendChild(actions);

    return item;
  }

  private async _connect(name: string): Promise<void> {
    try {
      await this._ipc.invoke(IPC_CHANNELS.CONNECTOR_CONNECT, { name });
    } catch (err) {
      console.error('[ConnectorsPage] Connect failed:', err);
    }
  }

  private async _disconnect(name: string): Promise<void> {
    try {
      await this._ipc.invoke(IPC_CHANNELS.CONNECTOR_DISCONNECT, { name });
    } catch (err) {
      console.error('[ConnectorsPage] Disconnect failed:', err);
    }
  }

  private async _remove(name: string): Promise<void> {
    try {
      await this._ipc.invoke(IPC_CHANNELS.CONNECTOR_REMOVE, { name });
    } catch (err) {
      console.error('[ConnectorsPage] Remove failed:', err);
    }
  }
}
