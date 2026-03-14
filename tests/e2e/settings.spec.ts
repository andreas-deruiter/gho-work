import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

// Playwright compiles TS to CJS, so __dirname is available
const appPath = resolve(__dirname, '../../apps/desktop');

// Pre-seed onboarding-complete so the workbench loads directly
const userDataDir = resolve(__dirname, '../../.e2e-userdata-settings');
mkdirSync(userDataDir, { recursive: true });
writeFileSync(resolve(userDataDir, 'onboarding-complete.json'), '{"complete":true}');

// Seed a test skill so the toggle test has something to work with.
// app.getAppPath() returns apps/desktop/out/main when launched directly,
// so bundled skills resolve to apps/desktop/skills (../../skills from out/main).
const testSkillDir = resolve(appPath, 'skills', 'test');
mkdirSync(testSkillDir, { recursive: true });
writeFileSync(
  resolve(testSkillDir, 'demo.md'),
  '---\ndescription: Demo skill for E2E testing\n---\nThis is a test skill.\n',
);

let electronApp: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: [resolve(appPath, 'out/main/index.js')],
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
  // If settings is already active, clicking again won't fire the event.
  // First navigate away to chat to ensure a fresh settings navigation.
  const chatBtn = page.locator('[aria-label="Chat"]');
  const isSettingsOpen = await page.locator('.settings-layout').isVisible();
  if (isSettingsOpen) {
    await chatBtn.click();
    await expect(page.locator('.chat-input')).toBeVisible({ timeout: 5000 });
  }

  const settingsBtn = page.locator('[aria-label="Settings"]');
  await expect(settingsBtn).toBeVisible({ timeout: 5000 });
  await settingsBtn.click();
  await expect(page.locator('.settings-layout')).toBeVisible({ timeout: 5000 });
}

/** Helper: navigate away from settings by clicking the chat icon */
async function openChat(): Promise<void> {
  const chatBtn = page.locator('[aria-label="Chat"]');
  await expect(chatBtn).toBeVisible({ timeout: 5000 });
  await chatBtn.click();
  await expect(page.locator('.chat-input')).toBeVisible({ timeout: 5000 });
}

test.describe('Settings panel', () => {
  test('clicking gear icon shows settings layout', async () => {
    await openSettings();
    await expect(page.locator('.settings-layout')).toBeVisible();
  });

  test('sidebar is hidden when settings is open', async () => {
    await openSettings();
    // The sidebar wrapper (.workbench-sidebar) is hidden via display:none
    const sidebarDisplay = await page.locator('.workbench-sidebar').evaluate(
      el => (el as HTMLElement).style.display,
    );
    expect(sidebarDisplay).toBe('none');
  });

  test('chat panel is hidden when settings is open', async () => {
    await openSettings();
    // The chat container wrapper should not be visible (display: none)
    const chatDisplay = await page.locator('.workbench-chat-container').evaluate(
      el => (el as HTMLElement).style.display,
    );
    expect(chatDisplay).toBe('none');
  });

  test('General is the default active nav item', async () => {
    await openSettings();
    const activeNavItem = page.locator('.settings-nav-item.active');
    await expect(activeNavItem).toBeVisible({ timeout: 3000 });
    await expect(activeNavItem).toHaveText('General');
  });

  test('three theme cards are displayed', async () => {
    await openSettings();
    const cards = page.locator('.theme-card');
    await expect(cards).toHaveCount(3, { timeout: 5000 });
  });

  test('clicking Dark theme card applies data-theme="dark" to html element', async () => {
    await openSettings();

    // Click the Dark theme card
    const darkCard = page.locator('.theme-card[data-theme="dark"]');
    await expect(darkCard).toBeVisible({ timeout: 3000 });
    await darkCard.click();

    // The html element should now have data-theme="dark"
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark', { timeout: 3000 });
  });

  test('clicking Skills nav item shows skills section', async () => {
    await openSettings();

    // Click the "Skills" nav item
    const skillsNavItem = page.locator('.settings-nav-item', { hasText: 'Skills' });
    await expect(skillsNavItem).toBeVisible({ timeout: 3000 });
    await skillsNavItem.click();

    // Skills page should appear
    await expect(page.locator('.settings-page-skills')).toBeVisible({ timeout: 5000 });

    // Nav item should now be active
    await expect(page.locator('.settings-nav-item.active')).toHaveText('Skills');
  });

  test('theme change applies correct background color CSS variable', async () => {
    await openSettings();

    // Ensure we're on the Appearance page (previous test may have left us on Skills)
    const appearanceNav = page.locator('.settings-nav-item', { hasText: 'General' });
    await appearanceNav.click();
    await expect(page.locator('.theme-card')).toHaveCount(3, { timeout: 3000 });

    // Click the Light theme card
    const lightCard = page.locator('.theme-card[data-theme="light"]');
    await expect(lightCard).toBeVisible({ timeout: 3000 });
    await lightCard.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light', { timeout: 3000 });

    // Verify the actual computed background color is white
    const lightBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(lightBg).toBe('rgb(255, 255, 255)');

    // Click the Dark theme card
    const darkCard = page.locator('.theme-card[data-theme="dark"]');
    await expect(darkCard).toBeVisible({ timeout: 3000 });
    await darkCard.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark', { timeout: 3000 });

    // Verify the actual computed background color is dark
    const darkBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(darkBg).toBe('rgb(30, 30, 30)');
  });

  test('theme persists across app restart', async () => {
    await openSettings();

    // Set theme to Light
    const lightCard = page.locator('.theme-card[data-theme="light"]');
    await expect(lightCard).toBeVisible({ timeout: 3000 });
    await lightCard.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light', { timeout: 3000 });

    // Close the app
    await electronApp.close();

    // Relaunch with the same userDataDir so persistence works
    electronApp = await electron.launch({
      args: [resolve(appPath, 'out/main/index.js')],
      cwd: appPath,
      env: { ...process.env, GHO_USER_DATA_DIR: userDataDir },
    });
    page = await electronApp.firstWindow();
    await expect(page.locator('.workbench-activity-bar')).toBeVisible({ timeout: 10000 });

    // Verify the html element still has data-theme="light" after restart
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light', { timeout: 5000 });
  });

  test('skill toggle switches are rendered and clickable', async () => {
    await openSettings();

    // Navigate to Skills page
    const skillsNav = page.locator('.settings-nav-item', { hasText: 'Skills' });
    await skillsNav.click();
    await expect(page.locator('.settings-page-skills')).toBeVisible({ timeout: 5000 });

    // The initial skill list may be empty if the async scan hasn't finished.
    // Click Rescan to force a refresh and wait for skills to load.
    const rescanBtn = page.locator('.skill-rescan-btn');
    await expect(rescanBtn).toBeVisible({ timeout: 3000 });
    await rescanBtn.click();

    // Wait for skills to load and toggle switches to appear
    const toggles = page.locator('.skill-toggle');
    await expect(toggles.first()).toBeVisible({ timeout: 10000 });

    // Check initial state
    const firstToggle = toggles.first();
    await expect(firstToggle).toHaveAttribute('role', 'switch');
    await expect(firstToggle).toHaveAttribute('aria-checked', 'true');

    // Click to disable
    await firstToggle.click();

    // Verify toggle flipped
    await expect(firstToggle).toHaveAttribute('aria-checked', 'false');

    // Verify disclaimer appeared
    const disclaimer = page.locator('.skill-toggle-disclaimer');
    await expect(disclaimer).toBeVisible();
    await expect(disclaimer).toContainText('new conversations');

    // Click again to re-enable
    await firstToggle.click();
    await expect(firstToggle).toHaveAttribute('aria-checked', 'true');
  });

  test('clicking chat activity bar item returns to chat view', async () => {
    await openSettings();
    await openChat();

    // Sidebar should be visible again
    await expect(page.locator('.workbench-sidebar')).toBeVisible({ timeout: 5000 });

    // Chat input should be visible again
    await expect(page.locator('.chat-input')).toBeVisible({ timeout: 5000 });

    // Settings layout should be hidden (display: none)
    const settingsDisplay = await page.locator('.settings-layout').evaluate(
      el => (el as HTMLElement).style.display,
    );
    expect(settingsDisplay).toBe('none');
  });
});
