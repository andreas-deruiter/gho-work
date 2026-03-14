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
    // The inner sidebar widget (.sidebar inside .workbench-sidebar) is hidden via display:none
    const sidebarDisplay = await page.locator('.workbench-sidebar .sidebar').evaluate(
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

  test('Appearance is the default active nav item', async () => {
    await openSettings();
    const activeNavItem = page.locator('.settings-nav-item.active');
    await expect(activeNavItem).toBeVisible({ timeout: 3000 });
    await expect(activeNavItem).toHaveText('Appearance');
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
