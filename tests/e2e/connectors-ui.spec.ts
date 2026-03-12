import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { resolve } from 'path';

const appPath = resolve(__dirname, '../../apps/desktop');

let electronApp: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: [resolve(appPath, 'out/main/index.js'), '--mock'],
    cwd: appPath,
  });
  page = await electronApp.firstWindow();
  await page.waitForSelector('.workbench-activity-bar', { timeout: 15000 });
});

test.afterAll(async () => {
  await electronApp?.close();
});

test.describe('Connector UI', () => {
  test('activity bar has Connectors button', async () => {
    const btn = page.locator('.activity-bar-item[data-item="connectors"]');
    await expect(btn).toBeVisible();
  });

  test('clicking Connectors shows connector sidebar', async () => {
    await page.click('.activity-bar-item[data-item="connectors"]');
    // The sidebar-panel-connectors container becomes visible
    await expect(page.locator('.sidebar-panel-connectors')).toBeVisible({ timeout: 5000 });
    // The connector-sidebar widget is inside it
    await expect(page.locator('.connector-sidebar')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.connector-add-btn')).toBeVisible();
  });

  test('Add Connector opens drawer with form', async () => {
    await page.click('.connector-add-btn');
    await expect(page.locator('.connector-drawer-container.drawer-open')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('.config-name-input')).toBeVisible();
  });

  test('drawer closes on Escape', async () => {
    await page.keyboard.press('Escape');
    await expect(page.locator('.connector-drawer-container.drawer-open')).not.toBeVisible({ timeout: 3000 });
  });

  test('switching back to chat shows conversation list', async () => {
    await page.click('.activity-bar-item[data-item="chat"]');
    // The conversation list panel should become visible (ConversationListPanel overwrites
    // the sidebar-panel-chat class with conversation-list-panel during render)
    await expect(page.locator('.conversation-list-panel')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('.conversation-new-btn')).toBeVisible({ timeout: 3000 });
  });
});
