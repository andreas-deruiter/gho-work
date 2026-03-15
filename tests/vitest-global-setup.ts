/**
 * Vitest global setup — ensures better-sqlite3 works under system Node.js.
 *
 * The postinstall script runs `@electron/rebuild` which may compile the root
 * node_modules copy for Electron's ABI. If someone runs `npm rebuild better-sqlite3`
 * it restores the system ABI. This setup detects a mismatch and fixes it.
 */
import { execFileSync } from 'child_process';
import { createRequire } from 'module';

export function setup(): void {
  const require = createRequire(import.meta.url);
  try {
    // Attempt to load the native module — if the ABI matches, this succeeds
    require('better-sqlite3');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('NODE_MODULE_VERSION')) {
      console.log('[vitest] better-sqlite3 ABI mismatch — rebuilding for system Node.js...');
      execFileSync('npm', ['rebuild', 'better-sqlite3'], {
        stdio: 'inherit',
        cwd: process.cwd(),
      });
    } else {
      // Some other error — let tests surface it
      throw err;
    }
  }
}
