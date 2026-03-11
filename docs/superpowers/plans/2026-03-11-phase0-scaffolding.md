# Phase 0: Project Scaffolding — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A developer can clone the repo, run `npm install && npm run dev`, and see an empty Electron window. All tooling (lint, format, test, e2e) works across the monorepo.

**Architecture:** The monorepo already has the correct package structure (packages/base, platform, agent, connectors, ui, electron + apps/desktop) with Turborepo orchestration. The Electron shell, DI system, event system, and mock agent are already functional. This plan fills the tooling gaps: ESLint, Prettier, Vitest workspace, Playwright e2e, CI pipeline, and acceptance tests.

**Tech Stack:** TypeScript 5.7, Turborepo, electron-vite 3, Vitest 3, Playwright (Electron target), ESLint 9 (flat config), Prettier, GitHub Actions

**Current state:** npm workspaces (not pnpm), 6 packages + 1 app all scaffolded with source code, existing unit tests in base and agent only, no lint/format/e2e configs, no CI.

**Note on pnpm:** The root `package.json` uses `npm` as packageManager and npm workspaces. Turborepo works fine with npm workspaces — no migration to pnpm is needed for Phase 0. We keep npm throughout.

---

## Chunk 1: Tooling Configuration

### Task 1: ESLint flat config

**Files:**
- Create: `eslint.config.mjs`
- Modify: `package.json` (add devDependencies, add lint:fix script)
- Modify: each `packages/*/package.json` and `apps/desktop/package.json` (add lint script)

- [ ] **Step 1: Install ESLint and typescript-eslint**

Run:
```bash
npm install -D eslint @eslint/js typescript-eslint
```

- [ ] **Step 2: Create `eslint.config.mjs`**

```javascript
// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      curly: 'error',
    },
  },
  {
    ignores: ['**/dist/**', '**/out/**', '**/node_modules/**', 'references/**'],
  },
);
```

- [ ] **Step 3: Add lint:fix script to root `package.json`**

The root already has `"lint": "turbo lint"` which delegates to per-package lint scripts via Turborepo. Keep that. Only add the fix shortcut:
```json
"lint:fix": "eslint --fix 'packages/*/src/**/*.ts' 'apps/*/src/**/*.ts'"
```

- [ ] **Step 4: Add lint scripts to each package that has source code**

For each of `packages/base`, `packages/platform`, `packages/agent`, `packages/connectors`, `packages/ui`, `packages/electron`, add to their `package.json` scripts:
```json
"lint": "eslint 'src/**/*.ts'"
```

For `apps/desktop`, add:
```json
"lint": "eslint 'src/**/*.ts'"
```

- [ ] **Step 5: Run lint and fix initial violations**

Run:
```bash
npm run lint
```
Expected: Some violations (likely `no-console`, `@typescript-eslint/no-explicit-any`). Fix or suppress with inline comments. Document any suppressions in `.claude/skills/lint-suppressions.md`.

- [ ] **Step 6: Verify turbo lint works**

Run:
```bash
npx turbo lint
```
Expected: All 7 packages run lint, all pass (0 errors).

- [ ] **Step 7: Commit**

```bash
git add eslint.config.mjs package.json package-lock.json packages/*/package.json apps/desktop/package.json
git commit -m "feat: add ESLint flat config with typescript-eslint"
```

---

### Task 2: Prettier config

**Files:**
- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Modify: `package.json` (add devDependency, add format scripts)

- [ ] **Step 1: Install Prettier**

Run:
```bash
npm install -D prettier
```

- [ ] **Step 2: Create `.prettierrc.json`**

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "semi": true
}
```

- [ ] **Step 3: Create `.prettierignore`**

```
dist/
out/
node_modules/
references/
*.md
package-lock.json
```

- [ ] **Step 4: Add format scripts to root `package.json`**

Add to `scripts`:
```json
"format": "prettier --write 'packages/*/src/**/*.ts' 'apps/*/src/**/*.ts'",
"format:check": "prettier --check 'packages/*/src/**/*.ts' 'apps/*/src/**/*.ts'"
```

- [ ] **Step 5: Run formatter on existing code**

Run:
```bash
npm run format
```
Expected: Some files reformatted. Review changes with `git diff` to confirm nothing broken.

- [ ] **Step 6: Verify format check passes**

Run:
```bash
npm run format:check
```
Expected: All files pass (exit 0).

- [ ] **Step 7: Commit**

```bash
git add .prettierrc.json .prettierignore package.json package-lock.json
git add -A packages/ apps/
git commit -m "feat: add Prettier config and format existing code"
```

---

### Task 3: Vitest workspace config

**Files:**
- Create: `vitest.config.ts` (root)
- Create: `packages/platform/vitest.config.ts`
- Create: `packages/connectors/vitest.config.ts`
- Create: `packages/ui/vitest.config.ts`
- Create: `packages/electron/vitest.config.ts`
- Modify: `packages/platform/package.json` (add test script + vitest devDep)
- Modify: `packages/connectors/package.json` (add test script + vitest devDep)
- Modify: `packages/ui/package.json` (add test script + vitest devDep)
- Modify: `packages/electron/package.json` (add test script + vitest devDep)

- [ ] **Step 1: Add Vitest to packages that don't have it**

Add `"vitest": "^3.0.0"` to `devDependencies` in `packages/platform/package.json`, `packages/connectors/package.json`, `packages/ui/package.json`, `packages/electron/package.json`. Then run:
```bash
npm install
```

- [ ] **Step 2: Create `vitest.config.ts` for each package missing it**

For `packages/platform/vitest.config.ts`, `packages/connectors/vitest.config.ts`, `packages/ui/vitest.config.ts`, `packages/electron/vitest.config.ts` — all identical:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Add test scripts to packages missing them**

For `packages/platform`, `packages/connectors`, `packages/ui`, `packages/electron` — add to `scripts`:
```json
"test": "vitest run"
```

- [ ] **Step 4: Create root `vitest.config.ts` with projects**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*'],
  },
});
```

Note: Using `projects` (not deprecated `workspace`) per Vitest 3.2+.

- [ ] **Step 5: Verify vitest discovers all packages**

Run:
```bash
npx vitest run
```
Expected: Vitest discovers projects for base, platform, agent, connectors, ui, electron. Tests in base (di, events) and agent (mock-agent) pass. Other packages report 0 tests (no test files yet — that's OK).

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts packages/*/vitest.config.ts packages/*/package.json package-lock.json
git commit -m "feat: add Vitest workspace config across all packages"
```

---

### Task 4: Playwright config for Electron e2e

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/app-launches.spec.ts`
- Modify: `package.json` (add devDependency, add e2e script)

- [ ] **Step 1: Install Playwright**

Run:
```bash
npm install -D @playwright/test playwright
```

Note: We do NOT run `npx playwright install` — we're testing an Electron app, not a browser. The Electron binary comes from the `electron` package already in `apps/desktop`.

- [ ] **Step 2: Create `playwright.config.ts`**

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
});
```

Note: Electron tests don't use `webServer` or browser projects. Each test file launches the Electron app directly using Playwright's `_electron` API.

- [ ] **Step 3: Create `tests/e2e/app-launches.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appPath = resolve(__dirname, '../../apps/desktop');

test.describe('Electron app launch', () => {
  test('window opens and renders HTML', async () => {
    const electronApp = await electron.launch({
      args: [resolve(appPath, 'out/main/index.js')],
      cwd: appPath,
    });

    const page = await electronApp.firstWindow();

    // Window should have a title
    const title = await page.title();
    expect(title).toBeTruthy();

    // Renderer should have loaded HTML content
    const body = await page.locator('body').textContent();
    expect(body).toBeTruthy();

    // Window should have reasonable dimensions
    const size = await page.evaluate(() => ({
      width: globalThis.innerWidth,
      height: globalThis.innerHeight,
    }));
    expect(size.width).toBeGreaterThan(400);
    expect(size.height).toBeGreaterThan(300);

    await electronApp.close();
  });
});
```

- [ ] **Step 4: Add e2e scripts to root `package.json`**

Add to `scripts`:
```json
"e2e": "playwright test",
"e2e:headed": "playwright test --headed"
```

- [ ] **Step 5: Build the app and run the e2e test**

Run:
```bash
npm run desktop:build && npm run e2e
```
Expected: Electron app launches, test passes (window opens, has content, reasonable size).

If it fails, debug:
- Check that `apps/desktop/out/main/index.js` exists after build
- Check the args path in the test matches the actual output
- Run `npx playwright test --debug` for step-through

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts tests/e2e/app-launches.spec.ts package.json package-lock.json
git commit -m "feat: add Playwright e2e config with Electron app-launch test"
```

---

## Chunk 2: Package Scripts, Unit Tests, and CI

### Task 5: Add type-check script and missing package scripts

**Files:**
- Modify: `package.json` (add type-check script)

- [ ] **Step 1: Add type-check alias to root `package.json`**

Add to root `package.json` scripts:
```json
"type-check": "turbo build"
```

Since all compilable packages use `tsc` for build, `turbo build` already type-checks. This alias makes CI scripts more readable.

- [ ] **Step 2: Verify all turbo tasks resolve**

Run:
```bash
npx turbo build && npx turbo lint && npx turbo test
```
Expected: All three complete successfully.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "feat: add type-check script alias"
```

---

### Task 6: Unit test stubs for packages without tests

Each package needs at least one test to verify Vitest resolves cross-package imports. Packages that already have tests (base, agent) are skipped.

**Files:**
- Create: `packages/platform/src/__tests__/ipc.test.ts`
- Create: `packages/connectors/src/__tests__/index.test.ts`
- Create: `packages/ui/src/__tests__/index.test.ts`
- Create: `packages/electron/src/__tests__/index.test.ts`

- [ ] **Step 1: Read each package's index.ts to know what to import**

Read `packages/platform/src/index.ts`, `packages/connectors/src/index.ts`, `packages/ui/src/index.ts`, `packages/electron/src/index.ts` to find real exports for each test.

- [ ] **Step 2: Create platform test**

`packages/platform/src/__tests__/ipc.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
// Import a real export from the platform package
// Adjust this import based on what index.ts actually exports
import { IpcChannels } from '../ipc.js';

describe('platform package', () => {
  it('exports IPC channel definitions', () => {
    expect(IpcChannels).toBeDefined();
  });
});
```

Adjust the import to match actual exports found in Step 1.

- [ ] **Step 3: Create connectors test**

`packages/connectors/src/__tests__/index.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import * as connectors from '../index.js';

describe('connectors package', () => {
  it('exports module', () => {
    expect(connectors).toBeDefined();
  });
});
```

- [ ] **Step 4: Create UI test**

`packages/ui/src/__tests__/index.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import * as ui from '../index.js';

describe('ui package', () => {
  it('exports module', () => {
    expect(ui).toBeDefined();
  });
});
```

If the import triggers DOM APIs at module load time, install jsdom and configure the vitest config:
```bash
npm install -D jsdom --workspace=packages/ui
```
Then update `packages/ui/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'jsdom',
  },
});
```

- [ ] **Step 5: Create electron test**

`packages/electron/src/__tests__/index.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';

// Mock electron module since we're not in an Electron runtime
vi.mock('electron', () => ({
  app: { getAppPath: () => '/mock', getPath: () => '/mock' },
  BrowserWindow: class {},
  ipcMain: { handle: vi.fn() },
}));

import * as electronPkg from '../index.js';

describe('electron package', () => {
  it('exports module', () => {
    expect(electronPkg).toBeDefined();
  });
});
```

Adjust the mock based on what `electron` APIs the package actually imports at the top level.

- [ ] **Step 6: Run all tests**

Run:
```bash
npx vitest run
```
Expected: All 6 packages have at least 1 passing test.

- [ ] **Step 7: Commit**

```bash
git add packages/*/src/__tests__/
git commit -m "feat: add unit test stubs for all packages"
```

---

### Task 7: Phase 0 smoke test

**Files:**
- Create: `tests/smoke/phase0.ts`

- [ ] **Step 0: Install tsx for running TypeScript smoke tests**

Run:
```bash
npm install -D tsx
```

- [ ] **Step 1: Create `tests/smoke/phase0.ts`**

```typescript
import { header, autoStep, step, summary } from './helpers.js';
import { execFileSync } from 'child_process';

const root = new URL('../../', import.meta.url).pathname;

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
```

- [ ] **Step 2: Test the smoke test runner**

Run:
```bash
npx tsx tests/smoke/phase0.ts
```
Expected: Automated steps pass, interactive steps prompt for user input.

- [ ] **Step 3: Commit**

```bash
git add tests/smoke/phase0.ts package.json package-lock.json
git commit -m "feat: add Phase 0 smoke test"
```

---

### Task 8: GitHub Actions CI pipeline

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - name: Lint
        run: npx turbo lint

      - name: Format check
        run: npm run format:check

      - name: Type check and build
        run: npx turbo build

      - name: Unit tests
        run: npx vitest run

  build-electron:
    needs: lint-and-test
    strategy:
      matrix:
        os: [macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - name: Build Electron app
        run: npm run desktop:build

      - name: E2E smoke test (macOS only)
        if: runner.os == 'macOS'
        run: npx playwright test
```

Note: E2E tests only on macOS for now. Windows CI needs display server setup for Electron tests.

- [ ] **Step 2: Commit**

```bash
mkdir -p .github/workflows
git add .github/workflows/ci.yml
git commit -m "feat: add GitHub Actions CI pipeline (lint, test, build)"
```

---

### Task 9: Changesets for version management

**Files:**
- Create: `.changeset/config.json`
- Modify: `package.json` (add devDependency, add changeset scripts)

- [ ] **Step 1: Install Changesets**

Run:
```bash
npm install -D @changesets/cli
```

- [ ] **Step 2: Initialize changesets**

Run:
```bash
npx changeset init
```
Expected: Creates `.changeset/` directory with `config.json` and a README.

- [ ] **Step 3: Verify the config**

Read `.changeset/config.json` and ensure it has:
```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.1.1/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "restricted",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

Adjust `access` to `"restricted"` (private packages) and `baseBranch` to `"main"` if not already set.

- [ ] **Step 4: Add changeset scripts to root `package.json`**

Add to `scripts`:
```json
"changeset": "changeset",
"version": "changeset version",
"release": "changeset publish"
```

- [ ] **Step 5: Commit**

```bash
git add .changeset/ package.json package-lock.json
git commit -m "feat: add Changesets for version management"
```

---

### Task 10: electron-builder config for packaging

**Files:**
- Create: `electron-builder.yml`
- Modify: `apps/desktop/package.json` (add build scripts)
- Modify: `package.json` (add desktop:build:mac/win scripts)

- [ ] **Step 1: Install electron-builder**

Run:
```bash
npm install -D electron-builder
```

- [ ] **Step 2: Create `electron-builder.yml` in project root**

```yaml
appId: com.gho-work.desktop
productName: GHO Work
directories:
  buildResources: apps/desktop/resources
  output: release
files:
  - apps/desktop/out/**
  - packages/*/dist/**
  - '!**/.vscode/*'
  - '!**/src/*'
  - '!**/*.ts'
  - '!**/*.map'
# asarUnpack for better-sqlite3 will be added in Phase 1 when the dependency is introduced
win:
  executableName: gho-work
  target:
    - nsis
nsis:
  artifactName: ${name}-${version}-setup.${ext}
  shortcutName: GHO Work
  uninstallDisplayName: GHO Work
  oneClick: false
  allowToChangeInstallationDirectory: true
mac:
  target:
    - dmg
  category: public.app-category.productivity
dmg:
  artifactName: ${name}-${version}.${ext}
linux:
  target:
    - AppImage
  category: Office
npmRebuild: false
```

- [ ] **Step 3: Add build scripts to `apps/desktop/package.json`**

Add to scripts:
```json
"build:win": "electron-vite build && electron-builder --win --config ../../electron-builder.yml",
"build:mac": "electron-vite build && electron-builder --mac --config ../../electron-builder.yml",
"build:linux": "electron-vite build && electron-builder --linux --config ../../electron-builder.yml"
```

- [ ] **Step 4: Add convenience scripts to root `package.json`**

Add to scripts:
```json
"desktop:build:mac": "cd apps/desktop && npm run build:mac",
"desktop:build:win": "cd apps/desktop && npm run build:win"
```

- [ ] **Step 5: Add `release/` to `.gitignore`**

Append to `.gitignore`:
```
release/
```

- [ ] **Step 6: Test packaging on current platform**

Run (on macOS):
```bash
npm run desktop:build:mac
```
Expected: Produces a `.dmg` file in `release/` directory.

- [ ] **Step 7: Commit**

```bash
git add electron-builder.yml apps/desktop/package.json package.json package-lock.json .gitignore
git commit -m "feat: add electron-builder config for DMG/NSIS packaging"
```

---

## Chunk 3: Final Verification

### Task 11: End-to-end acceptance verification

This task verifies all Phase 0 acceptance criteria are met.

- [ ] **Step 1: Verify `npm run dev` launches Electron**

Run:
```bash
npm run desktop:dev
```
Expected: Electron window appears with the workbench UI. Ctrl+C to stop.

- [ ] **Step 2: Verify `npm run desktop:build` produces built app**

Run:
```bash
npm run desktop:build
```
Expected: `apps/desktop/out/` contains main/index.js, preload/index.js, renderer/ files.

- [ ] **Step 3: Verify all packages resolve cross-references**

Run:
```bash
npx turbo build
```
Expected: All 7 packages build successfully. No import resolution errors.

- [ ] **Step 4: Verify vitest passes with at least one test per package**

Run:
```bash
npx vitest run
```
Expected: 6 packages with tests, all pass.

- [ ] **Step 5: Verify Playwright e2e passes**

Run:
```bash
npm run desktop:build && npm run e2e
```
Expected: `app-launches.spec.ts` passes.

- [ ] **Step 6: Verify lint and format pass**

Run:
```bash
npx turbo lint && npm run format:check
```
Expected: Both pass (exit 0).

- [ ] **Step 7: Run Phase 0 smoke test**

Run:
```bash
npx tsx tests/smoke/phase0.ts
```
Expected: All automated steps pass. Interactive steps require manual verification.

- [ ] **Step 8: Final commit — update implementation plan checkboxes**

Update `docs/IMPLEMENTATION_PLAN.md`: check off all Phase 0 deliverables and acceptance criteria.

```bash
git add docs/IMPLEMENTATION_PLAN.md
git commit -m "docs: mark Phase 0 deliverables complete"
```
