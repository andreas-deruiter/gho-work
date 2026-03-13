import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

const appPath = resolve(__dirname, '../../apps/desktop');
const userDataDir = resolve(__dirname, '../../.e2e-userdata-markdown');
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

test.describe('Chat markdown rendering', () => {
  test('help command renders with proper HTML elements, not raw markdown', async () => {
    // Use the /help slash command which returns markdown with
    // **bold**, `code`, and - list items
    const input = page.locator('.chat-input');
    await expect(input).toBeVisible();

    await input.fill('/');
    const dropdown = page.locator('.slash-dropdown');
    await expect(dropdown).toBeVisible({ timeout: 2000 });

    const helpItem = page.locator('.slash-dropdown-item', { hasText: '/help' });
    await helpItem.click();

    // Wait for the help message to appear
    const assistantMsg = page.locator('.chat-message-assistant').last();
    await expect(assistantMsg).toBeVisible({ timeout: 5000 });

    const content = assistantMsg.locator('.chat-message-content');

    // Verify markdown elements are rendered as HTML, not raw syntax
    await expect(content.locator('strong').first()).toBeVisible();
    await expect(content.locator('code').first()).toBeVisible();
    await expect(content.locator('li').first()).toBeVisible();

    // Verify no raw markdown syntax is visible in text
    const text = await content.textContent();
    expect(text).not.toContain('**');

    // Take screenshot for visual verification
    await page.screenshot({
      path: 'tests/e2e/screenshots/chat-markdown.png',
      fullPage: true,
    });
  });
});
