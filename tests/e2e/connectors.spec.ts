import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

// Playwright compiles TS to CJS, so __dirname is available
const appPath = resolve(__dirname, '../../apps/desktop');

// Pre-seed onboarding-complete so the workbench loads directly
const userDataDir = resolve(__dirname, '../../.e2e-userdata-connectors');
mkdirSync(userDataDir, { recursive: true });
writeFileSync(resolve(userDataDir, 'onboarding-complete.json'), '{"complete":true}');

let electronApp: ElectronApplication;
let page: Page;
const consoleMessages: { type: string; text: string }[] = [];

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: [resolve(appPath, 'out/main/index.js'), '--mock'],
    cwd: appPath,
    env: { ...process.env, GHO_USER_DATA_DIR: userDataDir },
  });
  page = await electronApp.firstWindow();

  // Collect console messages to check for connector/MCP errors
  page.on('console', (msg) => {
    consoleMessages.push({ type: msg.type(), text: msg.text() });
  });
});

test.afterAll(async () => {
  await electronApp.close();
});

test.describe('Connector service wiring', () => {
  test('app launches without crashes', async () => {
    const title = await page.title();
    expect(title).toBeTruthy();

    const body = await page.locator('body').textContent();
    expect(body).toBeTruthy();
  });

  test('workbench renders activity bar and main panel', async () => {
    await expect(page.locator('.workbench-activity-bar')).toBeVisible();
    await expect(page.locator('.workbench-main')).toBeVisible();
  });

  test('no CONNECTOR or MCP error messages in console', async () => {
    // Allow a short moment for any async startup errors to surface
    await page.waitForTimeout(1000);

    const connectorErrors = consoleMessages.filter(
      (msg) =>
        msg.type === 'error' &&
        (msg.text.includes('CONNECTOR') || msg.text.includes('MCP')),
    );

    expect(
      connectorErrors,
      `Unexpected connector/MCP errors in console: ${JSON.stringify(connectorErrors)}`,
    ).toHaveLength(0);
  });
});
