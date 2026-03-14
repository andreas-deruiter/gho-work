import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { resolve } from 'path';
import { writeFileSync, mkdirSync, rmSync } from 'fs';

const appPath = resolve(__dirname, '../../apps/desktop');
const userDataDir = resolve(__dirname, '../../.e2e-userdata-files');
const workspaceDir = resolve(__dirname, '../../.e2e-workspace-files');

// Set up user data and workspace
mkdirSync(userDataDir, { recursive: true });
writeFileSync(resolve(userDataDir, 'onboarding-complete.json'), '{"complete":true}');
mkdirSync(resolve(workspaceDir, 'src'), { recursive: true });
writeFileSync(resolve(workspaceDir, 'readme.md'), '# Test');
writeFileSync(resolve(workspaceDir, 'data.csv'), 'a,b,c');
writeFileSync(resolve(workspaceDir, 'src/index.ts'), 'console.log("hello")');
writeFileSync(resolve(workspaceDir, '.hidden'), 'secret');

let electronApp: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: [resolve(appPath, 'out/main/index.js')],
    cwd: workspaceDir,
    env: { ...process.env, GHO_USER_DATA_DIR: userDataDir },
  });
  page = await electronApp.firstWindow();
  await expect(page.locator('.workbench-activity-bar')).toBeVisible({ timeout: 10000 });
});

test.afterAll(async () => {
  await electronApp.close();
  rmSync(workspaceDir, { recursive: true, force: true });
});

async function openFiles(): Promise<void> {
  const btn = page.locator('[aria-label="Files"]');
  await btn.click();
  await expect(page.locator('.files-panel')).toBeVisible({ timeout: 5000 });
}

test.describe('Files panel', () => {
  test('clicking Files icon shows the files panel', async () => {
    await openFiles();
    await expect(page.locator('.files-header')).toBeVisible();
    await expect(page.locator('.files-header')).toContainText('FILES');
  });

  test('file tree shows workspace files (hidden excluded)', async () => {
    await openFiles();
    await expect(page.locator('.tree-row')).toHaveCount(3, { timeout: 5000 });
    const allText = await page.locator('.files-tree').textContent();
    expect(allText).not.toContain('.hidden');
  });

  test('toggle hidden shows dotfiles', async () => {
    await openFiles();
    await page.locator('[aria-label="Toggle hidden files"]').click();
    await expect(page.locator('.tree-name', { hasText: '.hidden' })).toBeVisible({ timeout: 3000 });
    // Toggle back
    await page.locator('[aria-label="Toggle hidden files"]').click();
  });

  test('search input finds files recursively', async () => {
    await openFiles();
    await page.locator('.files-filter-input').fill('index');
    // Search is debounced (300ms) + async, wait for results
    await expect(page.locator('.files-search-row')).toHaveCount(1, { timeout: 5000 });
    await expect(page.locator('.files-search-name', { hasText: 'index.ts' })).toBeVisible();
    // Clear search returns to tree view
    await page.locator('.files-filter-input').fill('');
    await expect(page.locator('.files-tree')).toBeVisible({ timeout: 3000 });
  });

  test('expanding a folder shows children', async () => {
    await openFiles();
    const srcRow = page.locator('.tree-row', { hasText: 'src' });
    await srcRow.locator('.tree-chevron').click();
    await expect(page.locator('.tree-name', { hasText: 'index.ts' })).toBeVisible({ timeout: 3000 });
  });

  test('clicking chat icon returns to chat view', async () => {
    await openFiles();
    await page.locator('[aria-label="Chat"]').click();
    await expect(page.locator('.chat-input')).toBeVisible({ timeout: 5000 });
  });
});
