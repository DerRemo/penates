// E2E for the Updates panel in Settings. GET /api/updates is mocked so the four
// groups, the sidebar dot, executable-only buttons and the hub guard are
// deterministic. The CLI-button click asserts POST /api/updates/cli:codex fires.
import { test, expect } from './fixtures.js';

const MOCK = {
  hub: { id: 'hub', category: 'hub', name: 'Penates', current: '0.7.1', latest: '0.8.0',
         outdated: true, source: 'github', executable: true, url: 'https://x', guard: { ok: true } },
  clis: [
    { id: 'cli:codex', category: 'cli', name: 'Codex', current: '0.135.0', latest: '0.140.0', outdated: true, source: 'cli', executable: true, url: null },
    { id: 'cli:agy', category: 'cli', name: 'Antigravity', current: '1.0.0', latest: null, outdated: false, source: 'cli', executable: false, url: null },
  ],
  dependencies: [
    { id: 'dep:express', category: 'dependency', name: 'express', current: '4.18.0', latest: '4.19.0', outdated: true, source: 'npm-outdated', executable: false, url: null },
  ],
  externals: [
    { id: 'ext:tmux', category: 'external', name: 'tmux', current: '3.4', latest: '3.5', outdated: true, source: 'brew', executable: true, url: null },
  ],
  outdatedCount: 4, checkedAt: 1, error: null,
};

// Single route handles GET (dashboard) + POST (start update) on /api/updates*.
async function mockUpdates(page, payload, onPost) {
  await page.route('**/api/updates**', (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      if (onPost) onPost(req.url());
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ session: 'cc-update-cli-codex' }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });
}

async function openSettings(page) {
  const toggle = page.locator('#sidebar-toggle');
  if (await toggle.isVisible()) { await toggle.click(); await page.waitForTimeout(200); }
  await page.click('#sidebar-settings-entry');
  await page.waitForSelector('body[data-current-view="settings"]', { timeout: 8000 });
}

test.describe('Updates panel', () => {
  test('renders four groups, buttons only on executable rows, dot on', async ({ authedPage: page }) => {
    await mockUpdates(page, MOCK);
    await page.reload();
    await openSettings(page);
    const host = page.locator('#settings-updates');
    await expect(host.locator('.upd-group')).toHaveCount(4);
    // Executable rows have a button: hub, cli:codex, ext:tmux = 3. agy + express do not.
    await expect(host.locator('[data-upd-id]')).toHaveCount(3);
    await expect(host.locator('[data-upd-id="cli:agy"]')).toHaveCount(0);
    await expect(host.locator('[data-upd-id="dep:express"]')).toHaveCount(0);
    // Sidebar dot shown because outdatedCount > 0.
    await expect.poll(() =>
      page.locator('#sidebar-settings-dot').evaluate(el => el.hasAttribute('hidden'))
    ).toBe(false);
  });

  test('hub button disabled on guard violation', async ({ authedPage: page }) => {
    const dirty = JSON.parse(JSON.stringify(MOCK));
    dirty.hub.guard = { ok: false, reason: 'dirty-tree' };
    await mockUpdates(page, dirty);
    await page.reload();
    await openSettings(page);
    await expect(page.locator('#settings-updates [data-upd-id="hub"]')).toBeDisabled();
  });

  test('clicking a CLI update button POSTs to /api/updates/cli:codex', async ({ authedPage: page }) => {
    let posted = null;
    await mockUpdates(page, MOCK, (url) => { posted = url; });
    await page.reload();
    await openSettings(page);
    await page.locator('#settings-updates [data-upd-id="cli:codex"]').click();
    await expect.poll(() => posted).toContain('/api/updates/cli%3Acodex');
  });

  test('no updates → all-current message, dot off', async ({ authedPage: page }) => {
    const clean = { hub: { id: 'hub', category: 'hub', name: 'Penates', current: '0.8.0', latest: '0.8.0',
        outdated: false, source: 'github', executable: true, url: null, guard: { ok: false, reason: 'up-to-date' } },
      clis: [], dependencies: [], externals: [], outdatedCount: 0, checkedAt: 1, error: null };
    await mockUpdates(page, clean);
    await page.reload();
    await openSettings(page);
    // Hub group still renders (one row); dependencies/externals empty → only 1 group.
    await expect(page.locator('#settings-updates .upd-group')).toHaveCount(1);
    await expect.poll(() =>
      page.locator('#sidebar-settings-dot').evaluate(el => el.hasAttribute('hidden'))
    ).toBe(true);
  });
});
