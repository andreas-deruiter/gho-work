import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CLIToolListItemWidget } from './cliToolListItem.js';
import type { CLIToolInfo } from './cliToolListItem.js';

function makeTool(overrides: Partial<CLIToolInfo> = {}): CLIToolInfo {
  return {
    id: 'gh', name: 'GitHub CLI', installed: true, version: '2.40.0',
    authenticated: true, installUrl: 'https://cli.github.com', authCommand: 'gh auth login',
    ...overrides,
  };
}

describe('CLIToolListItemWidget', () => {
  beforeEach(() => { document.body.textContent = ''; });

  it('shows checkmark when installed and authenticated', () => {
    const w = new CLIToolListItemWidget(makeTool());
    document.body.appendChild(w.getDomNode());
    expect(w.getDomNode().querySelector('.cli-checkmark')).toBeTruthy();
    w.dispose();
  });

  it('shows Install button when not installed', () => {
    const w = new CLIToolListItemWidget(makeTool({ installed: false, version: undefined }));
    document.body.appendChild(w.getDomNode());
    expect(w.getDomNode().querySelector('button')?.textContent).toContain('Install');
    w.dispose();
  });

  it('shows Authenticate button when installed but not authed', () => {
    const w = new CLIToolListItemWidget(makeTool({ authenticated: false }));
    document.body.appendChild(w.getDomNode());
    expect(w.getDomNode().querySelector('button')?.textContent).toContain('Authenticate');
    w.dispose();
  });

  it('fires onDidRequestInstall on Install click', () => {
    const w = new CLIToolListItemWidget(makeTool({ installed: false }));
    document.body.appendChild(w.getDomNode());
    const fn = vi.fn();
    w.onDidRequestInstall(fn);
    w.getDomNode().querySelector('button')!.click();
    expect(fn).toHaveBeenCalledWith('gh');
    w.dispose();
  });

  it('fires onDidRequestAuth on Authenticate click', () => {
    const w = new CLIToolListItemWidget(makeTool({ authenticated: false }));
    document.body.appendChild(w.getDomNode());
    const fn = vi.fn();
    w.onDidRequestAuth(fn);
    w.getDomNode().querySelector('button')!.click();
    expect(fn).toHaveBeenCalledWith('gh');
    w.dispose();
  });

  it('update() re-renders state', () => {
    const w = new CLIToolListItemWidget(makeTool({ installed: false }));
    document.body.appendChild(w.getDomNode());
    expect(w.getDomNode().querySelector('button')?.textContent).toContain('Install');
    w.update(makeTool({ installed: true, authenticated: true }));
    expect(w.getDomNode().querySelector('.cli-checkmark')).toBeTruthy();
    w.dispose();
  });
});
