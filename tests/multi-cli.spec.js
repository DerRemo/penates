import { test, expect } from './fixtures.js';

test.describe('multi-CLI picker', () => {
  // ── Test 1: picker renders 4 CLIs, claude+auto default, modus switches ───
  test('picker: four CLIs, claude default, modus reflects CLI + auto default', async ({ authedPage: page }) => {
    await page.click('#new-session-btn');
    await page.waitForSelector('#new-session-modal.open', { timeout: 5_000 });

    const picker = page.locator('#cli-picker');
    await expect(picker.locator('.cli-pick-btn')).toHaveCount(4, { timeout: 5_000 });

    // Claude is the default CLI
    await expect(picker.locator('.cli-pick-btn[data-cli="claude"]')).toHaveAttribute('aria-pressed', 'true');

    // Modus shows claude's 3 tiers, with "auto" preselected → command auto
    const modus = page.locator('#modus-control');
    await expect(modus.locator('.modus-btn')).toHaveCount(3, { timeout: 5_000 });
    await expect(modus.locator('.modus-btn[data-tier="auto"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#new-session-cmd')).toHaveValue('claude --permission-mode auto');

    // Switch to antigravity → only 2 tiers, default falls back to safe
    await picker.locator('.cli-pick-btn[data-cli="antigravity"]').click();
    await expect(modus.locator('.modus-btn')).toHaveCount(2, { timeout: 5_000 });
    await expect(modus.locator('.modus-btn[data-tier="safe"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#new-session-cmd')).toHaveValue('agy');

    // Switch to opencode → single Standard tier (safe), command "opencode"
    await picker.locator('.cli-pick-btn[data-cli="opencode"]').click();
    await expect(modus.locator('.modus-btn')).toHaveCount(1, { timeout: 5_000 });
    await expect(modus.locator('.modus-btn[data-tier="safe"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#new-session-cmd')).toHaveValue('opencode');

    await page.keyboard.press('Escape');
  });

  // ── Test 2: composed (CLI × Modus) command is POSTed ──────────────────────
  test('CLI + modus compose the command sent to POST /api/sessions', async ({ authedPage: page }) => {
    let posted = null;
    await page.route('**/api/sessions', async route => {
      if (route.request().method() === 'POST') {
        posted = route.request().postDataJSON();
        return route.fulfill({
          status: 201, contentType: 'application/json',
          body: JSON.stringify({ name: 'cc-x', status: 'running' }),
        });
      }
      return route.continue();
    });

    await page.click('#new-session-btn');
    await page.waitForSelector('#new-session-modal.open', { timeout: 5_000 });
    await page.fill('#new-session-name', 'x');

    const picker = page.locator('#cli-picker');
    await expect(picker.locator('.cli-pick-btn')).toHaveCount(4, { timeout: 5_000 });
    await picker.locator('.cli-pick-btn[data-cli="codex"]').click();

    // codex default = full-auto (workspace-write + on-request); hidden command reflects it
    await expect(page.locator('#new-session-cmd')).toHaveValue('codex --sandbox workspace-write --ask-for-approval on-request', { timeout: 5_000 });

    // pick the danger tier → YOLO (explicit bypass flag)
    await page.locator('#modus-control .modus-btn[data-tier="danger"]').click();
    await expect(page.locator('#new-session-cmd')).toHaveValue('codex --dangerously-bypass-approvals-and-sandbox');

    await page.locator('#new-session-modal .modal-actions .btn-primary').click();
    await expect.poll(() => posted && posted.command, { timeout: 5_000 }).toBe('codex --dangerously-bypass-approvals-and-sandbox');
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
              command: 'codex --dangerously-bypass-approvals-and-sandbox',
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

    // Redesign: Der Text-Badge (.cli-badge) auf der Card wurde durch das
    // CLI-Brand-Logo (.cli-logo svg) ersetzt. Das Logo hängt am async
    // geladenen _clisMod — via waitForFunction abwarten, dann asserten.
    await page.waitForFunction(
      () => document.querySelector('.session-card[data-name="cc-codexsess"] .cli-logo svg') !== null,
      { timeout: 10_000 },
    );

    await expect(page.locator('.session-card[data-name="cc-codexsess"] .cli-logo').first()).toBeVisible();
  });

  // ── Test 4: directory tabs — Browse is default, Recent swaps the panel ─────
  test('directory tabs: Browse default, Recent reveals the recent panel', async ({ authedPage: page }) => {
    await page.click('#new-session-btn');
    await page.waitForSelector('#new-session-modal.open', { timeout: 5_000 });

    // Browse panel visible by default, recent hidden
    await expect(page.locator('#dir-tabs button[data-tab="browse"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#dir-panel-browse')).toBeVisible();
    await expect(page.locator('#dir-panel-recent')).toBeHidden();

    // Click "Recent" → panel swaps
    await page.locator('#dir-tabs button[data-tab="recent"]').click();
    await expect(page.locator('#dir-panel-recent')).toBeVisible();
    await expect(page.locator('#dir-panel-browse')).toBeHidden();

    await page.keyboard.press('Escape');
  });
});
