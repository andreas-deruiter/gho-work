/**
 * E2E test: skill registry isolation via --skills-path flag.
 *
 * Launches the app with --skills-path pointing at a test fixture directory,
 * verifying the registry wiring works and the app starts successfully.
 */
import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

const appPath = resolve(__dirname, '../../apps/desktop');
const fixtureSkillsPath = resolve(__dirname, 'fixtures/skills');

const userDataDir = resolve(__dirname, '../../.e2e-userdata-skill-isolation');
mkdirSync(userDataDir, { recursive: true });
writeFileSync(resolve(userDataDir, 'onboarding-complete.json'), '{"complete":true}');

let electronApp: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: [
      resolve(appPath, 'out/main/index.js'),
      '--mock',
      '--skills-path', fixtureSkillsPath,
    ],
    cwd: appPath,
    env: { ...process.env, GHO_USER_DATA_DIR: userDataDir },
  });
  page = await electronApp.firstWindow();
  await page.waitForSelector('.workbench-activity-bar', { timeout: 15000 });
});

test.afterAll(async () => {
  await electronApp?.close();
});

test('app launches successfully with --skills-path override', async () => {
  // Verify the app started and rendered the workbench
  await expect(page.locator('.workbench-activity-bar')).toBeVisible();
  await expect(page.locator('.workbench-main')).toBeVisible();
});

test('workbench is functional with isolated skills', async () => {
  // Verify the chat input is present and functional
  const input = page.locator('.chat-input');
  await expect(input).toBeVisible({ timeout: 5000 });
  await expect(input).toBeEnabled();
});
