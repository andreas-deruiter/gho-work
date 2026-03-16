import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

const appPath = resolve(__dirname, '../../apps/desktop');

// Pre-seed onboarding-complete so the workbench loads directly
const userDataDir = resolve(__dirname, '../../.e2e-userdata-todo-list');
mkdirSync(userDataDir, { recursive: true });
writeFileSync(resolve(userDataDir, 'onboarding-complete.json'), '{"complete":true}');

let electronApp: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: [resolve(appPath, 'out/main/index.js'), '--mock'],
    cwd: appPath,
    env: {
      ...process.env,
      GHO_USER_DATA_DIR: userDataDir,
    },
  });
  page = await electronApp.firstWindow();
  await page.waitForSelector('.workbench-activity-bar', { timeout: 15000 });
});

test.afterAll(async () => {
  await electronApp?.close();
});

test('todo list appears for complex prompts', async () => {
  const input = page.locator('.chat-input');
  await input.fill('Help me create a project plan');
  await input.press('Enter');

  // Wait for assistant response
  const assistantMsg = page.locator('.chat-message-assistant').first();
  await expect(assistantMsg).toBeVisible({ timeout: 10000 });

  // Open info panel
  await page.keyboard.press('Meta+Shift+b');
  const panelContainer = page.locator('.info-panel-container');
  await expect(panelContainer).toBeVisible({ timeout: 3000 });

  // Todo list section should appear (panel auto-shows when data arrives)
  const todoSection = page.locator('.info-section-container').filter({ hasText: 'Progress' });
  await expect(todoSection).toBeVisible({ timeout: 5000 });

  // Should have timeline nodes (todo items)
  const todoNodes = todoSection.locator('.info-timeline-node');
  const todoCount = await todoNodes.count();
  expect(todoCount).toBeGreaterThan(0);

  // Header should show "Progress"
  const header = todoSection.locator('.info-section-header');
  await expect(header).toContainText('Progress');

  // Take screenshot evidence
  mkdirSync(resolve(__dirname, 'screenshots'), { recursive: true });
  await page.screenshot({
    path: resolve(__dirname, 'screenshots/todo-list-e2e.png'),
  });
});
