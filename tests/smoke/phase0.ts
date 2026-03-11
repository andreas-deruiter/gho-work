import { header, autoStep, step, summary } from './helpers.js';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');

function run(command: string, args: string[]) {
  return execFileSync(command, args, { encoding: 'utf-8', cwd: root });
}

async function main() {
  header('Phase 0: Project Scaffolding');

  await autoStep('npm install succeeds', () => {
    run('npm', ['install']);
  });

  await autoStep('turbo build succeeds', () => {
    run('npx', ['turbo', 'build']);
  });

  await autoStep('turbo lint succeeds', () => {
    run('npx', ['turbo', 'lint']);
  });

  await autoStep('vitest run passes', () => {
    run('npx', ['vitest', 'run']);
  });

  await autoStep('prettier check passes', () => {
    run('npm', ['run', 'format:check']);
  });

  await step(
    'Electron window launches',
    'Run: npm run desktop:dev\nVerify an Electron window opens. Press Ctrl+C to stop.',
  );

  await step(
    'Electron window shows content',
    'The Electron window should display the workbench UI (sidebar, main panel, status bar).',
  );

  summary();
}

main();
