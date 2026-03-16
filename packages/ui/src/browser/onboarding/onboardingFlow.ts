/**
 * OnboardingFlow — orchestrates the multi-step onboarding experience.
 * Manages step state machine, creates/disposes step widgets.
 */
import { Disposable, Emitter } from '@gho-work/base';
import type { IIPCRenderer } from '@gho-work/platform/common';
import { IPC_CHANNELS } from '@gho-work/platform/common';
import { WelcomeStep } from './welcomeStep.js';
import { AuthStep } from './authStep.js';
import { VerificationStep } from './verificationStep.js';
import { ConnectorStep } from './connectorStep.js';

type OnboardingStep = 'welcome' | 'auth' | 'verification' | 'connectors';

export class OnboardingFlow extends Disposable {
  private readonly _onDidComplete = this._register(new Emitter<void>());
  readonly onDidComplete = this._onDidComplete.event;

  private readonly _container: HTMLElement;
  private _currentStep: OnboardingStep = 'welcome';
  private _currentWidget: Disposable | null = null;

  constructor(
    parent: HTMLElement,
    private readonly _ipc: IIPCRenderer,
  ) {
    super();
    this._container = document.createElement('div');
    this._container.className = 'onboarding-flow';
    parent.appendChild(this._container);
    this._showStep('welcome');
  }

  private _showStep(step: OnboardingStep): void {
    this._currentStep = step;

    // Dispose previous widget
    if (this._currentWidget) {
      this._currentWidget.dispose();
      this._currentWidget = null;
    }

    // Clear container
    while (this._container.firstChild) {
      this._container.removeChild(this._container.firstChild);
    }

    const stepContainer = document.createElement('div');
    stepContainer.className = 'onboarding-step-container';
    this._container.appendChild(stepContainer);

    switch (step) {
      case 'welcome': {
        const widget = new WelcomeStep(stepContainer);
        widget.onDidClickStart(() => this._showStep('auth'));
        this._currentWidget = widget;
        break;
      }
      case 'auth': {
        const widget = new AuthStep(stepContainer, this._ipc);
        widget.onDidComplete(() => this._showStep('verification'));
        this._currentWidget = widget;
        break;
      }
      case 'verification': {
        const widget = new VerificationStep(stepContainer, this._ipc);
        widget.onDidContinue(() => this._showStep('connectors'));
        widget.onDidRequestSignOut(() => this._showStep('auth'));
        this._currentWidget = widget;
        break;
      }
      case 'connectors': {
        const widget = new ConnectorStep(stepContainer);
        widget.onDidComplete(() => void this._finish());
        this._currentWidget = widget;
        break;
      }
    }
  }

  private async _finish(): Promise<void> {
    try {
      await this._ipc.invoke(IPC_CHANNELS.ONBOARDING_COMPLETE);
    } catch (err) {
      console.warn('[OnboardingFlow] Failed to mark onboarding complete:', err);
    }
    this._onDidComplete.fire();
  }

  override dispose(): void {
    if (this._currentWidget) {
      this._currentWidget.dispose();
      this._currentWidget = null;
    }
    if (this._container.parentNode) {
      this._container.parentNode.removeChild(this._container);
    }
    super.dispose();
  }
}
