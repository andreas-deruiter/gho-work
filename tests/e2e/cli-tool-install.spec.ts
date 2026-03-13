/**
 * E2E test: CLI tool install via unified conversational flow.
 *
 * Clicking the Install button for a CLI tool creates an install conversation
 * and navigates to the chat panel. This test verifies the complete UX flow:
 *   connector sidebar → CLI tool section → Install button → chat panel → agent response.
 */
import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

const appPath = resolve(__dirname, '../../apps/desktop');

// Unique data dir to avoid cross-test state pollution
const userDataDir = resolve(__dirname, '../../.e2e-userdata-cli-tool-install');
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

test.describe('CLI tool install via unified flow', () => {
  // ------------------------------------------------------------------ step 1
  test('navigate to Connectors panel', async () => {
    await page.click('.activity-bar-item[data-item="connectors"]');
    await expect(page.locator('.connector-sidebar')).toBeVisible({ timeout: 5000 });
  });

  // ------------------------------------------------------------------ step 2
  test('CLI tools section is visible', async () => {
    await expect(page.locator('.connector-group-cli')).toBeVisible({ timeout: 10000 });
  });

  // ------------------------------------------------------------------ step 3
  test('at least one Install button is visible for a CLI tool', async () => {
    // Mock mode includes tools that are not installed, which show Install buttons
    const installBtn = page.locator('.cli-tool-list-item .cli-tool-btn').filter({ hasText: 'Install' }).first();
    await expect(installBtn).toBeVisible({ timeout: 10000 });
  });

  // ------------------------------------------------------------------ step 4
  test('clicking Install navigates to chat panel', async () => {
    const installBtn = page.locator('.cli-tool-list-item .cli-tool-btn').filter({ hasText: 'Install' }).first();
    await installBtn.click();

    // The workbench should switch to the chat panel
    await expect(page.locator('.chat-panel')).toBeVisible({ timeout: 10000 });
  });

  // ------------------------------------------------------------------ step 5
  test('agent responds in the install conversation', async () => {
    // Wait for the assistant message to appear — this confirms the full wiring:
    // Install button → IPC → conversation created → navigated to chat → agent processed → response rendered
    await expect(page.locator('.chat-message-assistant').first()).toBeVisible({ timeout: 30000 });
  });
});
