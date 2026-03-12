/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IIPCRenderer } from '@gho-work/platform/common';
import { IPC_CHANNELS } from '@gho-work/platform/common';
import { OnboardingFlow } from '../onboardingFlow.js';

function createMockIPC(responses: Record<string, unknown> = {}): IIPCRenderer {
  return {
    invoke: vi.fn(async (channel: string) => {
      return responses[channel] ?? {};
    }),
    on: vi.fn(),
    removeListener: vi.fn(),
  };
}

describe('OnboardingFlow', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('renders the welcome step initially', () => {
    const ipc = createMockIPC();
    const flow = new OnboardingFlow(container, ipc);

    expect(container.querySelector('.onboarding-welcome')).toBeTruthy();
    expect(container.querySelector('.onb-logo-mark')).toBeTruthy();
    expect(container.querySelector('.btn-primary')).toBeTruthy();

    flow.dispose();
  });

  it('transitions from welcome to auth on button click', () => {
    const ipc = createMockIPC({
      [IPC_CHANNELS.ONBOARDING_CHECK_GH]: {
        installed: false, authenticated: false, hasCopilotScope: false,
      },
    });
    const flow = new OnboardingFlow(container, ipc);

    // Click "Sign in with GitHub"
    const btn = container.querySelector('.btn-primary.btn-large') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    btn.click();

    // Should now show auth step
    expect(container.querySelector('.onboarding-auth')).toBeTruthy();
    expect(ipc.invoke).toHaveBeenCalledWith(IPC_CHANNELS.ONBOARDING_CHECK_GH);

    flow.dispose();
  });

  it('fires onDidComplete when flow finishes', async () => {
    const ipc = createMockIPC({
      [IPC_CHANNELS.ONBOARDING_COMPLETE]: { success: true },
    });
    const flow = new OnboardingFlow(container, ipc);
    const completeSpy = vi.fn();
    flow.onDidComplete(completeSpy);

    // Simulate reaching connectors step by calling internal _showStep
    // We access the private method for testing purposes
    (flow as any)._showStep('connectors');

    // Click "Start Using GHO Work"
    const btn = container.querySelector('.btn-primary') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    btn.click();

    // Wait for async completion
    await vi.waitFor(() => {
      expect(completeSpy).toHaveBeenCalled();
    });

    flow.dispose();
  });

  it('disposes cleanly and removes DOM', () => {
    const ipc = createMockIPC();
    const flow = new OnboardingFlow(container, ipc);
    expect(container.querySelector('.onboarding-flow')).toBeTruthy();

    flow.dispose();
    expect(container.querySelector('.onboarding-flow')).toBeFalsy();
  });
});
