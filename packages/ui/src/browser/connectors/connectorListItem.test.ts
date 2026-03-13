import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectorListItemWidget } from './connectorListItem.js';
import type { ConnectorListItemData } from './connectorListItem.js';

function makeData(overrides: Partial<ConnectorListItemData> = {}): ConnectorListItemData {
  return {
    name: 'Test Server',
    type: 'stdio',
    status: 'disconnected',
    ...overrides,
  };
}

describe('ConnectorListItemWidget', () => {
  beforeEach(() => { document.body.textContent = ''; });

  it('renders connector name', () => {
    const w = new ConnectorListItemWidget(makeData({ name: 'My Server' }));
    document.body.appendChild(w.getDomNode());
    expect(w.getDomNode().textContent).toContain('My Server');
    w.dispose();
  });

  it('renders transport type badge', () => {
    const w = new ConnectorListItemWidget(makeData({ type: 'http' }));
    document.body.appendChild(w.getDomNode());
    const badge = w.getDomNode().querySelector('.connector-transport-badge');
    expect(badge?.textContent).toBe('http');
    expect(badge?.classList.contains('badge-http')).toBe(true);
    w.dispose();
  });

  it('renders status dot with correct class', () => {
    const w = new ConnectorListItemWidget(makeData({ status: 'connected' }));
    document.body.appendChild(w.getDomNode());
    const dot = w.getDomNode().querySelector('.connector-status-dot');
    expect(dot?.classList.contains('status-connected')).toBe(true);
    w.dispose();
  });

  it('updateStatus changes the dot class', () => {
    const w = new ConnectorListItemWidget(makeData({ status: 'disconnected' }));
    document.body.appendChild(w.getDomNode());
    w.updateStatus('error');
    const dot = w.getDomNode().querySelector('.connector-status-dot');
    expect(dot?.classList.contains('status-error')).toBe(true);
    w.dispose();
  });

  it('shows Connect button when status is not connected', () => {
    const w = new ConnectorListItemWidget(makeData({ status: 'disconnected' }));
    document.body.appendChild(w.getDomNode());
    const btns = w.getDomNode().querySelectorAll('.connector-action-btn');
    const labels = Array.from(btns).map((b) => b.textContent);
    expect(labels).toContain('Connect');
    expect(labels).not.toContain('Disconnect');
    w.dispose();
  });

  it('shows Disconnect button when status is connected', () => {
    const w = new ConnectorListItemWidget(makeData({ status: 'connected' }));
    document.body.appendChild(w.getDomNode());
    const btns = w.getDomNode().querySelectorAll('.connector-action-btn');
    const labels = Array.from(btns).map((b) => b.textContent);
    expect(labels).toContain('Disconnect');
    expect(labels).not.toContain('Connect');
    w.dispose();
  });

  it('Connect button fires onDidRequestConnect with server name', () => {
    const w = new ConnectorListItemWidget(makeData({ name: 'srv1', status: 'disconnected' }));
    document.body.appendChild(w.getDomNode());
    const fn = vi.fn();
    w.onDidRequestConnect(fn);
    const connectBtn = Array.from(w.getDomNode().querySelectorAll('.connector-action-btn'))
      .find((b) => b.textContent === 'Connect') as HTMLElement;
    connectBtn.click();
    expect(fn).toHaveBeenCalledWith('srv1');
    w.dispose();
  });

  it('Disconnect button fires onDidRequestDisconnect when status is connected', () => {
    const w = new ConnectorListItemWidget(makeData({ name: 'srv2', status: 'connected' }));
    document.body.appendChild(w.getDomNode());
    const fn = vi.fn();
    w.onDidRequestDisconnect(fn);
    const disconnectBtn = Array.from(w.getDomNode().querySelectorAll('.connector-action-btn'))
      .find((b) => b.textContent === 'Disconnect') as HTMLElement;
    disconnectBtn.click();
    expect(fn).toHaveBeenCalledWith('srv2');
    w.dispose();
  });

  it('Remove button fires onDidRequestRemove with server name', () => {
    const w = new ConnectorListItemWidget(makeData({ name: 'srv3' }));
    document.body.appendChild(w.getDomNode());
    const fn = vi.fn();
    w.onDidRequestRemove(fn);
    const removeBtn = Array.from(w.getDomNode().querySelectorAll('.connector-action-btn'))
      .find((b) => b.textContent === 'Remove') as HTMLElement;
    removeBtn.click();
    expect(fn).toHaveBeenCalledWith('srv3');
    w.dispose();
  });

  it('Remove button is always present regardless of status', () => {
    for (const status of ['connected', 'disconnected', 'error', 'initializing'] as const) {
      const w = new ConnectorListItemWidget(makeData({ status }));
      document.body.appendChild(w.getDomNode());
      const removeBtn = Array.from(w.getDomNode().querySelectorAll('.connector-action-btn'))
        .find((b) => b.textContent === 'Remove');
      expect(removeBtn).toBeTruthy();
      w.dispose();
    }
  });
});
