import { Disposable, Emitter } from '@gho-work/base';
import type { Event } from '@gho-work/base';
import { h } from '../dom.js';

export interface UsageMeterData {
  /** Remaining quota as a fraction 0.0–1.0 */
  remainingPercentage: number;
  visible: boolean;
}

export class UsageMeterItem extends Disposable {
  private readonly _onDidClick = this._register(new Emitter<void>());
  readonly onDidClick: Event<void> = this._onDidClick.event;

  private readonly _barEl: HTMLElement;
  private readonly _fillEl: HTMLElement;
  private readonly _labelEl: HTMLElement;
  readonly element: HTMLElement;

  constructor() {
    super();

    const { root, bar, fill, label } = h('span.status-bar-item.sb-usage', [
      h('span.sb-usage-bar@bar', [
        h('span.sb-usage-fill@fill'),
      ]),
      h('span.sb-usage-label@label'),
    ]);

    this.element = root;
    this._barEl = bar;
    this._fillEl = fill;
    this._labelEl = label;

    // Configure meter ARIA on bar
    this._barEl.setAttribute('role', 'meter');
    this._barEl.setAttribute('aria-valuemin', '0');
    this._barEl.setAttribute('aria-valuemax', '100');
    this._barEl.setAttribute('aria-valuenow', '0');
    this._barEl.setAttribute('aria-label', 'Copilot usage');

    root.setAttribute('role', 'button');
    root.setAttribute('tabindex', '0');

    // Hidden until authenticated
    root.style.display = 'none';

    root.addEventListener('click', () => this._onDidClick.fire());
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this._onDidClick.fire();
      }
    });
  }

  update(data: UsageMeterData): void {
    if (!data.visible) {
      this.element.style.display = 'none';
      return;
    }

    this.element.style.display = '';

    // remainingPercentage may be 0–1 (fraction) or 0–100 (percent) depending on source
    const raw = data.remainingPercentage > 1 ? data.remainingPercentage : data.remainingPercentage * 100;
    const remainingPct = Math.round(Math.min(100, Math.max(0, raw)));
    const usedPct = 100 - remainingPct;

    this._labelEl.textContent = `${remainingPct}%`;
    this._fillEl.style.width = `${usedPct}%`;
    this._barEl.setAttribute('aria-valuenow', String(remainingPct));
    this.element.title = `Copilot quota: ${remainingPct}% remaining`;

    // Visual state classes
    this.element.classList.remove('usage-warning', 'usage-critical');
    if (remainingPct === 0) {
      this.element.classList.add('usage-critical');
    } else if (remainingPct <= 20) {
      this.element.classList.add('usage-warning');
    }
  }
}
