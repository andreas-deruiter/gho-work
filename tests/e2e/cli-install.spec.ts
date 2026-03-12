import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

// Playwright compiles TS to CJS, so __dirname is available
const appPath = resolve(__dirname, '../../apps/desktop');

// Pre-seed onboarding-complete so the workbench loads directly
const userDataDir = resolve(__dirname, '../../.e2e-userdata-cli-install');
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
});

test.afterAll(async () => {
  await electronApp.close();
});

test.describe('CLI tool install button flow', () => {
  test('workbench loads with activity bar', async () => {
    await expect(page.locator('.workbench-activity-bar')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.workbench-main')).toBeVisible();
  });

  test('clicking Connectors activity bar item shows connector sidebar', async () => {
    // The activity bar renders buttons with data-item attribute
    const connectorsBtn = page.locator('.activity-bar-item[data-item="connectors"]');
    await expect(connectorsBtn).toBeVisible({ timeout: 5000 });
    await connectorsBtn.click();

    // The connector sidebar should become visible (Phase 3B's ConnectorSidebarWidget)
    await expect(page.locator('.connector-sidebar')).toBeVisible({ timeout: 5000 });
  });

  test('connector sidebar shows CLI tool items', async () => {
    // Wait for CLI tool items to render (ConnectorSidebarWidget uses .cli-tool-list-item)
    await expect(page.locator('.cli-tool-list-item').first()).toBeVisible({ timeout: 10000 });
  });

  test('Install button creates a conversation and switches to chat', async () => {
    // Mock mode provides tools: gh (installed), git (installed), pandoc (not installed), etc.
    // There should be Install buttons for the missing tools.
    const installBtns = page.locator('.cli-tool-btn');
    await expect(installBtns.first()).toBeVisible({ timeout: 5000 });

    // Click the first Install button
    await installBtns.first().click();

    // App should switch to chat panel with the install conversation loaded
    await expect(page.locator('.chat-panel')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.chat-messages')).toBeVisible();

    // The conversation header should contain "Install" (e.g., "Install Pandoc")
    const header = page.locator('.chat-header');
    await expect(header).toBeVisible({ timeout: 5000 });
    await expect(header).toContainText('Install', { timeout: 3000 });
  });

  test('install conversation appears in sidebar conversation list', async () => {
    // Switch to chat sidebar to see the conversation list
    await page.click('.activity-bar-item[data-item="chat"]');
    await expect(page.locator('.conversation-list-panel')).toBeVisible({ timeout: 5000 });

    // The conversation list should contain an "Install" conversation
    const convItems = page.locator('.conversation-list-item');
    await expect(convItems.first()).toBeVisible({ timeout: 5000 });
    // At least one conversation should have "Install" in its title
    await expect(page.locator('.conversation-list-item:has-text("Install")')).toBeVisible({ timeout: 3000 });
  });
});
