/**
 * Playwright global setup — rebuilds better-sqlite3 for Electron's Node ABI
 * before E2E tests. Does NOT restore for Node.js afterward, because that
 * breaks the Electron app (ABI mismatch). The native module should stay
 * compiled for Electron since that's the actual runtime.
 */
import { execFileSync } from 'child_process';

export default function globalSetup(): void {
  console.log('[e2e] Rebuilding better-sqlite3 for Electron...');
  execFileSync('npx', ['@electron/rebuild', '-w', 'better-sqlite3', '--module-dir', 'apps/desktop'], {
    stdio: 'inherit',
    cwd: process.cwd(),
  });
}
