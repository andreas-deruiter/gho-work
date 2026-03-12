import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatusBannerWidget } from './connectorStatusBanner.js';

describe('StatusBannerWidget', () => {
  beforeEach(() => { document.body.textContent = ''; });

  it('is hidden when status is connected', () => {
    const w = new StatusBannerWidget();
    document.body.appendChild(w.getDomNode());
    w.update('connected');
    expect(w.getDomNode().style.display).toBe('none');
    w.dispose();
  });

  it('shows error banner with message', () => {
    const w = new StatusBannerWidget();
    document.body.appendChild(w.getDomNode());
    w.update('error', 'Connection refused');
    expect(w.getDomNode().style.display).not.toBe('none');
    expect(w.getDomNode().textContent).toContain('Connection refused');
    expect(w.getDomNode().classList.contains('banner-error')).toBe(true);
    w.dispose();
  });

  it('shows Reconnect button for error', () => {
    const w = new StatusBannerWidget();
    document.body.appendChild(w.getDomNode());
    w.update('error', 'Connection failed');
    expect(w.getDomNode().querySelector('.banner-action-btn')?.textContent).toContain('Reconnect');
    w.dispose();
  });

  it('fires onDidRequestAction on button click', () => {
    const w = new StatusBannerWidget();
    document.body.appendChild(w.getDomNode());
    w.update('error', 'fail');
    const fn = vi.fn();
    w.onDidRequestAction(fn);
    (w.getDomNode().querySelector('.banner-action-btn') as HTMLElement).click();
    expect(fn).toHaveBeenCalledWith('reconnect');
    w.dispose();
  });

  it('shows warning banner for disconnected', () => {
    const w = new StatusBannerWidget();
    document.body.appendChild(w.getDomNode());
    w.update('disconnected');
    expect(w.getDomNode().classList.contains('banner-warning')).toBe(true);
    w.dispose();
  });
});
