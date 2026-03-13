/**
 * E2E test: connector disconnect and reconnect.
 *
 * Adds a connector programmatically, verifies it connects, disconnects it,
 * reconnects it, and verifies tools are still available after reconnect.
 */
import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

const appPath = resolve(__dirname, '../../apps/desktop');

// Unique data dir to avoid cross-test state pollution
const userDataDir = resolve(__dirname, '../../.e2e-userdata-connector-reconnect');
mkdirSync(userDataDir, { recursive: true });
writeFileSync(resolve(userDataDir, 'onboarding-complete.json'), '{"complete":true}');

// Path to the test MCP server fixture
const FIXTURE_PATH = resolve(__dirname, '../fixtures/test-mcp-server.mjs');

// IPC type helper used in page.evaluate calls
type GhoIPC = { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> };

let electronApp: ElectronApplication;
let page: Page;
let connectorAdded = false;

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: [resolve(appPath, 'out/main/index.js'), '--mock'],
    cwd: appPath,
    env: { ...process.env, GHO_USER_DATA_DIR: userDataDir },
  });
  page = await electronApp.firstWindow();
  await page.waitForSelector('.workbench-activity-bar', { timeout: 15000 });
});

test.afterAll(async () => {
  // Clean up: remove the test connector if still present
  if (connectorAdded) {
    try {
      await page.evaluate(
        (id) =>
          (window as unknown as { ghoWorkIPC: GhoIPC }).ghoWorkIPC.invoke('connector:remove', { id }),
        'reconnect-test',
      );
    } catch {
      // Ignore — test may have already cleaned up or app is closing
    }
  }
  await electronApp?.close();
});

test.describe('Connector disconnect and reconnect', () => {
  // ------------------------------------------------------------------ step 1
  test('navigate to Connectors panel', async () => {
    await page.click('.activity-bar-item[data-item="connectors"]');
    await expect(page.locator('.connector-sidebar')).toBeVisible({ timeout: 5000 });
  });

  // ------------------------------------------------------------------ step 2
  test('add test fixture connector via IPC', async () => {
    await page.evaluate(
      (fixturePath) =>
        (window as unknown as { ghoWorkIPC: GhoIPC }).ghoWorkIPC.invoke('connector:add', {
          id: 'reconnect-test',
          type: 'local_mcp',
          name: 'Reconnect Test',
          transport: 'stdio',
          command: 'node',
          args: [fixturePath],
          enabled: true,
          status: 'disconnected',
        }),
      FIXTURE_PATH,
    );
    connectorAdded = true;

    // The main process sends CONNECTOR_LIST_CHANGED which auto-refreshes the sidebar
    const item = page.locator('.connector-list-item').filter({ hasText: 'Reconnect Test' });
    await expect(item).toBeVisible({ timeout: 10000 });
  });

  // ------------------------------------------------------------------ step 3
  test('connector status turns connected (green)', async () => {
    const item = page.locator('.connector-list-item').filter({ hasText: 'Reconnect Test' });
    const dot = item.locator('.connector-status-dot');
    await expect(dot).toHaveClass(/status-connected/, { timeout: 20000 });
  });

  // ------------------------------------------------------------------ step 4
  test('open drawer and disconnect connector', async () => {
    const item = page.locator('.connector-list-item').filter({ hasText: 'Reconnect Test' });
    await item.click();

    // Drawer should open
    await expect(page.locator('.connector-drawer-container.drawer-open')).toBeVisible({ timeout: 3000 });

    // Click Disconnect
    const disconnectBtn = page.locator('.drawer-status-btn').filter({ hasText: 'Disconnect' });
    await expect(disconnectBtn).toBeVisible({ timeout: 5000 });
    await disconnectBtn.click();
  });

  // ------------------------------------------------------------------ step 5
  test('status is no longer connected after disconnect', async () => {
    // Close drawer and check sidebar status dot
    await page.keyboard.press('Escape');
    await expect(page.locator('.connector-drawer-container.drawer-open')).toBeHidden({ timeout: 3000 });

    const item = page.locator('.connector-list-item').filter({ hasText: 'Reconnect Test' });
    const dot = item.locator('.connector-status-dot');
    await expect(dot).not.toHaveClass(/status-connected/, { timeout: 10000 });
  });

  // ------------------------------------------------------------------ step 6
  test('click connector and click Connect button', async () => {
    const item = page.locator('.connector-list-item').filter({ hasText: 'Reconnect Test' });
    await item.click();

    // Drawer should open again
    await expect(page.locator('.connector-drawer-container.drawer-open')).toBeVisible({ timeout: 3000 });

    // Click Connect (use exact text match to avoid matching "Test Connection")
    const connectBtn = page.locator('.drawer-status-btn', { hasText: /^Connect$/ });
    await expect(connectBtn).toBeVisible({ timeout: 5000 });
    await connectBtn.click();
  });

  // ------------------------------------------------------------------ step 7
  test('connector reconnects successfully (status green again)', async () => {
    // Close the drawer
    await page.keyboard.press('Escape');
    await expect(page.locator('.connector-drawer-container.drawer-open')).toBeHidden({ timeout: 3000 });

    const item = page.locator('.connector-list-item').filter({ hasText: 'Reconnect Test' });
    const dot = item.locator('.connector-status-dot');
    await expect(dot).toHaveClass(/status-connected/, { timeout: 20000 });
  });

  // ------------------------------------------------------------------ step 8
  test('tools are still listed after reconnect (3 tools)', async () => {
    // Re-open the drawer to verify tools
    const item = page.locator('.connector-list-item').filter({ hasText: 'Reconnect Test' });
    await item.click();

    await expect(page.locator('.connector-drawer-container.drawer-open')).toBeVisible({ timeout: 3000 });

    // Wait for tools to load
    await expect(page.locator('.tool-list-loading')).toBeHidden({ timeout: 10000 });

    // All 3 tools (echo, add, timestamp) should still be present
    const toolRows = page.locator('.tool-row');
    await expect(toolRows).toHaveCount(3, { timeout: 10000 });

    // Close drawer
    await page.keyboard.press('Escape');
  });

  // ------------------------------------------------------------------ step 9
  test('clean up: delete test connector', async () => {
    await page.evaluate(
      (id) =>
        (window as unknown as { ghoWorkIPC: GhoIPC }).ghoWorkIPC.invoke('connector:remove', { id }),
      'reconnect-test',
    );
    connectorAdded = false;

    // Navigate away and back to refresh the sidebar
    await page.click('.activity-bar-item[data-item="chat"]');
    await page.click('.activity-bar-item[data-item="connectors"]');

    // Connector should no longer appear
    await expect(
      page.locator('.connector-list-item').filter({ hasText: 'Reconnect Test' }),
    ).toBeHidden({ timeout: 5000 });
  });
});
