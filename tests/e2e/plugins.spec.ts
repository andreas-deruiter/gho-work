import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

// Playwright compiles TS to CJS, so __dirname is available
const appPath = resolve(__dirname, '../../apps/desktop');

// Pre-seed onboarding-complete so the workbench loads directly
const userDataDir = resolve(__dirname, '../../.e2e-userdata-plugins');
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
  // Wait for workbench to fully load
  await expect(page.locator('.workbench-activity-bar')).toBeVisible({ timeout: 10000 });
});

test.afterAll(async () => {
  await electronApp.close();
});

/** Helper: navigate to settings by clicking the gear icon */
async function openSettings(): Promise<void> {
  // If settings is already active, click away first to ensure a fresh navigation
  const isSettingsOpen = await page.locator('.settings-layout').isVisible();
  if (isSettingsOpen) {
    const chatBtn = page.locator('[aria-label="Chat"]');
    await chatBtn.click();
    await expect(page.locator('.chat-input')).toBeVisible({ timeout: 5000 });
  }

  const settingsBtn = page.locator('[aria-label="Settings"]');
  await expect(settingsBtn).toBeVisible({ timeout: 5000 });
  await settingsBtn.click();
  await expect(page.locator('.settings-layout')).toBeVisible({ timeout: 5000 });
}

test.describe('Plugins settings page', () => {
  test('Plugins nav item exists in settings sidebar', async () => {
    await openSettings();

    const pluginsNavItem = page.locator('.settings-nav-item', { hasText: 'Plugins' });
    await expect(pluginsNavItem).toBeVisible({ timeout: 3000 });
  });

  test('clicking Plugins nav item shows plugins page', async () => {
    await openSettings();

    const pluginsNavItem = page.locator('.settings-nav-item', { hasText: 'Plugins' });
    await pluginsNavItem.click();

    // Plugins page root element should appear
    await expect(page.locator('.settings-page-plugins')).toBeVisible({ timeout: 5000 });

    // Nav item should be active
    await expect(page.locator('.settings-nav-item.active')).toHaveText('Plugins');
  });

  test('Discover and Installed sub-tabs render', async () => {
    await openSettings();

    const pluginsNavItem = page.locator('.settings-nav-item', { hasText: 'Plugins' });
    await pluginsNavItem.click();
    await expect(page.locator('.settings-page-plugins')).toBeVisible({ timeout: 5000 });

    // Both tab buttons should be visible
    const discoverTab = page.locator('.plugin-tab', { hasText: 'Discover' });
    const installedTab = page.locator('.plugin-tab', { hasText: /Installed/ });

    await expect(discoverTab).toBeVisible({ timeout: 3000 });
    await expect(installedTab).toBeVisible({ timeout: 3000 });
  });

  test('Discover tab is active by default', async () => {
    await openSettings();

    const pluginsNavItem = page.locator('.settings-nav-item', { hasText: 'Plugins' });
    await pluginsNavItem.click();
    await expect(page.locator('.settings-page-plugins')).toBeVisible({ timeout: 5000 });

    // Discover tab should have the active class
    const discoverTab = page.locator('.plugin-tab.active');
    await expect(discoverTab).toBeVisible({ timeout: 3000 });
    await expect(discoverTab).toHaveText('Discover');
  });

  test('Discover tab shows tab bar with Discover and Installed buttons', async () => {
    await openSettings();

    const pluginsNavItem = page.locator('.settings-nav-item', { hasText: 'Plugins' });
    await pluginsNavItem.click();
    await expect(page.locator('.settings-page-plugins')).toBeVisible({ timeout: 5000 });

    // The tab bar should be present with both tabs
    const tabBar = page.locator('.plugin-tab-bar');
    await expect(tabBar).toBeVisible({ timeout: 3000 });

    // Both tab buttons should exist inside the tab bar
    await expect(tabBar.locator('.plugin-tab', { hasText: 'Discover' })).toBeVisible({ timeout: 3000 });
    await expect(tabBar.locator('.plugin-tab', { hasText: /Installed/ })).toBeVisible({ timeout: 3000 });
  });

  test('switching to Installed tab shows installed content', async () => {
    await openSettings();

    const pluginsNavItem = page.locator('.settings-nav-item', { hasText: 'Plugins' });
    await pluginsNavItem.click();
    await expect(page.locator('.settings-page-plugins')).toBeVisible({ timeout: 5000 });

    // Click the Installed tab
    const installedTab = page.locator('.plugin-tab', { hasText: /Installed/ });
    await installedTab.click();

    // Installed tab should now be active
    await expect(installedTab).toHaveClass(/active/);

    // Should show either installed plugin items or an empty state
    const hasItems = await page.locator('.plugin-installed-item').count();
    const hasEmpty = await page.locator('.plugin-empty-state').isVisible();
    expect(hasItems > 0 || hasEmpty).toBe(true);
  });

  test('switching back to Discover tab shows discover content', async () => {
    await openSettings();

    const pluginsNavItem = page.locator('.settings-nav-item', { hasText: 'Plugins' });
    await pluginsNavItem.click();
    await expect(page.locator('.settings-page-plugins')).toBeVisible({ timeout: 5000 });

    // Switch to Installed
    const installedTab = page.locator('.plugin-tab', { hasText: /Installed/ });
    await installedTab.click();
    await expect(installedTab).toHaveClass(/active/);

    // Switch back to Discover
    const discoverTab = page.locator('.plugin-tab', { hasText: 'Discover' });
    await discoverTab.click();

    // Discover tab should be active again and search input visible
    await expect(discoverTab).toHaveClass(/active/);
    await expect(page.locator('.plugin-search-input')).toBeVisible({ timeout: 3000 });
  });

  test('Plugins page title is rendered', async () => {
    await openSettings();

    const pluginsNavItem = page.locator('.settings-nav-item', { hasText: 'Plugins' });
    await pluginsNavItem.click();
    await expect(page.locator('.settings-page-plugins')).toBeVisible({ timeout: 5000 });

    const title = page.locator('.settings-page-plugins .settings-page-title');
    await expect(title).toHaveText('Plugins');
  });
});

test.describe('Connectors settings page', () => {
  test('Connectors nav item exists in settings sidebar', async () => {
    await openSettings();

    const connectorsNavItem = page.locator('.settings-nav-item', { hasText: 'Connectors' });
    await expect(connectorsNavItem).toBeVisible({ timeout: 3000 });
  });

  test('clicking Connectors nav item shows connectors page', async () => {
    await openSettings();

    const connectorsNavItem = page.locator('.settings-nav-item', { hasText: 'Connectors' });
    await connectorsNavItem.click();

    // Connectors page root element should appear
    await expect(page.locator('.settings-page-connectors')).toBeVisible({ timeout: 5000 });

    // Nav item should be active
    await expect(page.locator('.settings-nav-item.active')).toHaveText('Connectors');
  });

  test('Connectors page title is rendered', async () => {
    await openSettings();

    const connectorsNavItem = page.locator('.settings-nav-item', { hasText: 'Connectors' });
    await connectorsNavItem.click();
    await expect(page.locator('.settings-page-connectors')).toBeVisible({ timeout: 5000 });

    const title = page.locator('.settings-page-connectors .settings-page-title');
    await expect(title).toHaveText('Connectors');
  });

  test('navigating between Plugins and Connectors tabs works', async () => {
    await openSettings();

    // Go to Plugins
    const pluginsNavItem = page.locator('.settings-nav-item', { hasText: 'Plugins' });
    await pluginsNavItem.click();
    await expect(page.locator('.settings-page-plugins')).toBeVisible({ timeout: 5000 });

    // Now go to Connectors
    const connectorsNavItem = page.locator('.settings-nav-item', { hasText: 'Connectors' });
    await connectorsNavItem.click();
    await expect(page.locator('.settings-page-connectors')).toBeVisible({ timeout: 5000 });

    // Plugins page should no longer be present
    await expect(page.locator('.settings-page-plugins')).not.toBeVisible();
  });
});
