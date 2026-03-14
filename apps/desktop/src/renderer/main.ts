/**
 * Renderer entry point — creates the workbench UI, or shows onboarding on first launch.
 */
import type { IIPCRenderer, OnboardingStatusResponse } from '@gho-work/platform/common';
import { IPC_CHANNELS } from '@gho-work/platform/common';
import { Workbench, OnboardingFlow } from '@gho-work/ui';
import './styles.css';
import './chatProgress.css';
import './settings.css';
import './documents.css';

// Declare the IPC bridge exposed by preload
declare global {
  interface Window {
    ghoWorkIPC: IIPCRenderer;
  }
}

// Create IPC adapter from the preload-exposed bridge
const ipc: IIPCRenderer = window.ghoWorkIPC;

(async () => {
  const appEl = document.getElementById('app');
  if (!appEl) {
    return;
  }

  // Check onboarding status
  let needsOnboarding = true;
  try {
    const status = await ipc.invoke(IPC_CHANNELS.ONBOARDING_STATUS) as OnboardingStatusResponse;
    needsOnboarding = !status.complete;
  } catch {
    // If status check fails, show onboarding
  }

  if (needsOnboarding) {
    const onboarding = new OnboardingFlow(appEl, ipc);
    onboarding.onDidComplete(() => {
      onboarding.dispose();
      // Clear container and render workbench
      while (appEl.firstChild) {
        appEl.removeChild(appEl.firstChild);
      }
      const workbench = new Workbench(appEl, ipc);
      workbench.render();
    });
  } else {
    const workbench = new Workbench(appEl, ipc);
    workbench.render();
  }
})();
