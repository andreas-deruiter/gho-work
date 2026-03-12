---
name: playwright-testing
description: Playwright CLI-based E2E testing for Electron — exploration, test generation, screenshots, debugging
---

# Playwright Testing for Electron (CLI)

Use the Playwright **CLI** (not MCP) for all E2E testing, app exploration, and screenshot capture.

## Prerequisites

```bash
# Check install
npx playwright --version

# Install browsers (may need sudo on macOS)
npx playwright install
# If permission denied: ask the user to run `sudo npx playwright install`
```

## Taking Screenshots

Use Playwright's screenshot API via `npx playwright test` or a quick script:

```bash
# Run tests and capture screenshots on failure (automatic)
npx playwright test --screenshot on

# Take a screenshot during a test (in test code)
await page.screenshot({ path: 'screenshot.png', fullPage: true });

# Quick one-off screenshot script
npx tsx -e "
import { _electron as electron } from 'playwright';
import { resolve } from 'path';
const app = await electron.launch({ args: [resolve('apps/desktop/out/main/index.js')], cwd: resolve('apps/desktop') });
const page = await app.firstWindow();
await page.waitForLoadState('domcontentloaded');
await page.screenshot({ path: '/tmp/app-screenshot.png', fullPage: true });
await app.close();
console.log('Screenshot saved to /tmp/app-screenshot.png');
"
```

## Exploring the App

Use Playwright's codegen or interactive mode to explore the running app:

```bash
# Interactive UI mode — lets you see the app and step through tests
npx playwright test --ui

# Debug mode — pauses at each step with inspector
npx playwright test --debug

# Run headed (visible browser window)
npx playwright test --headed
```

For Electron apps, exploration is best done via a test that pauses:

```typescript
test('explore app', async () => {
  // App is launched in beforeAll
  await page.pause(); // Opens Playwright Inspector
});
```

## Test Structure (Electron)

```typescript
import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { resolve } from 'path';

const appPath = resolve(__dirname, '../../apps/desktop');

let electronApp: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: [resolve(appPath, 'out/main/index.js')],
    cwd: appPath,
  });
  page = await electronApp.firstWindow();
});

test.afterAll(async () => {
  await electronApp.close();
});

test('should [expected behavior]', async () => {
  // Interact like a real user
  await page.locator('.chat-input').fill('test input');
  await page.locator('.chat-input').press('Enter');

  // Wait for actual result, not just element presence
  await expect(page.locator('.chat-message-assistant')).toBeVisible({ timeout: 10000 });

  // Verify transient UI is gone
  await expect(page.locator('.chat-cursor')).toBeHidden({ timeout: 30000 });
});
```

## Key Rules (from CLAUDE.md)

- **Exercise real user flows** — don't just check "element exists"
- Every test: input -> action -> wait for completion -> verify final state
- Verify absence of transient UI (loading indicators, spinners, cursors)
- Tests live in `tests/e2e/`
- Config at `playwright.config.ts`

## CLI Commands Reference

```bash
# Run all e2e tests
npx playwright test

# Run specific test file
npx playwright test tests/e2e/chat.spec.ts

# Run with trace (for debugging failures)
npx playwright test --trace on

# View trace from test results
npx playwright show-trace test-results/trace.zip

# Run headed (visible window)
npx playwright test --headed

# Debug mode (step through with inspector)
npx playwright test --debug

# UI mode (interactive test runner)
npx playwright test --ui

# List available tests
npx playwright test --list

# Generate HTML report
npx playwright show-report
```

## Locator Strategy (priority order)

1. `getByRole()` — accessible roles (best)
2. `getByText()` — visible text
3. `getByTestId()` — `data-testid` attributes
4. CSS class selectors (`.chat-input`) — acceptable for our app since we control all classes
5. Complex CSS selectors — last resort

## Electron-Specific Patterns

### IPC testing from Playwright
```typescript
// Evaluate in main process context
const result = await electronApp.evaluate(async ({ app }) => {
  return app.getPath('userData');
});
```

### Waiting for renderer ready
```typescript
await page.waitForSelector('.chat-panel', { state: 'attached' });
```

### Screenshots in tests
```typescript
// Full page screenshot
await page.screenshot({ path: 'screenshots/chat-flow.png', fullPage: true });

// Element screenshot
await page.locator('.chat-messages').screenshot({ path: 'screenshots/messages.png' });
```

## When to Use Playwright (not optional)

Per CLAUDE.md HARD GATE: **After completing any phase or feature that touches UI, IPC, or service wiring, you MUST verify the app works.** Playwright E2E tests are the primary mechanism for this verification.

If you cannot run Playwright (missing browsers, permission issues):
1. **Ask the user for help** (e.g., "Could you run `sudo npx playwright install`?")
2. **Do NOT silently switch to a different approach**
3. **Do NOT skip E2E verification**
