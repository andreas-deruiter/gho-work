import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectorSidebarWidget } from './connectorSidebar.js';
import type { ConnectorListItemData } from './connectorListItem.js';

function makeServer(overrides: Partial<ConnectorListItemData> = {}): ConnectorListItemData {
  return {
    name: 'Test Server',
    type: 'stdio',
    status: 'disconnected',
    ...overrides,
  };
}

function makeIPC(servers: ConnectorListItemData[] = []) {
  const listeners = new Map<string, Function>();
  return {
    invoke: vi.fn().mockImplementation((ch: string) => {
      if (ch === 'connector:list') return Promise.resolve({ servers });
      return Promise.resolve({});
    }),
    on: vi.fn().mockImplementation((ch: string, cb: Function) => {
      listeners.set(ch, cb);
    }),
    _fire: (ch: string, d: unknown) => listeners.get(ch)?.(d),
  };
}

describe('ConnectorSidebarWidget', () => {
  beforeEach(() => { document.body.textContent = ''; });

  it('renders Add Connector button', () => {
    const ipc = makeIPC();
    const w = new ConnectorSidebarWidget(ipc as any);
    document.body.appendChild(w.getDomNode());
    expect(w.getDomNode().querySelector('.connector-add-btn')).toBeTruthy();
    w.dispose();
  });

  it('Add button fires onDidRequestAddConnector', async () => {
    const ipc = makeIPC();
    const w = new ConnectorSidebarWidget(ipc as any);
    document.body.appendChild(w.getDomNode());
    await w.activate();
    const fn = vi.fn();
    w.onDidRequestAddConnector(fn);
    (w.getDomNode().querySelector('.connector-add-btn') as HTMLElement).click();
    expect(fn).toHaveBeenCalled();
    w.dispose();
  });

  it('refresh() calls IPC and renders server items', async () => {
    const servers = [
      makeServer({ name: 'Alpha', type: 'stdio', status: 'connected' }),
      makeServer({ name: 'Beta', type: 'http', status: 'disconnected' }),
    ];
    const ipc = makeIPC(servers);
    const w = new ConnectorSidebarWidget(ipc as any);
    document.body.appendChild(w.getDomNode());
    await w.activate();
    expect(ipc.invoke).toHaveBeenCalledWith('connector:list');
    const items = w.getDomNode().querySelectorAll('.connector-list-item');
    expect(items.length).toBe(2);
    w.dispose();
  });

  it('server names are rendered in items', async () => {
    const ipc = makeIPC([makeServer({ name: 'MyServer' })]);
    const w = new ConnectorSidebarWidget(ipc as any);
    document.body.appendChild(w.getDomNode());
    await w.activate();
    expect(w.getDomNode().textContent).toContain('MyServer');
    w.dispose();
  });

  it('status updates propagate to items via IPC event', async () => {
    const ipc = makeIPC([makeServer({ name: 'SrvA', status: 'disconnected' })]);
    const w = new ConnectorSidebarWidget(ipc as any);
    document.body.appendChild(w.getDomNode());
    await w.activate();

    // Verify initial state shows Connect button
    const itemEl = w.getDomNode().querySelector('.connector-list-item') as HTMLElement;
    expect(itemEl.textContent).toContain('Connect');

    // Fire status change event
    ipc._fire('connector:status-changed', { name: 'SrvA', status: 'connected' });

    // Should now show Disconnect button
    expect(itemEl.textContent).toContain('Disconnect');
    w.dispose();
  });

  it('empty state shows message when no servers', async () => {
    const ipc = makeIPC([]);
    const w = new ConnectorSidebarWidget(ipc as any);
    document.body.appendChild(w.getDomNode());
    await w.activate();
    const empty = w.getDomNode().querySelector('.connector-empty');
    expect(empty).toBeTruthy();
    expect(empty?.textContent).toContain('No MCP servers configured');
    w.dispose();
  });

  it('fires onDidRequestConnect when item Connect is clicked', async () => {
    const ipc = makeIPC([makeServer({ name: 'SrvConnect', status: 'disconnected' })]);
    const w = new ConnectorSidebarWidget(ipc as any);
    document.body.appendChild(w.getDomNode());
    await w.activate();
    const fn = vi.fn();
    w.onDidRequestConnect(fn);
    const connectBtn = Array.from(w.getDomNode().querySelectorAll('.connector-action-btn'))
      .find((b) => b.textContent === 'Connect') as HTMLElement;
    connectBtn.click();
    expect(fn).toHaveBeenCalledWith('SrvConnect');
    w.dispose();
  });

  it('fires onDidRequestDisconnect when item Disconnect is clicked', async () => {
    const ipc = makeIPC([makeServer({ name: 'SrvDisc', status: 'connected' })]);
    const w = new ConnectorSidebarWidget(ipc as any);
    document.body.appendChild(w.getDomNode());
    await w.activate();
    const fn = vi.fn();
    w.onDidRequestDisconnect(fn);
    const disconnectBtn = Array.from(w.getDomNode().querySelectorAll('.connector-action-btn'))
      .find((b) => b.textContent === 'Disconnect') as HTMLElement;
    disconnectBtn.click();
    expect(fn).toHaveBeenCalledWith('SrvDisc');
    w.dispose();
  });

  it('fires onDidRequestRemove when item Remove is clicked', async () => {
    const ipc = makeIPC([makeServer({ name: 'SrvRm' })]);
    const w = new ConnectorSidebarWidget(ipc as any);
    document.body.appendChild(w.getDomNode());
    await w.activate();
    const fn = vi.fn();
    w.onDidRequestRemove(fn);
    const removeBtn = Array.from(w.getDomNode().querySelectorAll('.connector-action-btn'))
      .find((b) => b.textContent === 'Remove') as HTMLElement;
    removeBtn.click();
    expect(fn).toHaveBeenCalledWith('SrvRm');
    w.dispose();
  });

  it('CONNECTOR_LIST_CHANGED event triggers refresh', async () => {
    const ipc = makeIPC([]);
    const w = new ConnectorSidebarWidget(ipc as any);
    document.body.appendChild(w.getDomNode());
    await w.activate();

    // Initial invoke count
    const initialCallCount = (ipc.invoke as ReturnType<typeof vi.fn>).mock.calls.length;

    // Fire list changed event
    ipc._fire('connector:list-changed', undefined);

    // Allow microtask queue to flush
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect((ipc.invoke as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(initialCallCount);
    w.dispose();
  });
});
