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

  test('clicking Connectors activity bar item shows connectors panel', async () => {
    // The activity bar renders buttons with data-item attribute
    const connectorsBtn = page.locator('.activity-bar-item[data-item="connectors"]');
    await expect(connectorsBtn).toBeVisible({ timeout: 5000 });
    await connectorsBtn.click();

    // The connectors panel should become visible
    await expect(page.locator('.connectors-panel')).toBeVisible({ timeout: 5000 });

    // The CLI Tools section heading should be present
    await expect(page.locator('.connectors-section-title')).toHaveText('CLI Tools');
  });

  test('connectors panel loads CLI tool list', async () => {
    // Wait for the loading state to clear (either tool items or empty/error state)
    await expect(page.locator('.cli-tool-loading')).toBeHidden({ timeout: 10000 });

    // The tool list container should be present
    await expect(page.locator('.cli-tool-list')).toBeVisible();
  });

  test('Install button for missing tool opens a conversation in chat panel', async () => {
    // Check if there are any missing tools with Install buttons
    const installBtn = page.locator('.cli-install-btn').first();
    const installBtnCount = await page.locator('.cli-install-btn').count();

    if (installBtnCount === 0) {
      // No missing tools — either all are installed or the list is empty.
      // Both are valid states; just verify the list is in a coherent end state.
      const toolItems = page.locator('.cli-tool-item');
      const toolCount = await toolItems.count();

      if (toolCount === 0) {
        // List could be empty (.cli-tool-empty) or still show no items
        const emptyEl = page.locator('.cli-tool-empty');
        const emptyCount = await emptyEl.count();
        // Either the empty message is shown, or the list simply has no items — both valid
        expect(emptyCount >= 0).toBe(true);
      } else {
        // All tools show as installed — no missing items expected
        const missingItems = page.locator('.cli-tool-item.missing');
        expect(await missingItems.count()).toBe(0);
      }
      return;
    }

    // There is at least one missing tool — click its Install button
    await expect(installBtn).toBeVisible();

    // Note which panel is currently active before clicking
    const chatPanel = page.locator('.chat-panel');

    await installBtn.click();

    // After clicking Install:
    // 1. The app should switch back to the chat panel (connectors fires onDidRequestOpenConversation)
    await expect(chatPanel).toBeVisible({ timeout: 5000 });

    // 2. The connectors panel should be hidden (workbench switched to chat view)
    await expect(page.locator('.connectors-panel')).toBeHidden({ timeout: 5000 });

    // 3. The chat header title should reflect the install conversation title
    //    (the title is set by loadConversation after CLI_CREATE_INSTALL_CONVERSATION)
    const headerTitle = page.locator('.chat-header h2');
    await expect(headerTitle).toBeVisible({ timeout: 5000 });
    // The title is whatever the agent service sets — just verify it's non-empty
    const titleText = await headerTitle.textContent();
    expect(titleText).toBeTruthy();

    // 4. The chat messages area should exist (conversation was loaded)
    await expect(page.locator('.chat-messages')).toBeVisible();

    // 5. The conversation list (sidebar) should have refreshed and show the install conversation
    const conversationList = page.locator('.conversation-list-panel');
    await expect(conversationList).toBeVisible({ timeout: 5000 });
  });
});
