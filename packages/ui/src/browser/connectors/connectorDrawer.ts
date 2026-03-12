import { Emitter, DisposableStore } from '@gho-work/base';
import type { Event, ConnectorConfig } from '@gho-work/base';
import type { IIPCRenderer } from '@gho-work/platform/common';
import { IPC_CHANNELS } from '@gho-work/platform/common';
import { Widget } from '../widget.js';
import { h } from '../dom.js';
import { StatusBannerWidget } from './connectorStatusBanner.js';
import { ToolListSectionWidget } from './toolListSection.js';
import type { ToolGroup, ToolToggleEvent } from './toolListSection.js';
import { ConnectorConfigFormWidget } from './connectorConfigForm.js';
import type { ConnectorFormData } from './connectorConfigForm.js';

export class ConnectorDrawerWidget extends Widget {
  private readonly _backdropEl: HTMLElement;
  private readonly _panelEl: HTMLElement;
  private readonly _headerTitleEl: HTMLElement;
  private readonly _bodyEl: HTMLElement;
  private readonly _closeBtnEl: HTMLElement;

  private readonly _contentStore = this._register(new DisposableStore());
  private _banner: StatusBannerWidget | null = null;
  private _toolList: ToolListSectionWidget | null = null;
  private _configForm: ConnectorConfigFormWidget | null = null;
  private _currentConnectorId: string | null = null;
  private _triggerElement: HTMLElement | null = null;

  private readonly _onDidClose = this._register(new Emitter<void>());
  readonly onDidClose: Event<void> = this._onDidClose.event;

  private readonly _onDidSaveConnector = this._register(new Emitter<ConnectorFormData>());
  readonly onDidSaveConnector: Event<ConnectorFormData> = this._onDidSaveConnector.event;

  private readonly _onDidDeleteConnector = this._register(new Emitter<string>());
  readonly onDidDeleteConnector: Event<string> = this._onDidDeleteConnector.event;

  constructor(private readonly _ipc: IIPCRenderer) {
    const layout = h('div.connector-drawer-container', [
      h('div.connector-drawer-backdrop@backdrop'),
      h('div.connector-drawer-panel@panel', [
        h('div.connector-drawer-header@header', [
          h('span.connector-drawer-title@title'),
          h('button.connector-drawer-close@closeBtn'),
        ]),
        h('div.connector-drawer-body@body'),
      ]),
    ]);
    super(layout.root);
    this._backdropEl = layout.backdrop;
    this._panelEl = layout.panel;
    this._headerTitleEl = layout.title;
    this._bodyEl = layout.body;
    this._closeBtnEl = layout.closeBtn;

    this._closeBtnEl.textContent = '\u00D7';
    this._closeBtnEl.setAttribute('aria-label', 'Close drawer');
    this._panelEl.setAttribute('role', 'dialog');
    this._panelEl.setAttribute('aria-modal', 'true');
    this._panelEl.setAttribute('aria-labelledby', 'drawer-title');
    this._headerTitleEl.id = 'drawer-title';

    this.listen(this._backdropEl, 'click', () => this.close());
    this.listen(this._closeBtnEl, 'click', () => this.close());
    this.listen(this.element, 'keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Escape') { this.close(); }
    });

    // Focus trap (registered once, always active when drawer is open)
    this.listen(this._panelEl, 'keydown', (e) => {
      const ke = e as KeyboardEvent;
      if (ke.key !== 'Tab') { return; }
      const focusable = this._panelEl.querySelectorAll('button, input, textarea, [tabindex]:not([tabindex="-1"])') as NodeListOf<HTMLElement>;
      if (focusable.length === 0) { return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (ke.shiftKey && document.activeElement === first) {
        ke.preventDefault(); last.focus();
      } else if (!ke.shiftKey && document.activeElement === last) {
        ke.preventDefault(); first.focus();
      }
    });

    // Listen for status changes to update banner
    this._ipc.on(IPC_CHANNELS.CONNECTOR_STATUS_CHANGED, (...args: unknown[]) => {
      const data = args[0] as { id: string; status: ConnectorConfig['status']; error?: string };
      if (data.id === this._currentConnectorId && this._banner) {
        this._banner.update(data.status, data.error);
      }
    });
  }

  async openForConnector(connectorId: string): Promise<void> {
    this._currentConnectorId = connectorId;
    this._triggerElement = document.activeElement as HTMLElement | null;
    this._clearBody();

    // Load connector data
    const listResp = await this._ipc.invoke<{ connectors: ConnectorConfig[] }>(IPC_CHANNELS.CONNECTOR_LIST);
    const connector = listResp.connectors.find(c => c.id === connectorId);
    if (!connector) { return; }

    this._headerTitleEl.textContent = connector.name;

    // Status banner
    this._banner = this._contentStore.add(new StatusBannerWidget());
    this._banner.update(connector.status, connector.error);
    this._banner.onDidRequestAction(async (action) => {
      if (action === 'reconnect' || action === 'restart') {
        await this._ipc.invoke(IPC_CHANNELS.CONNECTOR_TEST, { id: connectorId });
      } else if (action === 'reauthenticate') {
        await this._ipc.invoke(IPC_CHANNELS.CONNECTOR_UPDATE, { id: connectorId, updates: { enabled: true } });
      }
    });
    this._bodyEl.appendChild(this._banner.getDomNode());

    // Connected status line with Disconnect and Test buttons
    const statusLine = document.createElement('div');
    statusLine.className = 'drawer-status-line';
    const dot = document.createElement('span');
    dot.className = `connector-status-dot status-${connector.status}`;
    statusLine.appendChild(dot);
    const text = document.createElement('span');
    text.textContent = connector.status === 'connected' ? 'Connected' : connector.status;
    statusLine.appendChild(text);

    const statusBtns = document.createElement('div');
    statusBtns.className = 'drawer-status-btns';
    if (connector.status === 'connected') {
      const disconnBtn = document.createElement('button');
      disconnBtn.className = 'drawer-status-btn';
      disconnBtn.textContent = 'Disconnect';
      this.listen(disconnBtn, 'click', async () => {
        await this._ipc.invoke(IPC_CHANNELS.CONNECTOR_UPDATE, { id: connectorId, updates: { enabled: false } });
      });
      statusBtns.appendChild(disconnBtn);
    } else {
      const connBtn = document.createElement('button');
      connBtn.className = 'drawer-status-btn';
      connBtn.textContent = 'Connect';
      this.listen(connBtn, 'click', async () => {
        await this._ipc.invoke(IPC_CHANNELS.CONNECTOR_UPDATE, { id: connectorId, updates: { enabled: true } });
      });
      statusBtns.appendChild(connBtn);
    }
    const testBtn = document.createElement('button');
    testBtn.className = 'drawer-status-btn';
    testBtn.textContent = 'Test Connection';
    this.listen(testBtn, 'click', async () => {
      await this._ipc.invoke(IPC_CHANNELS.CONNECTOR_TEST, { id: connectorId });
    });
    statusBtns.appendChild(testBtn);
    statusLine.appendChild(statusBtns);
    this._bodyEl.appendChild(statusLine);

    // Tool list (show loading, then populate)
    this._toolList = this._contentStore.add(new ToolListSectionWidget());
    const loadingEl = document.createElement('div');
    loadingEl.className = 'tool-list-loading';
    loadingEl.textContent = 'Loading tools...';
    this._bodyEl.appendChild(loadingEl);
    await this._loadTools(connectorId);
    loadingEl.remove();
    this._toolList.onDidToggleTool((ev) => this._handleToolToggle(ev));
    this._bodyEl.appendChild(this._toolList.getDomNode());

    // Config form (read-only)
    this._configForm = this._contentStore.add(new ConnectorConfigFormWidget(connector));
    this._configForm.onDidSave((data) => this._onDidSaveConnector.fire(data));
    this._configForm.onDidDelete((id) => this._onDidDeleteConnector.fire(id));
    this._configForm.onDidCancel(() => {});
    this._bodyEl.appendChild(this._configForm.getDomNode());

    this._show();
  }

  openForNew(): void {
    this._currentConnectorId = null;
    this._triggerElement = document.activeElement as HTMLElement | null;
    this._clearBody();
    this._headerTitleEl.textContent = 'Add Connector';

    this._configForm = this._contentStore.add(new ConnectorConfigFormWidget(null));
    this._configForm.onDidSave((data) => this._onDidSaveConnector.fire(data));
    this._configForm.onDidCancel(() => this.close());
    this._bodyEl.appendChild(this._configForm.getDomNode());

    this._show();
  }

  close(): void {
    this.element.classList.remove('drawer-open');
    this._currentConnectorId = null;
    this._onDidClose.fire();
    if (this._triggerElement) {
      this._triggerElement.focus();
      this._triggerElement = null;
    }
  }

  private _show(): void {
    this.element.classList.add('drawer-open');
    // Focus first focusable element in drawer
    const firstFocusable = this._panelEl.querySelector('button, input, [tabindex]') as HTMLElement | null;
    firstFocusable?.focus();
  }

  private async _loadTools(focusConnectorId: string): Promise<void> {
    if (!this._toolList) { return; }
    try {
      const listResp = await this._ipc.invoke<{ connectors: ConnectorConfig[] }>(IPC_CHANNELS.CONNECTOR_LIST);
      const groups: ToolGroup[] = [];
      for (const c of listResp.connectors) {
        if (c.status !== 'connected') { continue; }
        try {
          const toolResp = await this._ipc.invoke<{ tools: Array<{ name: string; description: string; enabled: boolean }> }>(
            IPC_CHANNELS.CONNECTOR_GET_TOOLS, { id: c.id }
          );
          groups.push({ connectorId: c.id, connectorName: c.name, tools: toolResp.tools });
        } catch { /* skip */ }
      }
      this._toolList.setTools(groups, focusConnectorId);
    } catch (err) { console.error('Failed to load tools:', err); }
  }

  private async _handleToolToggle(ev: ToolToggleEvent): Promise<void> {
    try {
      // Build updated toolsConfig
      const listResp = await this._ipc.invoke<{ connectors: ConnectorConfig[] }>(IPC_CHANNELS.CONNECTOR_LIST);
      const connector = listResp.connectors.find(c => c.id === ev.connectorId);
      const toolsConfig = { ...(connector?.toolsConfig ?? {}), [ev.toolName]: ev.enabled };
      await this._ipc.invoke(IPC_CHANNELS.CONNECTOR_UPDATE, { id: ev.connectorId, updates: { toolsConfig } });
    } catch {
      // Revert on failure
      this._toolList?.revertToolToggle(ev.connectorId, ev.toolName, !ev.enabled);
    }
  }

  private _clearBody(): void {
    this._contentStore.clear();
    this._banner = null;
    this._toolList = null;
    this._configForm = null;
    while (this._bodyEl.firstChild) { this._bodyEl.removeChild(this._bodyEl.firstChild); }
  }
}
