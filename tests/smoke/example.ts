/**
 * Example smoke test — demonstrates the step helper pattern.
 *
 * Run with: npx tsx tests/smoke/example.ts
 */

import { header, step, autoStep, summary } from './helpers';

async function main() {
  header('Example Smoke Test');

  // Automated step: runs a function, passes if no error thrown
  await autoStep('Node.js version is 18+', () => {
    const major = parseInt(process.version.slice(1), 10);
    if (major < 18) throw new Error(`Node ${process.version} is too old`);
    console.log(`  Node ${process.version}`);
  });

  // Manual step: pauses for user verification
  await step(
    'Electron app launches',
    '  Run: npm run desktop:dev\n  Verify: An Electron window appears with a blank page or placeholder.'
  );

  await step(
    'Window is responsive',
    '  Verify: You can resize, minimize, and close the Electron window.'
  );

  summary();
}

main();
