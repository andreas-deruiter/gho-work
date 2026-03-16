/**
 * IPC handlers for Storage, Auth, and Onboarding domains.
 *
 * Includes helpers that are only used by onboarding handlers:
 *   - listSkillsWithDisabledState
 *   - getInstructionsPath / validateInstructionsFile / validatePath
 */
import { shell } from 'electron';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { IPC_CHANNELS } from '@gho-work/platform';
import type {
  GhCheckResponse,
  GhLoginResponse,
  GhLoginEvent,
  CopilotCheckResponse,
  OnboardingStatusResponse,
} from '@gho-work/platform';
import type { SkillEntryDTO, SqliteStorageService } from '@gho-work/platform';
import type { SkillRegistryImpl } from '@gho-work/agent';
import { isOnboardingComplete } from '../sdkLifecycle.js';
import type { IpcHandlerDeps } from './types.js';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Helper: list skills with disabled state overlaid from storage
// ---------------------------------------------------------------------------

export function listSkillsWithDisabledState(
  skillRegistry: SkillRegistryImpl,
  storageService: SqliteStorageService | undefined,
): SkillEntryDTO[] {
  const disabledIds: string[] = JSON.parse(storageService?.getSetting('skills.disabled') ?? '[]');
  return skillRegistry.list().map(s => ({
    ...s,
    disabled: disabledIds.includes(s.id),
  }));
}

// ---------------------------------------------------------------------------
// Helper: instructions path resolution + validation
// ---------------------------------------------------------------------------

const DEFAULT_INSTRUCTIONS_PATH = path.join(os.homedir(), '.gho-work', 'gho-instructions.md');

export function getInstructionsPath(storageService: SqliteStorageService | undefined): string {
  const custom = storageService?.getSetting('instructions.filePath');
  return custom || DEFAULT_INSTRUCTIONS_PATH;
}

export async function validateInstructionsFile(
  filePath: string,
): Promise<{ path: string; exists: boolean; lineCount: number; isDefault: boolean }> {
  const isDefault = filePath === DEFAULT_INSTRUCTIONS_PATH;
  try {
    const content = await fs.promises.readFile(filePath, { encoding: 'utf-8' });
    const lineCount = content.split('\n').length;
    return { path: filePath, exists: true, lineCount, isDefault };
  } catch {
    return { path: filePath, exists: false, lineCount: 0, isDefault };
  }
}

// ---------------------------------------------------------------------------
// Helper: workspace path validation (prevents path traversal)
// ---------------------------------------------------------------------------

const workspaceRoot = os.homedir();

export function validatePath(targetPath: string): void {
  const resolved = path.resolve(targetPath);
  const resolvedRoot = path.resolve(workspaceRoot) + path.sep;
  if (resolved !== path.resolve(workspaceRoot) && !resolved.startsWith(resolvedRoot)) {
    throw new Error('Path traversal detected: path is outside workspace');
  }
}

export function registerAuthHandlers(deps: IpcHandlerDeps): void {
  const {
    ipc,
    storageService,
    authService,
    sdk,
    onboardingFilePath,
    useMock,
  } = deps;

  // =========================================================================
  // Storage handlers
  // =========================================================================

  ipc.handle(IPC_CHANNELS.STORAGE_GET, async (...args: unknown[]) => {
    const { key } = args[0] as { key: string };
    const value = storageService?.getSetting(key) ?? null;
    return { value };
  });

  ipc.handle(IPC_CHANNELS.STORAGE_SET, async (...args: unknown[]) => {
    const { key, value } = args[0] as { key: string; value: string };
    storageService?.setSetting(key, value);
    return {};
  });

  // =========================================================================
  // Auth handlers
  // =========================================================================

  ipc.handle(IPC_CHANNELS.AUTH_LOGIN, async () => {
    await authService.login();
  });

  ipc.handle(IPC_CHANNELS.AUTH_LOGOUT, async () => {
    await authService.logout();
    // Clear onboarding flag so re-authentication goes through onboarding
    try {
      fs.unlinkSync(onboardingFilePath);
    } catch {
      // File may not exist — that's fine
    }
  });

  ipc.handle(IPC_CHANNELS.AUTH_STATE, async () => {
    return authService.state;
  });

  // =========================================================================
  // Onboarding handlers
  // =========================================================================

  ipc.handle(IPC_CHANNELS.ONBOARDING_STATUS, async (): Promise<OnboardingStatusResponse> => {
    return { complete: isOnboardingComplete(onboardingFilePath) };
  });

  ipc.handle(IPC_CHANNELS.ONBOARDING_CHECK_GH, async (): Promise<GhCheckResponse> => {
    // Check if gh is installed by running it directly (cross-platform — `which` doesn't exist on Windows)
    let version: string | undefined;
    try {
      const { stdout } = await execFileAsync('gh', ['--version']);
      const match = stdout.match(/gh version ([\d.]+)/);
      if (match) {
        version = match[1];
      }
    } catch {
      // gh not found on PATH — expected if not installed
      return { installed: false, authenticated: false, hasCopilotScope: false };
    }
    const installed = true;

    // Check auth status
    let authenticated = false;
    let login: string | undefined;
    let hasCopilotScope = false;
    try {
      const { stdout } = await execFileAsync('gh', ['auth', 'status']);
      authenticated = true;
      const loginMatch = stdout.match(/Logged in to github\.com account (\S+)/);
      if (loginMatch) {
        login = loginMatch[1];
      }
      // Check for copilot scope in output
      if (stdout.includes('copilot')) {
        hasCopilotScope = true;
      }
    } catch (err) {
      // gh auth status exits non-zero if not logged in
      const stderr = (err as { stderr?: string }).stderr ?? '';
      if (stderr.includes('not logged') || stderr.includes('no accounts')) {
        return { installed, version, authenticated: false, hasCopilotScope: false };
      }
    }

    // If scope not detected from auth status, check via token + API
    if (authenticated && !hasCopilotScope) {
      try {
        const { stdout: token } = await execFileAsync('gh', ['auth', 'token']);
        const https = await import('node:https');
        const scopeCheck = await new Promise<string>((resolve, reject) => {
          const req = https.get('https://api.github.com/user', {
            headers: {
              Authorization: `token ${token.trim()}`,
              'User-Agent': 'gho-work',
            },
          }, (res) => {
            const scopes = res.headers['x-oauth-scopes'] ?? '';
            resolve(scopes as string);
          });
          req.on('error', reject);
          req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
        });
        hasCopilotScope = scopeCheck.split(',').map((s) => s.trim()).includes('copilot');
      } catch (err) {
        console.warn('[ONBOARDING_CHECK_GH] Failed to check copilot scope:', err instanceof Error ? err.message : String(err));
      }
    }

    return { installed, version, authenticated, login, hasCopilotScope };
  });

  ipc.handle(IPC_CHANNELS.ONBOARDING_GH_LOGIN, async (): Promise<GhLoginResponse> => {
    // Helper to send progress events to renderer
    const sendLoginEvent = (event: GhLoginEvent) => {
      ipc.sendToRenderer(IPC_CHANNELS.ONBOARDING_GH_LOGIN_EVENT, event);
    };

    return new Promise((resolve) => {
      // gh auth login --web uses the device code flow:
      // 1. Prints "First copy your one-time code: XXXX-XXXX" to stderr
      // 2. Prints "Open this URL: https://github.com/login/device" to stderr
      // 3. Waits for user to complete auth in browser, then exits 0
      // We parse the code + URL, open the browser ourselves, and stream progress to UI.
      const child = spawn('gh', ['auth', 'login', '--hostname', 'github.com', '--web', '--scopes', 'copilot'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stderr = '';
      let deviceCodeSent = false;

      const parseAndSendDeviceCode = (output: string) => {
        if (deviceCodeSent) {
          return;
        }
        // Match patterns like "one-time code: XXXX-XXXX" and URL
        const codeMatch = output.match(/code:\s*([A-Z0-9]{4}-[A-Z0-9]{4})/);
        const urlMatch = output.match(/(https:\/\/github\.com\/login\/device\S*)/);
        if (codeMatch && urlMatch) {
          deviceCodeSent = true;
          sendLoginEvent({ type: 'device_code', code: codeMatch[1], url: urlMatch[1] });
          // Open the browser for the user
          void shell.openExternal(urlMatch[1]).then(() => {
            sendLoginEvent({ type: 'browser_opened' });
          });
        }
      };

      child.stdout?.on('data', (chunk: Buffer) => {
        parseAndSendDeviceCode(chunk.toString());
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
        parseAndSendDeviceCode(stderr);
      });

      const timeout = setTimeout(() => {
        child.kill();
        resolve({ success: false, error: 'Login timed out after 5 minutes' });
      }, 5 * 60 * 1000);

      child.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          sendLoginEvent({ type: 'authenticated' });
        }
        resolve({ success: code === 0, error: code !== 0 ? stderr.trim() || 'Login failed' : undefined });
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        resolve({ success: false, error: err.message });
      });
    });
  });

  ipc.handle(IPC_CHANNELS.ONBOARDING_GH_LOGOUT, async () => {
    try {
      await execFileAsync('gh', ['auth', 'logout', '--hostname', 'github.com', '--yes']);
      console.warn('[ONBOARDING_GH_LOGOUT] Logged out of gh CLI');
    } catch (err) {
      console.warn('[ONBOARDING_GH_LOGOUT] Logout failed (may already be logged out):', err instanceof Error ? err.message : String(err));
    }
    return {};
  });

  ipc.handle(IPC_CHANNELS.ONBOARDING_CHECK_COPILOT, async (): Promise<CopilotCheckResponse> => {
    // Step 1: Get token from gh CLI
    let tokenStr: string;
    try {
      const { stdout: token } = await execFileAsync('gh', ['auth', 'token']);
      tokenStr = token.trim();
      console.warn('[COPILOT_CHECK] Got token from gh CLI (length:', tokenStr.length, ')');
    } catch (err) {
      const msg = 'Failed to get token from gh CLI: ' + (err instanceof Error ? err.message : String(err));
      console.error('[COPILOT_CHECK]', msg);
      return { hasSubscription: false, error: msg };
    }

    const https = await import('node:https');

    // Helper to make GitHub API requests
    const ghApiGet = <T>(url: string): Promise<{ status: number; headers: Record<string, string>; body: T }> =>
      new Promise((resolve, reject) => {
        const req = https.get(url, {
          headers: { Authorization: `token ${tokenStr}`, 'User-Agent': 'gho-work' },
        }, (res) => {
          let data = '';
          res.on('data', (chunk: string) => { data += chunk; });
          res.on('end', () => {
            try {
              const headers: Record<string, string> = {};
              for (const [k, v] of Object.entries(res.headers)) {
                if (typeof v === 'string') { headers[k] = v; }
              }
              resolve({ status: res.statusCode ?? 0, headers, body: JSON.parse(data) });
            } catch (parseErr) {
              console.warn('[COPILOT_CHECK] Failed to parse JSON from', url, ':', parseErr instanceof Error ? parseErr.message : String(parseErr));
              resolve({ status: res.statusCode ?? 0, headers: {}, body: {} as T });
            }
          });
        });
        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
      });

    // Step 2: Fetch user info + check scopes
    let userInfo: { login: string; id: number; avatar_url: string; name?: string };
    let scopes: string[];
    try {
      const userResp = await ghApiGet<{ login: string; id: number; avatar_url: string; name?: string; message?: string }>(
        'https://api.github.com/user',
      );
      console.warn('[COPILOT_CHECK] GitHub API /user status:', userResp.status);
      if (userResp.status !== 200) {
        const msg = `GitHub API returned ${userResp.status}: ${(userResp.body as { message?: string }).message ?? 'unknown error'}`;
        console.error('[COPILOT_CHECK]', msg);
        return { hasSubscription: false, error: msg };
      }
      userInfo = userResp.body;
      scopes = (userResp.headers['x-oauth-scopes'] ?? '').split(',').map(s => s.trim());
      console.warn('[COPILOT_CHECK] Logged in as:', userInfo.login, '| Scopes:', scopes.join(', '));
    } catch (err) {
      const msg = 'Failed to fetch GitHub user: ' + (err instanceof Error ? err.message : String(err));
      console.error('[COPILOT_CHECK]', msg);
      return { hasSubscription: false, error: msg };
    }

    const hasCopilotScope = scopes.includes('copilot');
    const user = {
      githubId: String(userInfo.id),
      githubLogin: userInfo.login,
      avatarUrl: userInfo.avatar_url,
      name: userInfo.name,
    };

    if (!hasCopilotScope) {
      const msg = `Token for @${userInfo.login} is missing the "copilot" scope. Current scopes: ${scopes.join(', ')}. Try: gh auth refresh -s copilot`;
      console.warn('[COPILOT_CHECK]', msg);
      return { hasSubscription: false, user, error: msg };
    }

    // Copilot scope is present — trust the API check. Don't start the SDK here;
    // it will start after onboarding completes (in ONBOARDING_COMPLETE handler).
    // Starting it here caused timeouts on Windows and duplicate SDK processes.
    console.warn('[COPILOT_CHECK] Copilot scope confirmed for @' + userInfo.login);

    return {
      hasSubscription: true,
      tier: 'free', // Will be refined once SDK connects post-onboarding
      user,
    };
  });

  ipc.handle(IPC_CHANNELS.ONBOARDING_COMPLETE, async () => {
    // Write onboarding-complete flag
    fs.writeFileSync(onboardingFilePath, JSON.stringify({ complete: true }), 'utf-8');

    // Start SDK with real token. Wrap in a timeout to prevent hanging.
    // If it fails, the app continues in degraded mode — the user can still
    // use the app and the SDK error dialog will show.
    if (!useMock) {
      try {
        const { stdout: token } = await execFileAsync('gh', ['auth', 'token']);
        const tokenStr = token.trim();
        if (tokenStr) {
          const sdkStart = sdk.restart({ githubToken: tokenStr, useMock: false });
          const timeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('SDK start timed out after 20s')), 20000));
          await Promise.race([sdkStart, timeout]);
          console.warn('[main] SDK restarted in real mode after onboarding');
        }
      } catch (err) {
        console.error('[main] Failed to restart SDK with real token:', err instanceof Error ? err.message : String(err));
        // Stop any partially-started SDK to prevent ghost processes
        try { await sdk.stop(); } catch { /* ignore */ }
      }
    }

    return { success: true };
  });
}
