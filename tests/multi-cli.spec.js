import { test, expect } from './fixtures.js';

test.describe('multi-CLI picker', () => {
  // ── Test 1: picker renders 3 CLIs, claude is default, variants switch ───
  test('picker shows three CLIs, claude default, variants switch', async ({ authedPage: page }) => {
    await page.click('#new-session-btn');
    await page.waitForSelector('#new-session-modal.open', { timeout: 5_000 });

    const picker = page.locator('#cli-picker');

    // Wait for the async clis.js import to resolve and populate the picker
    await expect(picker.locator('.cli-pick-btn')).toHaveCount(3, { timeout: 5_000 });

    // Claude must be the default (aria-pressed="true")
    await expect(picker.locator('.cli-pick-btn[data-cli="claude"]')).toHaveAttribute('aria-pressed', 'true');

    // Claude has 2 variants by default
    const sel = page.locator('#new-session-cmd');
    await expect(sel.locator('option')).toHaveCount(2, { timeout: 5_000 });
    await expect(sel).toContainText('Dangerous (skip permissions)');

    // Switch to gemini → 3 variants
    await picker.locator('.cli-pick-btn[data-cli="gemini"]').click();
    await expect(sel.locator('option')).toHaveCount(3, { timeout: 5_000 });
    await expect(sel).toContainText('YOLO');

    // Verify gemini --yolo is among the option values
    const vals = await sel.locator('option').evaluateAll(os => os.map(o => o.value));
    expect(vals).toContain('gemini --yolo');

    await page.keyboard.press('Escape');
  });

  // ── Test 2: selected variant command is POSTed ────────────────────────────
  test('selecting a variant sends the right command to POST /api/sessions', async ({ authedPage: page }) => {
    let posted = null;

    await page.route('**/api/sessions', async route => {
      if (route.request().method() === 'POST') {
        posted = route.request().postDataJSON();
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ name: 'cc-x', status: 'running' }),
        });
      }
      return route.continue();
    });

    await page.click('#new-session-btn');
    await page.waitForSelector('#new-session-modal.open', { timeout: 5_000 });

    await page.fill('#new-session-name', 'x');

    // Wait for picker to load, then switch to codex
    const picker = page.locator('#cli-picker');
    await expect(picker.locator('.cli-pick-btn')).toHaveCount(3, { timeout: 5_000 });
    await picker.locator('.cli-pick-btn[data-cli="codex"]').click();

    // Wait for codex variants, then select YOLO
    const sel = page.locator('#new-session-cmd');
    await expect(sel.locator('option')).toHaveCount(3, { timeout: 5_000 });
    await sel.selectOption({ label: 'YOLO (bypass)' });

    // Click the Start button inside the modal (btn-primary in modal-actions)
    await page.locator('#new-session-modal .modal-actions .btn-primary').click();

    await expect.poll(() => posted && posted.command, { timeout: 5_000 }).toBe('codex --yolo');
  });

  // ── Test 3: session card shows .cli-badge derived from command ────────────
  test('session card shows CLI badge derived from command', async ({ authedPage: page }) => {
    // Mock the sessions list BEFORE reload so the mock is in place on first load
    await page.route('**/api/sessions', route => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              name: 'cc-codexsess',
              status: 'running',
              attached: false,
              windows: 1,
              activity: 'idle',
              command: 'codex --yolo',
              path: '/tmp',
              contextPct: null,
              git: null,
              muted: false,
              pinned: false,
              created: Date.now(),
              projectId: '',
              projectName: '',
            },
          ]),
        });
      }
      return route.continue();
    });

    await page.reload();
    await page.waitForSelector('body[data-current-view="dashboard"]', { timeout: 10_000 });

    // The card must exist first
    await expect(page.locator('.session-card[data-name="cc-codexsess"]')).toBeVisible({ timeout: 10_000 });

    // The cli-badge depends on _clisMod being loaded (async import).
    // Wait for it via waitForFunction, then assert via locator.
    await page.waitForFunction(
      () => document.querySelector('.session-card[data-name="cc-codexsess"] .cli-badge') !== null,
      { timeout: 10_000 },
    );

    await expect(page.locator('.session-card[data-name="cc-codexsess"] .cli-badge').first()).toBeVisible();
  });
});
