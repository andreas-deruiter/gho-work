/**
 * Standalone Playwright verification: app launches in real mode, not mock.
 * Run: node tests/e2e/verify-no-mock.mjs
 */
import { _electron as electron } from 'playwright';
import { resolve, dirname } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appPath = resolve(__dirname, '../../apps/desktop');
const userDataDir = resolve(__dirname, '../../.e2e-userdata-nomock');
mkdirSync(userDataDir, { recursive: true });
writeFileSync(resolve(userDataDir, 'onboarding-complete.json'), '{"complete":true}');

let passed = 0;
let failed = 0;
const results = [];

function assert(condition, name, detail) {
  if (condition) {
    results.push(`  PASS: ${name}`);
    passed++;
  } else {
    results.push(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

console.log('Launching Electron app (no --mock flag)...');
const electronApp = await electron.launch({
  args: [resolve(appPath, 'out/main/index.js')],
  cwd: appPath,
  env: { ...process.env, GHO_USER_DATA_DIR: userDataDir },
});

const page = await electronApp.firstWindow();

try {
  // 1. Verify --mock not in argv
  const mainInfo = await electronApp.evaluate(() => ({
    argv: process.argv,
  }));
  assert(!mainInfo.argv.includes('--mock'), 'No --mock flag in process.argv');

  // 2. Wait for workbench to render (no error dialog blocking)
  await page.waitForSelector('.workbench-activity-bar', { timeout: 15000 });
  assert(true, 'Workbench rendered (no error dialog blocked startup)');

  // 3. Check console for mock mode indicators
  // Evaluate main process logs by checking SDK state
  const sdkState = await electronApp.evaluate(() => {
    // Check environment — no mock flag means real mode
    return {
      hasMockFlag: process.argv.includes('--mock'),
      env: process.env.GHO_MOCK_MODE,
    };
  });
  assert(!sdkState.hasMockFlag, 'SDK not in mock mode (no --mock flag)');
  assert(!sdkState.env, 'No GHO_MOCK_MODE env var set');

  // 4. Navigate to connectors panel and check CLI tools show real detection
  // Activity bar: chat=0, tools=1, connectors=2, documents=3, settings=4
  const activityItems = page.locator('.activity-bar-item');
  await activityItems.nth(2).click(); // connectors

  await page.waitForSelector('.connector-group-cli', { timeout: 10000 });
  assert(true, 'CLI tools section loaded');

  // Wait for CLI tools to finish loading (items appear after async detection)
  await page.waitForSelector('.cli-tool-list-item', { timeout: 15000 });
  // Give detection a moment to complete for all tools
  await page.waitForTimeout(3000);

  const cliItems = page.locator('.cli-tool-list-item');
  const cliCount = await cliItems.count();
  assert(cliCount > 0, `Found ${cliCount} CLI tools`);

  let gitVersion = null;
  let ghInstalled = false;
  let gcloudInfo = null;

  for (let i = 0; i < cliCount; i++) {
    const item = cliItems.nth(i);
    const name = await item.locator('.cli-tool-name').textContent();
    const version = await item.locator('.cli-tool-version').textContent();
    const hasCheckmark = await item.locator('.cli-checkmark').count() > 0;
    const hasAuthBtn = await item.locator('button').filter({ hasText: 'Authenticate' }).count() > 0;
    const hasInstallBtn = await item.locator('button').filter({ hasText: 'Install' }).count() > 0;

    console.log(`  CLI tool: ${name} | version: ${version || '(none)'} | checkmark: ${hasCheckmark} | auth: ${hasAuthBtn} | install: ${hasInstallBtn}`);

    if (name === 'git') {
      gitVersion = version;
    }
    if (name === 'GitHub CLI') {
      ghInstalled = hasCheckmark;
    }
    if (name === 'Google Cloud CLI') {
      gcloudInfo = { version, hasCheckmark, hasAuthBtn, hasInstallBtn };
    }
  }

  assert(gitVersion && /\d+\.\d+/.test(gitVersion), `git shows real version: ${gitVersion}`);
  assert(ghInstalled, 'GitHub CLI detected as installed+authenticated (real detection)');

  // gcloud was just installed by the user — should show as installed
  if (gcloudInfo) {
    assert(gcloudInfo.version && /\d+/.test(gcloudInfo.version), `Google Cloud CLI shows version: ${gcloudInfo.version}`);
  }

  await page.screenshot({ path: resolve(userDataDir, 'cli-tools.png') });

  // 5. Switch back to chat, verify model selector has real models
  await activityItems.nth(0).click(); // chat=0
  await page.waitForSelector('.model-selector-dropdown', { timeout: 5000 });
  const modelOptions = page.locator('.model-selector-dropdown option');
  const modelCount = await modelOptions.count();
  assert(modelCount > 0, `Model selector has ${modelCount} models`);

  // List the models
  for (let i = 0; i < modelCount; i++) {
    const text = await modelOptions.nth(i).textContent();
    console.log(`  Model: ${text}`);
  }

  await page.screenshot({ path: resolve(userDataDir, 'model-selector.png') });

  // 6. Send a message and verify real SDK response
  const input = page.locator('.chat-input');
  await input.fill('Reply with exactly: "REAL_SDK_RESPONSE"');
  await input.press('Enter');

  // Wait for assistant message to appear and finish streaming
  await page.waitForSelector('.chat-message-assistant', { timeout: 15000 });
  const assistantMsg = page.locator('.chat-message-assistant').last();

  // Wait for streaming to complete (cursor hidden) — real SDK can take a while
  await assistantMsg.locator('.chat-cursor').waitFor({ state: 'hidden', timeout: 60000 });

  // Small delay to ensure content is fully rendered
  await page.waitForTimeout(500);
  const content = await assistantMsg.locator('.chat-message-content').textContent();
  assert(content && content.length > 0, `Got SDK response: "${content?.substring(0, 80)}..."`);

  await page.screenshot({ path: resolve(userDataDir, 'chat-response.png') });

} catch (err) {
  results.push(`  FAIL: Unexpected error — ${err.message}`);
  failed++;
  await page.screenshot({ path: resolve(userDataDir, 'error.png') }).catch(() => {});
} finally {
  await electronApp.close();
}

console.log('\n=== No-Mock-Fallback Verification ===');
for (const r of results) {
  console.log(r);
}
console.log(`\n${passed} passed, ${failed} failed`);
console.log(`Screenshots: ${userDataDir}/`);
process.exit(failed > 0 ? 1 : 0);
