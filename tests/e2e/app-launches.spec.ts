import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { resolve } from 'path';

// Playwright compiles TS to CJS, so __dirname is available
const appPath = resolve(__dirname, '../../apps/desktop');

test.describe('Electron app launch', () => {
  test('window opens and renders HTML', async () => {
    const electronApp = await electron.launch({
      args: [resolve(appPath, 'out/main/index.js')],
      cwd: appPath,
    });

    const page = await electronApp.firstWindow();

    // Window should have a title
    const title = await page.title();
    expect(title).toBeTruthy();

    // Renderer should have loaded HTML content
    const body = await page.locator('body').textContent();
    expect(body).toBeTruthy();

    // Window should have reasonable dimensions
    const size = await page.evaluate(() => ({
      width: globalThis.innerWidth,
      height: globalThis.innerHeight,
    }));
    expect(size.width).toBeGreaterThan(400);
    expect(size.height).toBeGreaterThan(300);

    await electronApp.close();
  });
});
