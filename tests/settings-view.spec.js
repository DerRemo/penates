// E2E for the re-skinned Settings view (Phase 1):
// app-topbar chrome, 4 anchor chips, 4 labelled sections, theme toggle regression,
// anchor-chip active state.
// All assertions target NEW markup that does NOT exist yet — tests must fail
// until later tasks implement the markup in public/index.html.
import { test, expect } from './fixtures.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function openSettings(page) {
  // On mobile/tablet the sidebar is collapsed — open it first.
  const sidebarToggle = page.locator('#sidebar-toggle');
  if (await sidebarToggle.isVisible()) {
    await sidebarToggle.click();
    await page.waitForTimeout(300);
  }

  await page.click('#sidebar-settings-entry');
  await page.waitForSelector('body[data-current-view="settings"]', { timeout: 8_000 });

  // Close sidebar again on mobile so the view is accessible.
  if (await sidebarToggle.isVisible() &&
      await page.locator('body[data-sidebar-open="true"]').count()) {
    await sidebarToggle.click();
    await page.waitForTimeout(300);
  }
}

// Mock GET /api/settings so the Server panel renders deterministically (the
// action buttons depend on this fetch resolving; under full-suite parallel load
// the real endpoint can be slow on the webkit-mobile project → flaky waits).
async function mockServerSettings(page) {
  await page.route('**/api/settings', route => {
    if (route.request().method() !== 'GET') return route.continue();
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        settings: { tmuxMouse: 'on', remoteApproval: true },
        status: { version: '9.9.9', uptimeSeconds: 1, sessions: 0, activePtys: 0 },
        features: { voice: { enabled: false, lang: 'de' }, preview: { enabled: false, host: null },
          cfAccess: { enabled: false }, push: { configured: false }, projectRoots: [], browseRoots: [], defaultProjectDir: '~' },
      }),
    });
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Settings-View (Redesign Phase 1)', () => {

  test('settings view uses app-topbar chrome with title', async ({ authedPage: page }) => {
    await openSettings(page);
    const topbar = page.locator('#settings-view .app-topbar__title');
    await expect(topbar).toBeVisible();
  });

  test('renders 8 anchor chips incl. Server + Session restore', async ({ authedPage: page }) => {
    await openSettings(page);
    await expect(page.locator('#settings-view .settings-anchor')).toHaveCount(8);
    await expect(page.locator('#settings-view .settings-anchor[data-anchor="sec-terminal"]')).toBeAttached();
    await expect(page.locator('#settings-view .settings-anchor[data-anchor="sec-account"]')).toBeAttached();
    await expect(page.locator('#settings-view .settings-anchor[data-anchor="sec-server"]')).toBeAttached();
    await expect(page.locator('#settings-view .settings-anchor[data-anchor="sec-restore"]')).toBeAttached();
  });

  test('server panel renders status + feature flags from /api/settings', async ({ authedPage: page }) => {
    await page.route('**/api/settings', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        settings: { tmuxMouse: 'on', remoteApproval: true },
        status: { version: '9.9.9', uptimeSeconds: 3661, sessions: 2, activePtys: 1 },
        features: { voice: { enabled: true, lang: 'de' }, preview: { enabled: false, host: null },
                    cfAccess: { enabled: true }, push: { configured: false },
                    projectRoots: ['/Users/x/Projects'], browseRoots: [], defaultProjectDir: '~' },
      }),
    }));
    await page.reload();                 // re-run initServerPanel with the mock in place
    await openSettings(page);
    const panel = page.locator('#server-panel');
    await expect(panel).toContainText('v9.9.9');
    await expect(panel.locator('#srv-tmux-mouse')).toHaveAttribute('aria-pressed', 'true');
  });

  test('terminal + account sections are present', async ({ authedPage: page }) => {
    await openSettings(page);
    await expect(page.locator('#settings-view #sec-terminal')).toBeAttached();
    await expect(page.locator('#settings-view #sec-account')).toBeAttached();
  });

  test('a terminal pref persists across reload', async ({ authedPage: page }) => {
    await openSettings(page);
    await page.click('#sec-terminal [data-cursor-value="block"]');
    await expect(page.locator('#sec-terminal [data-cursor-value="block"]')).toHaveClass(/is-active/);
    await page.reload();
    await openSettings(page);
    await expect(page.locator('#sec-terminal [data-cursor-value="block"]')).toHaveClass(/is-active/);
  });

  test('density compact sets the html attribute', async ({ authedPage: page }) => {
    await openSettings(page);
    await page.click('#sec-appearance [data-density-value="compact"]');
    await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  });

  test('sign out clears the token', async ({ authedPage: page }) => {
    await openSettings(page);
    await page.click('#pref-logout-btn');
    const cleared = await page.evaluate(() => localStorage.getItem('penates_token'));
    expect(cleared).toBeNull();
  });

  test('all phase-1 sections are present', async ({ authedPage: page }) => {
    await openSettings(page);
    for (const id of ['sec-appearance', 'sec-notifications', 'sec-behavior', 'sec-help']) {
      await expect(page.locator(`#settings-view #${id}`)).toBeAttached();
    }
  });

  test('theme toggle still works after re-skin', async ({ authedPage: page }) => {
    // Confirmed mechanism: setTheme() calls
    // document.documentElement.setAttribute('data-theme', t)
    // so the assertion is html[data-theme="latte"].
    await openSettings(page);
    await page.click('#settings-view [data-theme-value="latte"]');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'latte');
    await page.click('#settings-view [data-theme-value="mocha"]');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'mocha');
  });

  test('clicking an anchor chip marks it active', async ({ authedPage: page }) => {
    await openSettings(page);
    const helpChip = page.locator('#settings-view .settings-anchor[data-anchor="sec-help"]');
    await helpChip.click();
    await expect(helpChip).toHaveClass(/is-active/);
  });

  test('logs viewer opens and renders tail from /api/server/logs', async ({ authedPage: page }) => {
    await mockServerSettings(page);   // deterministic panel render (no dep on real /api/settings timing)
    await page.route('**/api/server/logs**', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ stream: 'stdout', lines: 500, data: 'LOGLINE-ALPHA\nLOGLINE-BETA' }),
    }));
    // setView('settings') re-fetches the Server panel on open (see index.html),
    // so the action buttons render reliably.
    await openSettings(page);
    await page.waitForSelector('#srv-logs-btn', { state: 'attached', timeout: 10_000 });
    await page.click('#srv-logs-btn');
    await expect(page.locator('#logs-modal')).toHaveClass(/open/);
    await expect(page.locator('#logs-output')).toContainText('LOGLINE-ALPHA');
    await page.click('#logs-close');
    await expect(page.locator('#logs-modal')).not.toHaveClass(/open/);
  });

  test('restart button needs a 2nd click and posts to /api/server/restart', async ({ authedPage: page }) => {
    let posted = 0;
    await mockServerSettings(page);   // deterministic panel render
    await page.route('**/api/server/restart', route => { posted++; route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"restarting":true}' }); });
    await openSettings(page);
    await page.waitForSelector('#srv-restart-btn', { state: 'attached', timeout: 10_000 });
    await page.click('#srv-restart-btn');          // arms (confirm) — must NOT post
    expect(posted).toBe(0);
    await page.click('#srv-restart-btn');          // confirms → posts
    await expect.poll(() => posted).toBe(1);
  });

  test('session-restore section reflects settings + toggling PATCHes', async ({ authedPage: page }) => {
    let patched = null;
    await page.route('**/api/settings', route => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({
            settings: { tmuxMouse: 'on', remoteApproval: true, autoRestore: true, autoRestoreContinue: false },
            status: { version: '9.9.9', uptimeSeconds: 1, sessions: 0, activePtys: 0 },
            features: { voice: { enabled: false, lang: 'de' }, preview: { enabled: false, host: null },
              cfAccess: { enabled: false }, push: { configured: false }, projectRoots: [], browseRoots: [], defaultProjectDir: '~' },
          }),
        });
      }
      patched = JSON.parse(route.request().postData() || '{}');
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ settings: {} }) });
    });
    await openSettings(page);
    await page.waitForSelector('#srv-auto-restore', { state: 'attached', timeout: 10_000 });
    // aria-pressed mirrors the fetched settings (continue off, master on).
    await expect(page.locator('#srv-auto-restore')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#srv-auto-restore-continue')).toHaveAttribute('aria-pressed', 'false');
    // Toggling the master switch flips aria + PATCHes the boolean.
    await page.click('#srv-auto-restore');
    await expect(page.locator('#srv-auto-restore')).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => patched && patched.autoRestore).toBe(false);
  });

});
