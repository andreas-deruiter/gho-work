/**
 * Playwright global setup — rebuilds better-sqlite3 for Electron's Node ABI
 * before E2E tests, then restores the Node.js build afterward.
 */
import { execFileSync } from 'child_process';

export default function globalSetup(): () => void {
  console.log('[e2e] Rebuilding better-sqlite3 for Electron...');
  execFileSync('npx', ['@electron/rebuild', '-w', 'better-sqlite3', '--module-dir', 'apps/desktop'], {
    stdio: 'inherit',
    cwd: process.cwd(),
  });

  // Return teardown function to restore Node.js build
  return () => {
    console.log('[e2e] Restoring better-sqlite3 for Node.js...');
    execFileSync('npm', ['rebuild', 'better-sqlite3'], {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
  };
}
