import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

const appPath = resolve(__dirname, '../../apps/desktop');

// Pre-seed onboarding-complete so the workbench loads directly
const userDataDir = resolve(__dirname, '../../.e2e-userdata-infopanel');
mkdirSync(userDataDir, { recursive: true });
writeFileSync(resolve(userDataDir, 'onboarding-complete.json'), '{"complete":true}');

let electronApp: ElectronApplication;
let page: Page;

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

test.describe('Info Panel', () => {
  test('starts hidden', async () => {
    await expect(page.locator('.workbench')).toBeVisible();
    const panelContainer = page.locator('.info-panel-container');
    await expect(panelContainer).toBeHidden();
  });

  test('toggles visibility with Cmd+Shift+B', async () => {
    const panelContainer = page.locator('.info-panel-container');

    // Toggle on
    await page.keyboard.press('Meta+Shift+b');
    await expect(panelContainer).toBeVisible();

    // Has correct structure
    await expect(page.locator('.info-panel')).toBeVisible();
    await expect(page.locator('.info-panel-empty')).toBeVisible();

    // Toggle off
    await page.keyboard.press('Meta+Shift+b');
    await expect(panelContainer).toBeHidden();
  });

  test('has correct ARIA attributes', async () => {
    await page.keyboard.press('Meta+Shift+b');
    const panel = page.locator('.info-panel');
    await expect(panel).toHaveAttribute('role', 'complementary');
    await expect(panel).toHaveAttribute('aria-label', 'Task info');
    await page.keyboard.press('Meta+Shift+b'); // close
  });
});
