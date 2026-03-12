import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectorConfigFormWidget } from './connectorConfigForm.js';
import type { ConnectorConfig } from '@gho-work/base';

function makeConfig(o: Partial<ConnectorConfig> = {}): ConnectorConfig {
  return { id: 't1', type: 'local_mcp', name: 'Test', transport: 'stdio', command: 'node', args: ['s.js'], enabled: true, status: 'connected', ...o };
}

describe('ConnectorConfigFormWidget', () => {
  beforeEach(() => { document.body.textContent = ''; });

  it('renders read-only for existing connector', () => {
    const w = new ConnectorConfigFormWidget(makeConfig());
    document.body.appendChild(w.getDomNode());
    expect(w.getDomNode().textContent).toContain('Test');
    expect(w.getDomNode().querySelector('.config-edit-btn')).toBeTruthy();
    w.dispose();
  });

  it('renders edit mode for null (new connector)', () => {
    const w = new ConnectorConfigFormWidget(null);
    document.body.appendChild(w.getDomNode());
    expect(w.getDomNode().querySelector('.config-name-input')).toBeTruthy();
    w.dispose();
  });

  it('fires onDidSave with form data', () => {
    const w = new ConnectorConfigFormWidget(null);
    document.body.appendChild(w.getDomNode());
    const fn = vi.fn();
    w.onDidSave(fn);
    (w.getDomNode().querySelector('.config-name-input') as HTMLInputElement).value = 'My Server';
    (w.getDomNode().querySelector('.config-command-input') as HTMLInputElement).value = 'npx srv';
    (w.getDomNode().querySelector('.config-save-btn') as HTMLElement).click();
    expect(fn).toHaveBeenCalled();
    expect(fn.mock.calls[0][0].name).toBe('My Server');
    w.dispose();
  });

  it('fires onDidCancel on Cancel click', () => {
    const w = new ConnectorConfigFormWidget(null);
    document.body.appendChild(w.getDomNode());
    const fn = vi.fn();
    w.onDidCancel(fn);
    (w.getDomNode().querySelector('.config-cancel-btn') as HTMLElement).click();
    expect(fn).toHaveBeenCalled();
    w.dispose();
  });

  it('fires onDidDelete on Remove click (edit mode)', () => {
    const w = new ConnectorConfigFormWidget(makeConfig());
    document.body.appendChild(w.getDomNode());
    (w.getDomNode().querySelector('.config-edit-btn') as HTMLElement).click();
    const fn = vi.fn();
    w.onDidDelete(fn);
    // Note: jsdom doesn't implement window.confirm, it returns false by default
    // We need to stub it
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    (w.getDomNode().querySelector('.config-delete-btn') as HTMLElement).click();
    expect(fn).toHaveBeenCalledWith('t1');
    w.dispose();
  });

  it('toggles advanced section', () => {
    const w = new ConnectorConfigFormWidget(null);
    document.body.appendChild(w.getDomNode());
    const advSection = w.getDomNode().querySelector('.config-advanced') as HTMLElement;
    expect(advSection.style.display).toBe('none');
    (w.getDomNode().querySelector('.config-advanced-toggle') as HTMLElement).click();
    expect(advSection.style.display).not.toBe('none');
    w.dispose();
  });

  it('switches fields for HTTP transport', () => {
    const w = new ConnectorConfigFormWidget(null);
    document.body.appendChild(w.getDomNode());
    (w.getDomNode().querySelector('input[value="streamable_http"]') as HTMLInputElement).click();
    expect(w.getDomNode().querySelector('.config-url-input')).toBeTruthy();
    w.dispose();
  });
});
