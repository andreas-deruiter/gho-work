/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IIPCRenderer } from '@gho-work/platform/common';
import { IPC_CHANNELS } from '@gho-work/platform/common';
import { AuthStep } from '../authStep.js';

function createMockIPC(responses: Record<string, unknown> = {}): IIPCRenderer {
  return {
    invoke: vi.fn(async (channel: string) => responses[channel] ?? {}) as unknown as IIPCRenderer['invoke'],
    on: vi.fn(),
    removeListener: vi.fn(),
  };
}

describe('AuthStep', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('shows checking state initially', () => {
    const ipc = createMockIPC({
      [IPC_CHANNELS.ONBOARDING_CHECK_GH]: new Promise(() => {}), // never resolves
    });
    const step = new AuthStep(container, ipc);

    expect(container.querySelector('.onb-spinner')).toBeTruthy();
    expect(container.textContent).toContain('Checking');

    step.dispose();
  });

  it('shows not_installed when gh is missing', async () => {
    const ipc = createMockIPC({
      [IPC_CHANNELS.ONBOARDING_CHECK_GH]: {
        installed: false, authenticated: false, hasCopilotScope: false,
      },
    });
    const step = new AuthStep(container, ipc);

    await vi.waitFor(() => {
      expect(container.textContent).toContain('GitHub CLI Required');
    });

    step.dispose();
  });

  it('shows sign-in button when not authenticated', async () => {
    const ipc = createMockIPC({
      [IPC_CHANNELS.ONBOARDING_CHECK_GH]: {
        installed: true, version: '2.67.0', authenticated: false, hasCopilotScope: false,
      },
    });
    const step = new AuthStep(container, ipc);

    await vi.waitFor(() => {
      expect(container.textContent).toContain('Sign in with GitHub');
    });

    step.dispose();
  });

  it('shows scope required when missing copilot scope', async () => {
    const ipc = createMockIPC({
      [IPC_CHANNELS.ONBOARDING_CHECK_GH]: {
        installed: true, version: '2.67.0', authenticated: true, login: 'user', hasCopilotScope: false,
      },
    });
    const step = new AuthStep(container, ipc);

    await vi.waitFor(() => {
      expect(container.textContent).toContain('Copilot Scope Required');
    });

    step.dispose();
  });

  it('fires onDidComplete when fully authenticated', async () => {
    const ipc = createMockIPC({
      [IPC_CHANNELS.ONBOARDING_CHECK_GH]: {
        installed: true, version: '2.67.0', authenticated: true, login: 'user', hasCopilotScope: true,
      },
    });
    const completeSpy = vi.fn();
    const step = new AuthStep(container, ipc);
    step.onDidComplete(completeSpy);

    await vi.waitFor(() => {
      expect(container.textContent).toContain('Authenticated');
    });

    // Wait for the auto-advance timeout
    await vi.waitFor(() => {
      expect(completeSpy).toHaveBeenCalled();
    }, { timeout: 2000 });

    step.dispose();
  });

  it('shows login failed on error', async () => {
    const invokeMock = vi.fn(async (channel: string) => {
      if (channel === IPC_CHANNELS.ONBOARDING_CHECK_GH) {
        return { installed: true, version: '2.67.0', authenticated: false, hasCopilotScope: false };
      }
      if (channel === IPC_CHANNELS.ONBOARDING_GH_LOGIN) {
        return { success: false, error: 'Network error' };
      }
      return {};
    });

    const ipc: IIPCRenderer = { invoke: invokeMock as unknown as IIPCRenderer['invoke'], on: vi.fn(), removeListener: vi.fn() };
    const step = new AuthStep(container, ipc);

    await vi.waitFor(() => {
      expect(container.textContent).toContain('Sign in with GitHub');
    });

    // Click sign in
    const btn = container.querySelector('.btn-primary.btn-large') as HTMLButtonElement;
    btn.click();

    await vi.waitFor(() => {
      expect(container.textContent).toContain('Sign-in Failed');
      expect(container.textContent).toContain('Network error');
    });

    step.dispose();
  });
});
