import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectorListItemWidget } from './connectorListItem.js';
import type { ConnectorConfig } from '@gho-work/base';

function makeConfig(overrides: Partial<ConnectorConfig> = {}): ConnectorConfig {
  return {
    id: 'test-1',
    type: 'local_mcp',
    name: 'Test Server',
    transport: 'stdio',
    command: 'node',
    enabled: true,
    status: 'connected',
    ...overrides,
  };
}

describe('ConnectorListItemWidget', () => {
  beforeEach(() => { document.body.textContent = ''; });

  it('renders connector name', () => {
    const w = new ConnectorListItemWidget(makeConfig({ name: 'My Server' }));
    document.body.appendChild(w.getDomNode());
    expect(w.getDomNode().textContent).toContain('My Server');
    w.dispose();
  });

  it('renders green dot when connected', () => {
    const w = new ConnectorListItemWidget(makeConfig({ status: 'connected' }));
    document.body.appendChild(w.getDomNode());
    const dot = w.getDomNode().querySelector('.connector-status-dot');
    expect(dot?.classList.contains('status-connected')).toBe(true);
    w.dispose();
  });

  it('renders red dot when error', () => {
    const w = new ConnectorListItemWidget(makeConfig({ status: 'error' }));
    document.body.appendChild(w.getDomNode());
    expect(w.getDomNode().querySelector('.status-error')).toBeTruthy();
    w.dispose();
  });

  it('fires onDidClick with connector id', () => {
    const w = new ConnectorListItemWidget(makeConfig({ id: 'c1' }));
    document.body.appendChild(w.getDomNode());
    const fn = vi.fn();
    w.onDidClick(fn);
    w.getDomNode().click();
    expect(fn).toHaveBeenCalledWith('c1');
    w.dispose();
  });

  it('updateStatus changes dot class', () => {
    const w = new ConnectorListItemWidget(makeConfig({ status: 'connected' }));
    document.body.appendChild(w.getDomNode());
    w.updateStatus('error');
    expect(w.getDomNode().querySelector('.status-error')).toBeTruthy();
    w.dispose();
  });

  it('setHighlighted toggles active class', () => {
    const w = new ConnectorListItemWidget(makeConfig());
    w.setHighlighted(true);
    expect(w.getDomNode().classList.contains('active')).toBe(true);
    w.setHighlighted(false);
    expect(w.getDomNode().classList.contains('active')).toBe(false);
    w.dispose();
  });
});
