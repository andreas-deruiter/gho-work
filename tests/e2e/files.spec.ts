import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { resolve } from 'path';
import { writeFileSync, mkdirSync, rmSync } from 'fs';

const appPath = resolve(__dirname, '../../apps/desktop');
const userDataDir = resolve(__dirname, '../../.e2e-userdata-documents');
const workspaceDir = resolve(__dirname, '../../.e2e-workspace-documents');

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

async function openDocuments(): Promise<void> {
  const btn = page.locator('[aria-label="Documents"]');
  await btn.click();
  await expect(page.locator('.documents-panel')).toBeVisible({ timeout: 5000 });
}

test.describe('Documents panel', () => {
  test('clicking Documents icon shows the documents panel', async () => {
    await openDocuments();
    await expect(page.locator('.documents-header')).toBeVisible();
    await expect(page.locator('.documents-header')).toContainText('DOCUMENTS');
  });

  test('file tree shows workspace files (hidden excluded)', async () => {
    await openDocuments();
    await expect(page.locator('.tree-row')).toHaveCount(3, { timeout: 5000 });
    const allText = await page.locator('.documents-tree').textContent();
    expect(allText).not.toContain('.hidden');
  });

  test('toggle hidden shows dotfiles', async () => {
    await openDocuments();
    await page.locator('[aria-label="Toggle hidden files"]').click();
    await expect(page.locator('.tree-name', { hasText: '.hidden' })).toBeVisible({ timeout: 3000 });
    // Toggle back
    await page.locator('[aria-label="Toggle hidden files"]').click();
  });

  test('filter input narrows visible files', async () => {
    await openDocuments();
    await page.locator('.documents-filter-input').fill('readme');
    await expect(page.locator('.tree-row')).toHaveCount(1, { timeout: 3000 });
    await page.locator('.documents-filter-input').fill('');
  });

  test('expanding a folder shows children', async () => {
    await openDocuments();
    const srcRow = page.locator('.tree-row', { hasText: 'src' });
    await srcRow.locator('.tree-chevron').click();
    await expect(page.locator('.tree-name', { hasText: 'index.ts' })).toBeVisible({ timeout: 3000 });
  });

  test('clicking chat icon returns to chat view', async () => {
    await openDocuments();
    await page.locator('[aria-label="Chat"]').click();
    await expect(page.locator('.chat-input')).toBeVisible({ timeout: 5000 });
  });
});
