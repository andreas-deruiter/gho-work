import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { resolve } from 'path';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';

const appPath = resolve(__dirname, '../../apps/desktop');

// Each test group gets its own isolated userData directory
function createFreshUserData(name: string): string {
  const dir = resolve(__dirname, `../../.e2e-userdata-${name}`);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true });
  }
  mkdirSync(dir, { recursive: true });
  return dir;
}

test.describe('Onboarding flow — first launch', () => {
  let electronApp: ElectronApplication;
  let page: Page;
  const userDataDir = createFreshUserData('onboarding-fresh');

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: [resolve(appPath, 'out/main/index.js')],
      cwd: appPath,
      env: { ...process.env, GHO_USER_DATA_DIR: userDataDir },
    });
    page = await electronApp.firstWindow();
  });

  test.afterAll(async () => {
    await electronApp.close();
  });

  test('shows welcome step on first launch', async () => {
    // The onboarding flow should appear, not the workbench
    await expect(page.locator('.onboarding-flow')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.onboarding-welcome')).toBeVisible();

    // Logo mark
    const logoMark = page.locator('.onb-logo-mark');
    await expect(logoMark).toBeVisible();
    await expect(logoMark).toHaveText('G');

    // Heading
    await expect(page.locator('.onb-welcome-content h2')).toHaveText('Welcome to GHO Work');

    // Feature bullets
    const features = page.locator('.onb-feature');
    expect(await features.count()).toBe(3);

    // CTA button
    const startBtn = page.locator('.btn-primary.btn-large');
    await expect(startBtn).toBeVisible();
    await expect(startBtn).toHaveText('Sign in with GitHub');

    // Workbench should NOT be visible
    await expect(page.locator('.workbench')).toBeHidden();

    // Take screenshot for verification
    await page.screenshot({ path: resolve(__dirname, '../../.e2e-screenshots/onboarding-welcome.png') });
  });

  test('clicking "Sign in" transitions to auth step', async () => {
    const startBtn = page.locator('.btn-primary.btn-large');
    await startBtn.click();

    // Auth step should appear
    await expect(page.locator('.onboarding-auth')).toBeVisible({ timeout: 5000 });

    // It will show either checking spinner or a result state
    // (depends on whether gh CLI is installed on the test machine)
    const authContent = page.locator('.onb-auth-content');
    await expect(authContent).toBeVisible();

    await page.screenshot({ path: resolve(__dirname, '../../.e2e-screenshots/onboarding-auth.png') });
  });
});

test.describe('Onboarding flow — skip when complete', () => {
  let electronApp: ElectronApplication;
  let page: Page;

  // Pre-seed onboarding as complete
  const userDataDir = createFreshUserData('onboarding-complete');
  writeFileSync(resolve(userDataDir, 'onboarding-complete.json'), '{"complete":true}');

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: [resolve(appPath, 'out/main/index.js')],
      cwd: appPath,
      env: { ...process.env, GHO_USER_DATA_DIR: userDataDir },
    });
    page = await electronApp.firstWindow();
  });

  test.afterAll(async () => {
    await electronApp.close();
  });

  test('skips onboarding and shows workbench directly', async () => {
    // Workbench should appear
    await expect(page.locator('.workbench')).toBeVisible({ timeout: 10000 });

    // Onboarding should NOT be visible
    await expect(page.locator('.onboarding-flow')).toBeHidden();
    await expect(page.locator('.onboarding-welcome')).toBeHidden();

    // Chat panel should be available
    await expect(page.locator('.chat-panel')).toBeVisible();

    await page.screenshot({ path: resolve(__dirname, '../../.e2e-screenshots/onboarding-skipped.png') });
  });
});
