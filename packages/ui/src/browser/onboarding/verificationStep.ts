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
        this._renderNoSubscription();
      }
    } catch {
      this._renderNoSubscription();
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

  private _renderNoSubscription(): void {
    this._clear();
    const content = h('.onb-verified-content', [
      h('h3@heading'),
      h('p@desc'),
      h('button.btn-primary@btn'),
    ]);
    content.heading.textContent = 'Copilot Subscription Not Found';
    content.desc.textContent = 'GHO Work requires a GitHub Copilot subscription (Free tier works). Please subscribe and try again.';
    content.desc.style.color = 'var(--fg-error)';
    content.desc.style.marginBottom = '16px';

    content.btn.textContent = 'Check Again';
    this.listen(content.btn, 'click', () => void this._check());

    this._contentEl.appendChild(content.root);
  }
}
