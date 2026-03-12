import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectorDrawerWidget } from './connectorDrawer.js';

function makeIPC() {
  return {
    invoke: vi.fn().mockResolvedValue({ connectors: [], tools: [] }),
    on: vi.fn(),
  };
}

describe('ConnectorDrawerWidget', () => {
  beforeEach(() => { document.body.textContent = ''; });

  it('is hidden by default', () => {
    const w = new ConnectorDrawerWidget(makeIPC() as any);
    document.body.appendChild(w.getDomNode());
    expect(w.getDomNode().classList.contains('drawer-open')).toBe(false);
    w.dispose();
  });

  it('shows when openForConnector called', async () => {
    const ipc = makeIPC();
    ipc.invoke.mockImplementation((ch: string) => {
      if (ch === 'connector:list') return Promise.resolve({ connectors: [{ id: 'c1', name: 'S', status: 'connected', transport: 'stdio', command: 'x', type: 'local_mcp', enabled: true }] });
      if (ch === 'connector:get-tools') return Promise.resolve({ tools: [] });
      return Promise.resolve({});
    });
    const w = new ConnectorDrawerWidget(ipc as any);
    document.body.appendChild(w.getDomNode());
    await w.openForConnector('c1');
    expect(w.getDomNode().classList.contains('drawer-open')).toBe(true);
    w.dispose();
  });

  it('shows when openForNew called', () => {
    const w = new ConnectorDrawerWidget(makeIPC() as any);
    document.body.appendChild(w.getDomNode());
    w.openForNew();
    expect(w.getDomNode().classList.contains('drawer-open')).toBe(true);
    expect(w.getDomNode().querySelector('.config-name-input')).toBeTruthy();
    w.dispose();
  });

  it('closes and fires event on close', () => {
    const w = new ConnectorDrawerWidget(makeIPC() as any);
    document.body.appendChild(w.getDomNode());
    w.openForNew();
    const fn = vi.fn();
    w.onDidClose(fn);
    w.close();
    expect(w.getDomNode().classList.contains('drawer-open')).toBe(false);
    expect(fn).toHaveBeenCalled();
    w.dispose();
  });

  it('has aria-modal and role=dialog', () => {
    const w = new ConnectorDrawerWidget(makeIPC() as any);
    document.body.appendChild(w.getDomNode());
    const drawer = w.getDomNode().querySelector('.connector-drawer-panel');
    expect(drawer?.getAttribute('role')).toBe('dialog');
    expect(drawer?.getAttribute('aria-modal')).toBe('true');
    w.dispose();
  });
});
