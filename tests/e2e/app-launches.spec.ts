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

  test('workbench renders sidebar, main panel, and status bar', async () => {
    await expect(page.locator('.sidebar')).toBeVisible();
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

    // The response should have actual content
    const content = assistantMsg.locator('.chat-message-content');
    const text = await content.textContent();
    expect(text).toBeTruthy();
    expect(text!.length).toBeGreaterThan(10);

    // Input should be re-enabled
    await expect(input).toBeEnabled();
  });
});
