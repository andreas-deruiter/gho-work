/**
 * Phase 1 Smoke Test — interactive verification of acceptance criteria.
 * Run with: npx tsx tests/smoke/phase1.ts
 *
 * Note: Uses getDependencies() to register DI metadata manually instead
 * of parameter decorators, because tsx/esbuild does not support them.
 */
import { step, autoStep, summary } from './helpers.js';
import { execSync } from 'child_process';
import {
  InstantiationService,
  ServiceCollection,
  SyncDescriptor,
  createServiceIdentifier,
  getDependencies,
} from '@gho-work/base';
import Database from 'better-sqlite3';
import { configurePragmas, migrateDatabase, GLOBAL_MIGRATIONS } from '@gho-work/platform';

async function main(): Promise<void> {
  console.log('\n=== Phase 1 Smoke Test ===\n');

  await autoStep('TypeScript compiles', () => {
    execSync('npx turbo build', { stdio: 'pipe' });
  });

  await autoStep('All unit tests pass', () => {
    execSync('npx vitest run', { stdio: 'pipe' });
  });

  await autoStep('DI resolves 3+ service chain', () => {
    interface IA { a(): string; }
    const IA = createServiceIdentifier<IA>('smoke.IA');
    interface IB { b(): string; }
    const IB = createServiceIdentifier<IB>('smoke.IB');
    interface IC { c(): string; }
    const IC = createServiceIdentifier<IC>('smoke.IC');

    class A implements IA { a() { return 'A'; } }
    class B implements IB {
      constructor(private sa: IA) {}
      b() { return `B+${this.sa.a()}`; }
    }
    // Register DI metadata manually (tsx/esbuild cannot do parameter decorators)
    IA(B, undefined, 0);

    class C implements IC {
      constructor(private sa: IA, private sb: IB) {}
      c() { return `C+${this.sa.a()}+${this.sb.b()}`; }
    }
    IA(C, undefined, 0);
    IB(C, undefined, 1);

    const sc = new ServiceCollection(
      [IA, new SyncDescriptor(A)],
      [IB, new SyncDescriptor(B)],
      [IC, new SyncDescriptor(C)],
    );
    const inst = new InstantiationService(sc);
    const c = inst.getService(IC);
    if (c.c() !== 'C+A+B+A') {
      throw new Error(`Expected C+A+B+A, got ${c.c()}`);
    }
  });

  await autoStep('SQLite stores and retrieves data', () => {
    const db = new Database(':memory:');
    configurePragmas(db);
    migrateDatabase(db, GLOBAL_MIGRATIONS);

    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('test', '"hello"');
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('test') as { value: string };
    if (row.value !== '"hello"') {
      throw new Error(`Expected "hello", got ${row.value}`);
    }
    db.close();
  });

  await step('App launches with workbench', 'Run `npm run desktop:dev` — verify:\n' +
    '  1. Activity bar visible on left with 5 icons\n' +
    '  2. Sidebar visible next to activity bar\n' +
    '  3. Chat panel in main content area\n' +
    '  4. Status bar at bottom\n' +
    '  5. Clicking activity bar icons switches sidebar panel');

  await step('Theme toggle works', 'Open DevTools → Console → run:\n' +
    '  document.documentElement.setAttribute("data-theme", "dark")\n' +
    '  Then "light" — verify colors change');

  await step('Keyboard shortcuts respond', 'Test these shortcuts:\n' +
    '  Cmd+B — toggle sidebar\n' +
    '  Cmd+N — new conversation\n' +
    '  Cmd+, — open settings');

  summary();
}

main();
