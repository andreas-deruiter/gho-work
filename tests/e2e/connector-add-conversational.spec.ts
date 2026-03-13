/**
 * E2E test: conversational connector add flow.
 *
 * Clicking "Add Connector" opens a setup conversation in the chat panel
 * (Task 11 behavior). This test verifies the full UI wiring:
 *   button → IPC → conversation creation → navigation to chat → agent response.
 */
import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

const appPath = resolve(__dirname, '../../apps/desktop');

// Unique data dir to avoid cross-test state pollution
const userDataDir = resolve(__dirname, '../../.e2e-userdata-connector-add-conversational');
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

test.describe('Conversational connector add', () => {
  // ------------------------------------------------------------------ step 1
  test('navigate to Connectors panel', async () => {
    await page.click('.activity-bar-item[data-item="connectors"]');
    await expect(page.locator('.connector-sidebar')).toBeVisible({ timeout: 5000 });
  });

  // ------------------------------------------------------------------ step 2
  test('Add Connector button is visible', async () => {
    const addBtn = page.locator('.connector-add-btn');
    await expect(addBtn).toBeVisible({ timeout: 5000 });
  });

  // ------------------------------------------------------------------ step 3
  test('clicking Add Connector navigates to chat panel', async () => {
    const addBtn = page.locator('.connector-add-btn');
    await addBtn.click();

    // The workbench should switch to the chat panel
    await expect(page.locator('.chat-panel')).toBeVisible({ timeout: 10000 });
  });

  // ------------------------------------------------------------------ step 4
  test('agent responds in the setup conversation', async () => {
    // Wait for the assistant message to appear — this confirms the full wiring:
    // IPC call → conversation created → navigated to chat → agent processed → response rendered
    await expect(page.locator('.chat-message-assistant').first()).toBeVisible({ timeout: 30000 });
  });
});
