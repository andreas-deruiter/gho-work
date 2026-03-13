import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

const appPath = resolve(__dirname, '../../apps/desktop');

// Pre-seed onboarding-complete so the workbench loads directly
const userDataDir = resolve(__dirname, '../../.e2e-userdata-connectors-ui');
mkdirSync(userDataDir, { recursive: true });
writeFileSync(resolve(userDataDir, 'onboarding-complete.json'), '{"complete":true}');

let electronApp: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: [resolve(appPath, 'out/main/index.js'), '--mock'],
    cwd: appPath,
    env: { ...process.env, GHO_USER_DATA_DIR: userDataDir },
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

  test('Add Connector opens setup conversation in chat panel', async () => {
    await page.click('.connector-add-btn');
    // Should switch to chat panel with the setup conversation
    await expect(page.locator('.chat-panel')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.chat-messages')).toBeVisible();
  });

  test('switching back to chat shows conversation list', async () => {
    // Previous test switched to chat via setup conversation; switch to connectors first
    await page.click('.activity-bar-item[data-item="connectors"]');
    await expect(page.locator('.connector-sidebar')).toBeVisible({ timeout: 3000 });
    await page.click('.activity-bar-item[data-item="chat"]');
    // The conversation list panel should become visible (ConversationListPanel overwrites
    // the sidebar-panel-chat class with conversation-list-panel during render)
    await expect(page.locator('.conversation-list-panel')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('.conversation-new-btn')).toBeVisible({ timeout: 3000 });
  });
});
