/**
 * Phase 1 Smoke Test — interactive verification of acceptance criteria.
 * Run with: npx tsx tests/smoke/phase1.ts
 */
import { step, autoStep, summary } from './helpers.js';

console.log('\n=== Phase 1 Smoke Test ===\n');

await autoStep('TypeScript compiles', async () => {
  const proc = await import('child_process');
  proc.execSync('npx turbo build', { stdio: 'pipe' });
});

await autoStep('All unit tests pass', async () => {
  const proc = await import('child_process');
  proc.execSync('npx vitest run', { stdio: 'pipe' });
});

await autoStep('DI resolves 3+ service chain', async () => {
  const { InstantiationService, ServiceCollection, SyncDescriptor, createServiceIdentifier } =
    await import('@gho-work/base');

  interface IA { a(): string; }
  const IA = createServiceIdentifier<IA>('smoke.IA');
  interface IB { b(): string; }
  const IB = createServiceIdentifier<IB>('smoke.IB');
  interface IC { c(): string; }
  const IC = createServiceIdentifier<IC>('smoke.IC');

  class A implements IA { a() { return 'A'; } }
  class B implements IB {
    constructor(@IA private sa: IA) {}
    b() { return `B+${this.sa.a()}`; }
  }
  class C implements IC {
    constructor(@IA private sa: IA, @IB private sb: IB) {}
    c() { return `C+${this.sa.a()}+${this.sb.b()}`; }
  }

  const sc = new ServiceCollection(
    [IA, new SyncDescriptor(A)],
    [IB, new SyncDescriptor(B)],
    [IC, new SyncDescriptor(C)],
  );
  const inst = new InstantiationService(sc);
  const c = inst.getService(IC);
  if (c.c() !== 'C+A+B+A') throw new Error(`Expected C+A+B+A, got ${c.c()}`);
});

await autoStep('SQLite stores and retrieves data', async () => {
  const Database = (await import('better-sqlite3')).default;
  const { configurePragmas, migrateDatabase, GLOBAL_MIGRATIONS } = await import('@gho-work/platform');

  const db = new Database(':memory:');
  configurePragmas(db);
  migrateDatabase(db, GLOBAL_MIGRATIONS);

  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('test', '"hello"');
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('test') as any;
  if (row.value !== '"hello"') throw new Error(`Expected "hello", got ${row.value}`);
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
