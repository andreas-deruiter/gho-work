import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectorSidebarWidget } from './connectorSidebar.js';

function makeIPC(data: Record<string, unknown> = {}) {
  const listeners = new Map<string, Function>();
  return {
    invoke: vi.fn().mockImplementation((ch: string) => {
      if (ch === 'connector:list') return Promise.resolve(data.connectors ?? { connectors: [] });
      if (ch === 'cli:detect-all') return Promise.resolve(data.cliTools ?? { tools: [] });
      return Promise.resolve({});
    }),
    on: vi.fn().mockImplementation((ch: string, cb: Function) => { listeners.set(ch, cb); }),
    _fire: (ch: string, d: unknown) => listeners.get(ch)?.(d),
  };
}

describe('ConnectorSidebarWidget', () => {
  beforeEach(() => { document.body.textContent = ''; });

  it('renders three groups after activate', async () => {
    const ipc = makeIPC();
    const w = new ConnectorSidebarWidget(ipc as any);
    document.body.appendChild(w.getDomNode());
    await w.activate();
    expect(w.getDomNode().querySelector('.connector-group-installed')).toBeTruthy();
    expect(w.getDomNode().querySelector('.connector-group-cli')).toBeTruthy();
    expect(w.getDomNode().querySelector('.connector-add-btn')).toBeTruthy();
    w.dispose();
  });

  it('renders connector items from IPC data', async () => {
    const ipc = makeIPC({
      connectors: { connectors: [
        { id: '1', name: 'A', status: 'connected', type: 'local_mcp', transport: 'stdio', enabled: true },
      ]},
    });
    const w = new ConnectorSidebarWidget(ipc as any);
    document.body.appendChild(w.getDomNode());
    await w.activate();
    expect(w.getDomNode().querySelectorAll('.connector-list-item').length).toBe(1);
    w.dispose();
  });

  it('fires onDidSelectConnector when item clicked', async () => {
    const ipc = makeIPC({
      connectors: { connectors: [
        { id: 'c1', name: 'S', status: 'connected', type: 'local_mcp', transport: 'stdio', enabled: true },
      ]},
    });
    const w = new ConnectorSidebarWidget(ipc as any);
    document.body.appendChild(w.getDomNode());
    await w.activate();
    const fn = vi.fn();
    w.onDidSelectConnector(fn);
    (w.getDomNode().querySelector('.connector-list-item') as HTMLElement).click();
    expect(fn).toHaveBeenCalledWith('c1');
    w.dispose();
  });

  it('fires onDidRequestAddConnector on Add click', async () => {
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

  it('shows empty state when no connectors', async () => {
    const ipc = makeIPC();
    const w = new ConnectorSidebarWidget(ipc as any);
    document.body.appendChild(w.getDomNode());
    await w.activate();
    expect(w.getDomNode().textContent).toContain('No connectors');
    w.dispose();
  });
});
