/**
 * Verification step — checks Copilot subscription, shows user card + models.
 */
import { Emitter } from '@gho-work/base';
import type { IIPCRenderer } from '@gho-work/platform/common';
import { IPC_CHANNELS } from '@gho-work/platform/common';
import type { CopilotCheckResponse } from '@gho-work/platform/common';
import { Widget } from '../widget.js';
import { h } from '../dom.js';

export class VerificationStep extends Widget {
  private readonly _onDidContinue = this._register(new Emitter<void>());
  readonly onDidContinue = this._onDidContinue.event;

  /** Fired when the user wants to sign in with a different account. */
  private readonly _onDidRequestSignOut = this._register(new Emitter<void>());
  readonly onDidRequestSignOut = this._onDidRequestSignOut.event;

  private _contentEl: HTMLElement;

  constructor(container: HTMLElement, private readonly _ipc: IIPCRenderer) {
    super(container);
    this._contentEl = document.createElement('div');
    this._contentEl.className = 'onboarding-verified';
    this.element.appendChild(this._contentEl);
    void this._check();
  }

  private async _check(): Promise<void> {
    this._renderLoading();
    try {
      const result = await this._ipc.invoke(IPC_CHANNELS.ONBOARDING_CHECK_COPILOT) as CopilotCheckResponse;
      if (result.hasSubscription && result.user) {
        this._renderVerified(result);
      } else {
        this._renderNoSubscription(result);
      }
    } catch {
      this._renderNoSubscription({} as CopilotCheckResponse);
    }
  }

  private _clear(): void {
    while (this._contentEl.firstChild) {
      this._contentEl.removeChild(this._contentEl.firstChild);
    }
  }

  private _renderLoading(): void {
    this._clear();
    const content = h('.onb-verified-content', [
      h('.onb-spinner'),
      h('h3@heading'),
    ]);
    content.heading.textContent = 'Verifying Copilot subscription...';
    this._contentEl.appendChild(content.root);
  }

  private _renderVerified(data: CopilotCheckResponse): void {
    this._clear();
    const user = data.user!;
    const initials = (user.name ?? user.githubLogin)
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    const tierLabel: Record<string, string> = {
      free: 'Copilot Free',
      pro: 'Copilot Pro',
      pro_plus: 'Copilot Pro+',
      business: 'Copilot Business',
      enterprise: 'Copilot Enterprise',
    };

    const content = h('.onb-verified-content', [
      h('.onb-user-card', [
        h('.onb-user-avatar@avatar'),
        h('.onb-user-info', [
          h('span.onb-user-name@name'),
          h('span.onb-user-login@login'),
        ]),
        h('span.onb-tier-badge@tier'),
      ]),
    ]);

    content.avatar.textContent = initials;
    content.name.textContent = user.name ?? user.githubLogin;
    content.login.textContent = `@${user.githubLogin}`;
    content.tier.textContent = tierLabel[data.tier ?? 'free'] ?? 'Copilot';

    // Model list — compact scrollable grid
    if (data.models && data.models.length > 0) {
      const modelsSection = h('.onb-models-available', [
        h('h4@heading'),
      ]);
      modelsSection.heading.textContent = `${data.models.length} Models Available`;
      const modelList = h('.onb-model-list');

      for (const model of data.models) {
        const item = h('.onb-model-item', [
          h('span.model-dot.active'),
          h('span.model-name@modelName'),
        ]);
        item.modelName.textContent = model.name;
        modelList.root.appendChild(item.root);
      }

      modelsSection.root.appendChild(modelList.root);
      content.root.appendChild(modelsSection.root);
    }

    const continueBtn = h('button.btn-primary@btn');
    continueBtn.btn.textContent = 'Continue Setup';
    this.listen(continueBtn.btn, 'click', () => this._onDidContinue.fire());
    content.root.appendChild(continueBtn.root);

    this._contentEl.appendChild(content.root);
  }

  private _renderNoSubscription(result: CopilotCheckResponse): void {
    this._clear();
    const content = h('.onb-verified-content', [
      h('h3@heading'),
      h('p@desc'),
    ]);
    content.heading.textContent = 'Copilot Subscription Not Found';

    // Show which account was checked, if available
    if (result.user) {
      const accountInfo = h('.onb-error-account', [
        h('span@label'),
      ]);
      accountInfo.label.textContent = `Checked account: @${result.user.githubLogin}`;
      accountInfo.root.style.marginBottom = '8px';
      accountInfo.root.style.color = 'var(--fg-secondary)';
      content.root.appendChild(accountInfo.root);
    }

    content.desc.textContent = 'GHO Work requires a GitHub Copilot subscription (Free tier works). Please subscribe and try again.';
    content.desc.style.color = 'var(--fg-error)';
    content.desc.style.marginBottom = '8px';

    // Show detailed error if available
    if (result.error) {
      const errorDetail = h('p.onb-error-detail@detail');
      errorDetail.detail.textContent = result.error;
      errorDetail.detail.style.fontSize = '12px';
      errorDetail.detail.style.color = 'var(--fg-secondary)';
      errorDetail.detail.style.marginBottom = '16px';
      errorDetail.detail.style.fontFamily = 'monospace';
      errorDetail.detail.style.whiteSpace = 'pre-wrap';
      errorDetail.detail.style.wordBreak = 'break-word';
      content.root.appendChild(errorDetail.root);
    }

    // Action buttons
    const actions = h('.onb-error-actions');
    actions.root.style.display = 'flex';
    actions.root.style.gap = '8px';

    const checkBtn = h('button.btn-primary@btn');
    checkBtn.btn.textContent = 'Check Again';
    this.listen(checkBtn.btn, 'click', () => void this._check());
    actions.root.appendChild(checkBtn.root);

    const switchBtn = h('button.btn-secondary@btn');
    switchBtn.btn.textContent = 'Use Different Account';
    this.listen(switchBtn.btn, 'click', () => this._onDidRequestSignOut.fire());
    actions.root.appendChild(switchBtn.root);

    content.root.appendChild(actions.root);
    this._contentEl.appendChild(content.root);
  }
}
