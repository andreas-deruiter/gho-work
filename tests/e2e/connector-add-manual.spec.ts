/**
 * E2E test: manual connector add, tool verify, toggle, disconnect, remove.
 *
 * The "Add Connector" button (post-Task 11) opens a setup conversation
 * instead of the config form. This test bypasses that by invoking
 * window.ghoWorkIPC.invoke('connector:add', ...) directly from the renderer,
 * which is exactly what the workbench does when the form fires onDidSaveConnector.
 *
 * After adding, the test exercises real UI flows: open drawer, verify tools,
 * toggle a tool, disconnect, and delete via the config form delete button.
 */
import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

const appPath = resolve(__dirname, '../../apps/desktop');

// Unique data dir per test file to avoid cross-test state pollution
const userDataDir = resolve(__dirname, '../../.e2e-userdata-connector-add-manual');
mkdirSync(userDataDir, { recursive: true });
writeFileSync(resolve(userDataDir, 'onboarding-complete.json'), '{"complete":true}');

// Path to the test MCP server fixture
const fixturePath = resolve(__dirname, '../fixtures/test-mcp-server.mjs');

let electronApp: ElectronApplication;
let page: Page;

// Track connector ID so we can clean up even if tests fail mid-way
let connectorId: string | null = null;

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
  // Clean up: remove the test connector if it still exists
  if (connectorId) {
    try {
      await page.evaluate(
        (id) => (window as unknown as { ghoWorkIPC: { invoke: (ch: string, ...a: unknown[]) => Promise<unknown> } })
          .ghoWorkIPC.invoke('connector:remove', { id }),
        connectorId,
      );
    } catch {
      // Ignore — already removed by the test or the app is closing
    }
  }
  await electronApp?.close();
});

test.describe('Manual connector add / verify / disconnect / remove', () => {
  // ------------------------------------------------------------------ step 1
  test('navigate to Connectors panel', async () => {
    await page.click('.activity-bar-item[data-item="connectors"]');
    await expect(page.locator('.sidebar-panel-connectors')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.connector-sidebar')).toBeVisible({ timeout: 5000 });
  });

  // ------------------------------------------------------------------ step 2
  test('add connector programmatically via IPC', async () => {
    // Generate a stable ID so we can reference it across tests
    const id = `e2e-test-connector-${Date.now()}`;
    connectorId = id;

    const result = await page.evaluate(
      ({ id: cid, fixturePath: fp }) =>
        (window as unknown as { ghoWorkIPC: { invoke: (ch: string, ...a: unknown[]) => Promise<unknown> } })
          .ghoWorkIPC.invoke('connector:add', {
            id: cid,
            type: 'local_mcp',
            name: 'Test Echo Server',
            transport: 'stdio',
            command: 'node',
            args: [fp],
            enabled: true,
            status: 'disconnected',
          }),
      { id, fixturePath },
    );

    // The add IPC returns success
    expect(result).toBeTruthy();

    // The main process sends CONNECTOR_LIST_CHANGED which auto-refreshes the sidebar
    const item = page.locator('.connector-list-item').filter({ hasText: 'Test Echo Server' });
    await expect(item).toBeVisible({ timeout: 10000 });
  });

  // ------------------------------------------------------------------ step 3
  test('connector status dot turns green (connected) within timeout', async () => {
    // Wait for the connector item to show connected status
    // The main process starts the MCP server and emits CONNECTOR_STATUS_CHANGED
    const item = page.locator('.connector-list-item').filter({ hasText: 'Test Echo Server' });
    await expect(item).toBeVisible({ timeout: 5000 });

    // The status dot inside the item should become status-connected
    const dot = item.locator('.connector-status-dot');
    await expect(dot).toHaveClass(/status-connected/, { timeout: 20000 });
  });

  // ------------------------------------------------------------------ step 4
  test('open drawer, verify 3 tools listed', async () => {
    // Click the connector to open the drawer
    const item = page.locator('.connector-list-item').filter({ hasText: 'Test Echo Server' });
    await item.click();

    // Drawer should open
    await expect(page.locator('.connector-drawer-container.drawer-open')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('.connector-drawer-panel')).toBeVisible({ timeout: 3000 });

    // Tools should load — the tool group for this connector should appear
    // Wait for the loading indicator to disappear
    await expect(page.locator('.tool-list-loading')).toBeHidden({ timeout: 10000 });

    // 3 tools: echo, add, timestamp
    const toolRows = page.locator('.tool-row');
    await expect(toolRows).toHaveCount(3, { timeout: 10000 });

    // Verify each expected tool is present
    await expect(page.locator('.tool-row[data-tool-name="echo"]')).toBeVisible();
    await expect(page.locator('.tool-row[data-tool-name="add"]')).toBeVisible();
    await expect(page.locator('.tool-row[data-tool-name="timestamp"]')).toBeVisible();
  });

  // ------------------------------------------------------------------ step 5
  test('toggle echo tool off via checkbox', async () => {
    const echoRow = page.locator('.tool-row[data-tool-name="echo"]');
    const echoCheckbox = echoRow.locator('input[type="checkbox"]');

    // Should start enabled (checked)
    await expect(echoCheckbox).toBeChecked();

    // Uncheck to disable
    await echoCheckbox.click();
    await expect(echoCheckbox).not.toBeChecked();

    // Give IPC time to persist the toggle (connector:update IPC call)
    await page.waitForTimeout(500);

    // The checkbox must remain unchecked (not reverted by error)
    await expect(echoCheckbox).not.toBeChecked();
    await expect(echoRow.locator('.tool-toggle-error')).toBeHidden();
  });

  // ------------------------------------------------------------------ step 6
  test('disconnect connector, status dot turns grey', async () => {
    // The drawer should still be open
    await expect(page.locator('.connector-drawer-container.drawer-open')).toBeVisible({ timeout: 3000 });

    // Click Disconnect
    const disconnectBtn = page.locator('.drawer-status-btn').filter({ hasText: 'Disconnect' });
    await expect(disconnectBtn).toBeVisible({ timeout: 5000 });
    await disconnectBtn.click();

    // Close drawer and check sidebar status dot
    await page.keyboard.press('Escape');
    await expect(page.locator('.connector-drawer-container.drawer-open')).toBeHidden({ timeout: 3000 });

    // The sidebar item's dot should no longer be connected
    const item = page.locator('.connector-list-item').filter({ hasText: 'Test Echo Server' });
    const dot = item.locator('.connector-status-dot');
    await expect(dot).not.toHaveClass(/status-connected/, { timeout: 10000 });
  });

  // ------------------------------------------------------------------ step 7
  test('delete connector, verify removed from list', async () => {
    // Click the connector to re-open the drawer
    const item = page.locator('.connector-list-item').filter({ hasText: 'Test Echo Server' });
    await item.click();
    await expect(page.locator('.connector-drawer-container.drawer-open')).toBeVisible({ timeout: 3000 });

    // The config form (read-only) has an Edit button — click it to enter edit mode
    const editBtn = page.locator('.config-edit-btn');
    await expect(editBtn).toBeVisible({ timeout: 5000 });
    await editBtn.click();

    // The delete button should now appear
    const deleteBtn = page.locator('.config-delete-btn');
    await expect(deleteBtn).toBeVisible({ timeout: 3000 });

    // Intercept the confirm dialog and accept it
    page.once('dialog', (dialog) => void dialog.accept());
    await deleteBtn.click();

    // After deletion: drawer should close and item should disappear from sidebar
    await expect(page.locator('.connector-drawer-container.drawer-open')).toBeHidden({ timeout: 5000 });
    await expect(page.locator('.connector-list-item').filter({ hasText: 'Test Echo Server' })).toBeHidden({ timeout: 5000 });

    // Mark as cleaned up so afterAll skip doesn't try to remove again
    connectorId = null;
  });
});
