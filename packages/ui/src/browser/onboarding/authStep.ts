/**
 * Auth step — checks gh CLI, handles login flow with sub-states.
 */
import { Emitter } from '@gho-work/base';
import type { IIPCRenderer, GhLoginEvent } from '@gho-work/platform/common';
import { IPC_CHANNELS } from '@gho-work/platform/common';
import type { GhCheckResponse } from '@gho-work/platform/common';
import { Widget } from '../widget.js';
import { h } from '../dom.js';

type AuthSubState = 'checking' | 'not_installed' | 'not_authed' | 'missing_scope' | 'logging_in' | 'login_failed' | 'success';

export class AuthStep extends Widget {
  private readonly _onDidComplete = this._register(new Emitter<void>());
  readonly onDidComplete = this._onDidComplete.event;

  private _subState: AuthSubState = 'checking';
  private _error?: string;
  private _contentEl: HTMLElement;

  // Login progress tracked from real backend events
  private _deviceCode?: string;
  private _deviceUrl?: string;
  private _browserOpened = false;
  private _authenticated = false;

  constructor(container: HTMLElement, private readonly _ipc: IIPCRenderer) {
    super(container);
    this._contentEl = document.createElement('div');
    this._contentEl.className = 'onboarding-auth';
    this.element.appendChild(this._contentEl);

    // Listen for login progress events from main process
    const onLoginEvent = (event: GhLoginEvent) => {
      if (event.type === 'device_code') {
        this._deviceCode = event.code;
        this._deviceUrl = event.url;
        if (this._subState === 'logging_in') {
          this._render();
        }
      } else if (event.type === 'browser_opened') {
        this._browserOpened = true;
        if (this._subState === 'logging_in') {
          this._render();
        }
      } else if (event.type === 'authenticated') {
        this._authenticated = true;
        if (this._subState === 'logging_in') {
          this._render();
        }
      }
    };
    this._ipc.on(IPC_CHANNELS.ONBOARDING_GH_LOGIN_EVENT, onLoginEvent as (...args: unknown[]) => void);
    this._register({ dispose: () => this._ipc.removeListener(IPC_CHANNELS.ONBOARDING_GH_LOGIN_EVENT, onLoginEvent as (...args: unknown[]) => void) });

    void this._checkGh();
  }

  private async _checkGh(): Promise<void> {
    this._setSubState('checking');
    try {
      const result = await this._ipc.invoke(IPC_CHANNELS.ONBOARDING_CHECK_GH) as GhCheckResponse;
      if (!result.installed) {
        this._setSubState('not_installed');
      } else if (!result.authenticated) {
        this._setSubState('not_authed');
      } else if (!result.hasCopilotScope) {
        this._setSubState('missing_scope');
      } else {
        this._setSubState('success');
        setTimeout(() => this._onDidComplete.fire(), 800);
      }
    } catch {
      this._setSubState('not_installed');
    }
  }

  private _setSubState(state: AuthSubState): void {
    this._subState = state;
    this._render();
  }

  private _render(): void {
    // Clear content
    while (this._contentEl.firstChild) {
      this._contentEl.removeChild(this._contentEl.firstChild);
    }

    const content = h('.onb-auth-content');
    this._contentEl.appendChild(content.root);

    switch (this._subState) {
      case 'checking':
        this._renderChecking(content.root);
        break;
      case 'not_installed':
        this._renderNotInstalled(content.root);
        break;
      case 'not_authed':
      case 'missing_scope':
        this._renderNotAuthed(content.root);
        break;
      case 'logging_in':
        this._renderLoggingIn(content.root);
        break;
      case 'login_failed':
        this._renderLoginFailed(content.root);
        break;
      case 'success':
        this._renderSuccess(content.root);
        break;
    }
  }

  private _renderChecking(parent: HTMLElement): void {
    const spinner = h('.onb-spinner');
    const heading = h('h3');
    heading.root.textContent = 'Checking GitHub CLI...';
    const desc = h('p');
    desc.root.textContent = 'Verifying your GitHub CLI installation and authentication.';
    parent.append(spinner.root, heading.root, desc.root);
  }

  private _renderNotInstalled(parent: HTMLElement): void {
    const heading = h('h3');
    heading.root.textContent = 'GitHub CLI Required';
    const desc = h('p');
    desc.root.textContent = 'GHO Work uses the GitHub CLI (gh) for authentication. Please install it first.';

    const link = document.createElement('a');
    link.href = 'https://cli.github.com';
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Download GitHub CLI';
    link.className = 'btn-primary';
    link.style.display = 'inline-block';
    link.style.marginBottom = '12px';
    link.style.textDecoration = 'none';

    const retryBtn = h('button.btn-text@btn');
    retryBtn.btn.textContent = 'Check again';
    this.listen(retryBtn.btn, 'click', () => void this._checkGh());

    parent.append(heading.root, desc.root, link, retryBtn.root);
  }

  private _renderNotAuthed(parent: HTMLElement): void {
    const heading = h('h3');
    heading.root.textContent = this._subState === 'missing_scope'
      ? 'Copilot Scope Required'
      : 'Sign in with GitHub';
    const desc = h('p');
    desc.root.textContent = this._subState === 'missing_scope'
      ? 'Your GitHub CLI needs the "copilot" scope. Click below to re-authenticate.'
      : 'Click below to sign in via your browser. The GitHub CLI will handle authentication.';

    const loginBtn = h('button.btn-primary.btn-large@btn');
    loginBtn.btn.textContent = 'Sign in with GitHub';
    this.listen(loginBtn.btn, 'click', () => void this._doLogin());

    parent.append(heading.root, desc.root, loginBtn.root);
  }

  private _renderLoggingIn(parent: HTMLElement): void {
    const heading = h('h3');
    heading.root.textContent = 'Signing in with GitHub...';

    // If we have the device code, show it prominently
    if (this._deviceCode) {
      const desc = h('p');
      desc.root.textContent = 'Enter this code on GitHub to complete sign-in:';

      const codeDisplay = h('.onb-device-code@code');
      codeDisplay.code.textContent = this._deviceCode;

      const copyBtn = h('button.btn-text.btn-small@btn');
      copyBtn.btn.textContent = 'Copy code';
      this.listen(copyBtn.btn, 'click', () => {
        void navigator.clipboard.writeText(this._deviceCode!).then(() => {
          copyBtn.btn.textContent = 'Copied!';
          setTimeout(() => { copyBtn.btn.textContent = 'Copy code'; }, 2000);
        });
      });

      // Auth progress steps — driven by real backend events
      const step1Class = this._browserOpened ? '.onb-auth-step.completed' : '.onb-auth-step.active';
      const step2Class = this._authenticated ? '.onb-auth-step.completed' : (this._browserOpened ? '.onb-auth-step.active' : '.onb-auth-step');
      const step3Class = this._authenticated ? '.onb-auth-step.active' : '.onb-auth-step';

      const steps = h('.onb-auth-steps', [
        h(step1Class, [
          h(this._browserOpened ? 'span.step-check' : 'span.step-dot'),
          h('span@label1'),
        ]),
        h(step2Class, [
          h(this._authenticated ? 'span.step-check' : 'span.step-dot'),
          h('span@label2'),
        ]),
        h(step3Class, [
          h('span.step-dot'),
          h('span@label3'),
        ]),
      ]);
      steps.label1.textContent = this._browserOpened ? 'Browser opened' : 'Opening browser...';
      steps.label2.textContent = this._authenticated ? 'Authorized' : 'Authorize GHO Work on GitHub';
      steps.label3.textContent = 'Verify Copilot subscription';

      if (this._browserOpened) {
        const checkEl = steps.root.querySelector('.onb-auth-step.completed .step-check');
        if (checkEl) {
          checkEl.textContent = '\u2713';
        }
      }
      if (this._authenticated) {
        const checkEls = steps.root.querySelectorAll('.onb-auth-step.completed .step-check');
        checkEls.forEach(el => { el.textContent = '\u2713'; });
      }

      const cancelBtn = h('button.btn-text@btn');
      cancelBtn.btn.textContent = 'Cancel';
      this.listen(cancelBtn.btn, 'click', () => this._setSubState(
        this._subState === 'logging_in' ? 'not_authed' : this._subState,
      ));

      parent.append(heading.root, desc.root, codeDisplay.root, copyBtn.root, steps.root, cancelBtn.root);
    } else {
      // Still waiting for device code from backend
      const spinner = h('.onb-spinner');
      const desc = h('p');
      desc.root.textContent = 'Preparing GitHub authentication...';

      const cancelBtn = h('button.btn-text@btn');
      cancelBtn.btn.textContent = 'Cancel';
      this.listen(cancelBtn.btn, 'click', () => this._setSubState(
        this._subState === 'logging_in' ? 'not_authed' : this._subState,
      ));

      parent.append(spinner.root, heading.root, desc.root, cancelBtn.root);
    }
  }

  private _renderLoginFailed(parent: HTMLElement): void {
    const heading = h('h3');
    heading.root.textContent = 'Sign-in Failed';
    const desc = h('p');
    desc.root.textContent = this._error ?? 'Something went wrong during authentication.';
    desc.root.style.color = 'var(--fg-error)';

    const retryBtn = h('button.btn-primary@btn');
    retryBtn.btn.textContent = 'Try Again';
    this.listen(retryBtn.btn, 'click', () => void this._doLogin());

    parent.append(heading.root, desc.root, retryBtn.root);
  }

  private _renderSuccess(parent: HTMLElement): void {
    const check = h('.step-check@icon');
    check.icon.textContent = '\u2713';
    check.icon.style.width = '48px';
    check.icon.style.height = '48px';
    check.icon.style.fontSize = '24px';
    check.icon.style.margin = '0 auto 16px';

    const heading = h('h3');
    heading.root.textContent = 'GitHub CLI Authenticated';

    parent.append(check.root, heading.root);
  }

  private async _doLogin(): Promise<void> {
    // Reset login progress state
    this._deviceCode = undefined;
    this._deviceUrl = undefined;
    this._browserOpened = false;
    this._authenticated = false;

    this._setSubState('logging_in');
    try {
      const result = await this._ipc.invoke(IPC_CHANNELS.ONBOARDING_GH_LOGIN) as { success: boolean; error?: string };
      if (result.success) {
        // Re-check to verify scopes
        await this._checkGh();
      } else {
        this._error = result.error;
        this._setSubState('login_failed');
      }
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
      this._setSubState('login_failed');
    }
  }
}
