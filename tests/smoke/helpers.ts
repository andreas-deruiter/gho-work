/**
 * Smoke test step helper for interactive user smoke testing.
 *
 * Usage:
 *   npx tsx tests/smoke/example.ts
 *
 * Each step pauses for the user to verify before continuing.
 */

import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

let stepNumber = 0;
let passed = 0;
let failed = 0;
let skipped = 0;

export async function step(description: string, instructions?: string): Promise<boolean> {
  stepNumber++;
  console.log(`\n--- Step ${stepNumber}: ${description} ---`);
  if (instructions) {
    console.log(instructions);
  }

  const answer = await ask('\nDid this step pass? [Y/n/s(kip)] ');
  const lower = answer.toLowerCase();

  if (lower === 's' || lower === 'skip') {
    skipped++;
    console.log('  SKIPPED');
    return false;
  }

  if (lower === '' || lower === 'y' || lower === 'yes') {
    passed++;
    console.log('  PASSED');
    return true;
  }

  failed++;
  const reason = await ask('What went wrong? ');
  console.log(`  FAILED: ${reason}`);
  return false;
}

export async function autoStep(description: string, fn: () => Promise<void> | void): Promise<boolean> {
  stepNumber++;
  console.log(`\n--- Step ${stepNumber}: ${description} ---`);

  try {
    await fn();
    passed++;
    console.log('  PASSED');
    return true;
  } catch (err) {
    failed++;
    console.log(`  FAILED: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

export function summary(): void {
  console.log('\n========================================');
  console.log(`Smoke Test Summary: ${passed} passed, ${failed} failed, ${skipped} skipped (${stepNumber} total)`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exitCode = 1;
  }

  rl.close();
}

export function header(title: string): void {
  console.log(`\n${'='.repeat(40)}`);
  console.log(`  ${title}`);
  console.log(`${'='.repeat(40)}`);
}
