/**
 * SDK lifecycle management — extracted from mainProcess.ts.
 *
 * Handles:
 * - Checking onboarding completion state
 * - Starting the Copilot SDK (mock vs real mode)
 * - Deferred start when onboarding is incomplete
 * - Error dialog on SDK failure
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import type { CopilotSDKImpl } from '@gho-work/agent';

const execFileAsync = promisify(execFile);

/**
 * Checks whether the onboarding-complete.json file exists and contains
 * `{ complete: true }`. Returns false if the file is missing or unreadable.
 */
export function isOnboardingComplete(onboardingFilePath: string): boolean {
  try {
    const data = JSON.parse(fs.readFileSync(onboardingFilePath, 'utf-8'));
    return data?.complete === true;
  } catch {
    return false;
  }
}

export interface SDKLifecycleResult {
  sdkReady: Promise<void>;
  /** Call after onboarding completes to start/restart SDK externally */
  resolveReady: () => void;
}

/**
 * Starts the SDK lifecycle: checks onboarding state, acquires a GitHub token,
 * and starts the SDK. Returns a promise that resolves when the SDK is ready
 * (or immediately in mock mode).
 *
 * @param sdk - The CopilotSDKImpl instance to start
 * @param useMock - Whether to start in mock mode
 * @param onboardingFilePath - Path to the onboarding-complete.json file
 */
export function startSDKLifecycle(
  sdk: CopilotSDKImpl,
  useMock: boolean,
  onboardingFilePath: string,
): SDKLifecycleResult {
  let _sdkReadyResolve: (() => void) | undefined;
  const sdkReady = new Promise<void>((resolve) => { _sdkReadyResolve = resolve; });

  void (async () => {
    try {
      if (useMock) {
        await sdk.start();
        console.warn('[main] Agent started in Mock mode (--mock flag)');
        _sdkReadyResolve?.();
        return;
      }

      if (isOnboardingComplete(onboardingFilePath)) {
        try {
          const { stdout: token } = await execFileAsync('gh', ['auth', 'token']);
          if (token.trim()) {
            (sdk as any)._options.githubToken = token.trim();
          }
        } catch (err) {
          console.warn('[main] Could not get gh auth token, SDK will use default auth:', err instanceof Error ? err.message : String(err));
        }

        try {
          // Timeout SDK start to prevent hanging — native binary issues on Windows
          // can cause the subprocess to hang indefinitely
          const startPromise = sdk.start();
          const timeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('SDK start timed out after 30s')), 30000));
          await Promise.race([startPromise, timeout]);
          console.warn('[main] Agent started in Copilot SDK mode');
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error('[main] CRITICAL: Copilot SDK failed to start:', msg);
          // Stop any partially-started SDK to prevent ghost processes
          try { await sdk.stop(); } catch { /* ignore */ }
          // Show error to user — never silently degrade to a broken state
          try {
            const { dialog } = await import('electron');
            dialog.showErrorBox(
              'GHO Work — Agent Unavailable',
              'The Copilot SDK failed to start. The AI agent will not work.\n\n'
              + 'This usually means GitHub authentication is missing or expired.\n'
              + 'Try: gh auth login\n\n'
              + `Error: ${msg}`,
            );
          } catch (dialogErr) {
            console.error('[main] Failed to show error dialog:', dialogErr instanceof Error ? dialogErr.message : String(dialogErr));
          }
        }
      } else {
        console.warn('[main] SDK start deferred — waiting for onboarding to complete');
      }
    } catch (outerErr) {
      // Catch-all: no error from SDK lifecycle should ever crash the main process
      console.error('[main] Unexpected error in SDK lifecycle:', outerErr instanceof Error ? outerErr.message : String(outerErr));
    }
    _sdkReadyResolve?.();
  })();

  return {
    sdkReady,
    resolveReady: () => { _sdkReadyResolve?.(); },
  };
}
