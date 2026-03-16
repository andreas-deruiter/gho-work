import { CollapsibleSection } from './collapsibleSection.js';
import { h } from '../dom.js';

export interface UsageData {
  used: number;
  total: number;
  remainingPercentage: number;
  resetDate?: string;
}

export class UsageSection extends CollapsibleSection {
  private readonly _barFill: HTMLElement;
  private readonly _requestsEl: HTMLElement;
  private readonly _resetEl: HTMLElement;
  private _latestData: UsageData | null = null;

  constructor() {
    super('Usage', { defaultCollapsed: true });
    this.setVisible(false);

    const barLayout = h('div.info-usage-bar-track@track', [
      h('div.info-usage-bar-fill@fill'),
    ]);
    this._barFill = barLayout['fill'];

    const footerLayout = h('div.info-usage-footer@footer', [
      h('span.info-usage-requests@requests'),
      h('span.info-usage-reset@reset'),
    ]);
    this._requestsEl = footerLayout['requests'];
    this._resetEl = footerLayout['reset'];

    this.bodyElement.appendChild(barLayout.root);
    this.bodyElement.appendChild(footerLayout.root);
  }

  update(data: UsageData): void {
    this._latestData = data;
    // Use server-provided remainingPercentage to avoid rounding mismatches
    const usedPct = 100 - data.remainingPercentage;

    this._barFill.style.width = `${usedPct}%`;
    this._requestsEl.textContent = `${data.used.toLocaleString('en-US')} / ${data.total.toLocaleString('en-US')} requests`;

    if (data.resetDate) {
      const date = new Date(data.resetDate);
      const formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      this._resetEl.textContent = `Resets ${formatted}`;
    } else {
      this._resetEl.textContent = '';
    }

    this.setBadge(`${usedPct}%`);
    this.setVisible(true);
  }

  getLatestData(): UsageData | null {
    return this._latestData;
  }
}
