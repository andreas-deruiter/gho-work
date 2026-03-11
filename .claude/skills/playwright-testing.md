# Playwright Testing for Electron

> Adapted from [github/awesome-copilot](https://github.com/github/awesome-copilot/tree/main/plugins/testing-automation) (MIT)

Use when writing e2e tests, exploring the app for testable flows, or generating Playwright tests from scenarios.

## Explore App for Test Cases

Before writing tests, explore the running app to identify key user flows.

### Process

1. Launch the app: `npm run desktop:dev`
2. Navigate to the app using Playwright MCP or manual exploration
3. Identify and interact with 3-5 core features or user flows
4. Document the user interactions, relevant UI elements (and their locators), and expected outcomes
5. Propose test cases based on the exploration

### Output Format

```markdown
## Exploration Summary

### User Flow: [name]
- **Steps:** [what the user does]
- **Locators:** [CSS selectors, roles, test IDs used]
- **Expected outcome:** [what should happen]
- **Edge cases:** [what could go wrong]
```

## Generate Playwright Test from Scenario

Given a scenario, generate a Playwright test. Do NOT generate test code prematurely.

### Process

1. If no scenario provided, ask the user for one
2. Run through the scenario steps manually first using the Playwright MCP tools
3. Verify each step works as expected before writing test code
4. Only after all steps are validated, write the Playwright TypeScript test
5. Save the test file in `tests/e2e/`
6. Execute the test and iterate until it passes

### Test Structure

```typescript
import { test, expect, _electron as electron } from '@playwright/test';

test.describe('Feature: [name]', () => {
  test('should [expected behavior]', async () => {
    // Launch Electron app
    const electronApp = await electron.launch({
      args: ['apps/desktop/out/main/index.js'],
    });
    const window = await electronApp.firstWindow();

    // Interact like a real user
    await window.getByRole('textbox').fill('test input');
    await window.getByRole('button', { name: 'Send' }).click();

    // Wait for actual result, not just element presence
    await expect(window.getByText('expected result')).toBeVisible();

    // Verify transient UI is gone
    await expect(window.locator('.loading')).not.toBeVisible();

    await electronApp.close();
  });
});
```

## Key Rules (from CLAUDE.md)

- **Exercise real user flows** — don't just check "element exists"
- Every test: input -> action -> wait for completion -> verify final state
- Verify absence of transient UI (loading indicators, spinners)
- Run with: `npx playwright test`
- Headed mode for debugging: `npx playwright test --headed`

## Electron-Specific Patterns

### Launching the app

```typescript
const electronApp = await electron.launch({
  args: ['apps/desktop/out/main/index.js'],
  env: { ...process.env, NODE_ENV: 'test' },
});
```

### Getting the main window

```typescript
const window = await electronApp.firstWindow();
// Or wait for a specific window
const window = await electronApp.waitForEvent('window');
```

### IPC testing

```typescript
// Evaluate in main process
const result = await electronApp.evaluate(async ({ app }) => {
  return app.getPath('userData');
});
```

### Waiting for renderer ready

```typescript
await window.waitForSelector('#app > *', { state: 'attached' });
```

## Locator Strategy (priority order)

1. `getByRole()` — accessible roles (best)
2. `getByText()` — visible text
3. `getByTestId()` — `data-testid` attributes
4. CSS selectors — last resort

## Debugging Failed Tests

```bash
# Run with UI mode
npx playwright test --ui

# Run specific test with trace
npx playwright test tests/e2e/chat.spec.ts --trace on

# View trace
npx playwright show-trace test-results/trace.zip
```
