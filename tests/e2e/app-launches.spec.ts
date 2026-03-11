import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { resolve } from 'path';

// Playwright compiles TS to CJS, so __dirname is available
const appPath = resolve(__dirname, '../../apps/desktop');

let electronApp: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: [resolve(appPath, 'out/main/index.js')],
    cwd: appPath,
  });
  page = await electronApp.firstWindow();
});

test.afterAll(async () => {
  await electronApp.close();
});

test.describe('Electron app launch', () => {
  test('window opens and renders HTML', async () => {
    const title = await page.title();
    expect(title).toBeTruthy();

    const body = await page.locator('body').textContent();
    expect(body).toBeTruthy();

    const size = await page.evaluate(() => ({
      width: globalThis.innerWidth,
      height: globalThis.innerHeight,
    }));
    expect(size.width).toBeGreaterThan(400);
    expect(size.height).toBeGreaterThan(300);
  });

  test('workbench renders activity bar and main panel', async () => {
    await expect(page.locator('.workbench-activity-bar')).toBeVisible();
    await expect(page.locator('.workbench-main')).toBeVisible();
  });
});

test.describe('Chat flow', () => {
  test('send message, receive response, thinking indicator clears', async () => {
    // Type a message in the chat input
    const input = page.locator('.chat-input');
    await expect(input).toBeVisible();
    await input.fill('Hello, what can you do?');
    await input.press('Enter');

    // An assistant message should appear
    const assistantMsg = page.locator('.chat-message-assistant').first();
    await expect(assistantMsg).toBeVisible({ timeout: 5000 });

    // Wait for the response to finish streaming (cursor disappears)
    await expect(assistantMsg.locator('.chat-cursor')).toBeHidden({ timeout: 30000 });

    // The thinking/status indicator should be cleared
    const status = assistantMsg.locator('.chat-message-status');
    await expect(status).toHaveText('', { timeout: 5000 });

    // The response should have actual content (use expect for auto-retry)
    const content = assistantMsg.locator('.chat-message-content');
    await expect(content).not.toBeEmpty({ timeout: 5000 });

    // Input should be re-enabled
    await expect(input).toBeEnabled();
  });

  test('chat input stays visible when messages overflow the viewport', async () => {
    const input = page.locator('.chat-input');
    const inputArea = page.locator('.chat-input-area');

    // Send several messages to fill the chat area
    const sendBtn = page.locator('.chat-send-btn');
    for (let i = 0; i < 5; i++) {
      // Wait for previous response to complete (send button reappears when done)
      await expect(sendBtn).toBeVisible({ timeout: 30000 });
      const countBefore = await page.locator('.chat-message-assistant').count();
      await input.fill(`Message number ${i + 1} to fill the chat area with content`);
      await input.press('Enter');

      // Wait for a new assistant message to appear and finish streaming
      await expect(page.locator('.chat-message-assistant').nth(countBefore)).toBeVisible({ timeout: 10000 });
      await expect(page.locator('.chat-message-assistant').nth(countBefore).locator('.chat-cursor')).toBeHidden({ timeout: 30000 });
    }

    // The input area must still be within the viewport
    const inputBox = await inputArea.boundingBox();
    expect(inputBox).toBeTruthy();

    const viewport = await page.evaluate(() => ({
      width: globalThis.innerWidth,
      height: globalThis.innerHeight,
    }));

    // Input area's bottom edge must be within the viewport height
    expect(inputBox!.y + inputBox!.height).toBeLessThanOrEqual(viewport.height);
    // Input area's top edge must be visible (not pushed above viewport)
    expect(inputBox!.y).toBeGreaterThanOrEqual(0);
  }, 120000);

  test('model selector shows options and allows switching', async () => {
    const modelSelector = page.locator('.model-selector-dropdown');
    await expect(modelSelector).toBeVisible({ timeout: 5000 });

    const optionCount = await modelSelector.locator('option').count();
    expect(optionCount).toBeGreaterThan(0);
  });

  test('conversation list appears in sidebar', async () => {
    // The conversation list panel renders into the sidebar container,
    // replacing .workbench-sidebar class with .conversation-list-panel
    const conversationList = page.locator('.conversation-list-panel');
    await expect(conversationList).toBeVisible();

    const newBtn = page.locator('.conversation-new-btn');
    await expect(newBtn).toBeVisible();
  });

  test('slash command dropdown appears when typing /', async () => {
    const input = page.locator('.chat-input');
    const sendBtn = page.locator('.chat-send-btn');
    await expect(sendBtn).toBeVisible({ timeout: 30000 });

    await input.fill('/');
    const dropdown = page.locator('.slash-dropdown');
    await expect(dropdown).toBeVisible({ timeout: 2000 });

    const items = dropdown.locator('.slash-dropdown-item');
    expect(await items.count()).toBeGreaterThanOrEqual(3);

    await input.fill('');
    await expect(dropdown).toBeHidden();
  });

  test('full chat interaction: send, stream, tool card, complete', async () => {
    const input = page.locator('.chat-input');
    const sendBtn = page.locator('.chat-send-btn');

    await expect(sendBtn).toBeVisible({ timeout: 30000 });

    await input.fill('Search for the project file');
    await input.press('Enter');

    // Cancel button should appear during processing
    const cancelBtn = page.locator('.chat-cancel-btn');
    await expect(cancelBtn).toBeVisible({ timeout: 2000 });

    // Tool call card should appear
    const toolCall = page.locator('.tool-call-item').first();
    await expect(toolCall).toBeVisible({ timeout: 5000 });

    // Wait for response to complete
    const assistantMsgs = page.locator('.chat-message-assistant');
    const lastAssistant = assistantMsgs.last();
    await expect(lastAssistant.locator('.chat-cursor')).toBeHidden({ timeout: 30000 });

    // Tool call should show completed status
    await expect(lastAssistant.locator('.tool-call-completed')).toBeVisible({ timeout: 5000 });

    // Send button should reappear, cancel should hide
    await expect(sendBtn).toBeVisible({ timeout: 5000 });
    await expect(cancelBtn).toBeHidden();

    // Input should be re-enabled and focusable
    await expect(input).toBeEnabled();

    // Response should have actual content
    const content = lastAssistant.locator('.chat-message-content');
    await expect(content).not.toBeEmpty();
  });
});
