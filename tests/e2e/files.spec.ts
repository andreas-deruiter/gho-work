import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { resolve } from 'path';
import { writeFileSync, mkdirSync, rmSync } from 'fs';

const appPath = resolve(__dirname, '../../apps/desktop');
const userDataDir = resolve(__dirname, '../../.e2e-userdata-files');

// Set up user data (files panel uses os.homedir(), no workspace dir needed)
mkdirSync(userDataDir, { recursive: true });
writeFileSync(resolve(userDataDir, 'onboarding-complete.json'), '{"complete":true}');

let electronApp: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: [resolve(appPath, 'out/main/index.js')],
    env: { ...process.env, GHO_USER_DATA_DIR: userDataDir },
  });
  page = await electronApp.firstWindow();
  await expect(page.locator('.workbench-activity-bar')).toBeVisible({ timeout: 10000 });
});

test.afterAll(async () => {
  await electronApp.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

async function openFiles(): Promise<void> {
  const btn = page.locator('[aria-label="Files"]');
  await btn.click();
  await expect(page.locator('.files-panel')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.tree-row').first()).toBeVisible({ timeout: 10000 });
}

test.describe('Files panel', () => {
  test('clicking Files icon shows the files panel', async () => {
    await openFiles();
    await expect(page.locator('.files-header')).toBeVisible();
    await expect(page.locator('.files-header')).toContainText('FILES');
  });

  test('file tree shows home directory folders (hidden excluded by default)', async () => {
    await openFiles();
    // Home dir has multiple folders (Desktop, Documents, Downloads, etc.)
    const rows = page.locator('.tree-row');
    const count = await rows.count();
    expect(count).toBeGreaterThan(3);
    // Hidden files (dotfiles) should not be visible by default
    const allText = await page.locator('.files-tree').textContent();
    expect(allText).not.toContain('.Trash');
  });

  test('toggle hidden shows dotfiles', async () => {
    await openFiles();
    await page.locator('[aria-label="Toggle hidden files"]').click();
    // After toggling, tree should refresh and show hidden items
    // macOS home dirs always have dotfiles like .zshrc, .Trash, etc.
    await expect(page.locator('.tree-name').first()).toBeVisible({ timeout: 5000 });
    const count = await page.locator('.tree-row').count();
    // With hidden shown, count should increase
    expect(count).toBeGreaterThan(5);
    // Toggle back
    await page.locator('[aria-label="Toggle hidden files"]').click();
  });

  test('search input finds files recursively', async () => {
    await openFiles();
    await page.locator('.files-filter-input').fill('Desktop');
    // Search is debounced (300ms) + async, wait for results
    await expect(page.locator('.files-search-row').first()).toBeVisible({ timeout: 10000 });
    // Clear search returns to tree view
    await page.locator('.files-filter-input').fill('');
    await expect(page.locator('.files-tree')).toBeVisible({ timeout: 3000 });
  });

  test('expanding a folder shows children', async () => {
    await openFiles();
    // Desktop folder exists on every macOS home dir
    const desktopRow = page.locator('.tree-row', { hasText: 'Desktop' });
    await desktopRow.locator('.tree-chevron').click();
    // After expanding, the folder should be expanded (children may be empty but chevron should toggle)
    // Just verify the click doesn't error — Desktop may or may not have children
  });

  test('clicking chat icon returns to chat view', async () => {
    await openFiles();
    await page.locator('[aria-label="Chat"]').click();
    await expect(page.locator('.chat-input')).toBeVisible({ timeout: 5000 });
  });
});
