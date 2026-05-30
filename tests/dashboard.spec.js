import { test, expect } from './fixtures.js';
import { navigateToSession, goBackToDashboard, getToken } from './helpers.js';

test.describe('Dashboard', () => {
  test('shows session cards on load', async ({ authedPage: page }) => {
    const cards = page.locator('.session-card');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('grid and list layout toggle', async ({ authedPage: page }) => {
    const grid = page.locator('#sessions-grid');

    await page.click('#layout-list-btn');
    await expect(grid).toHaveClass(/layout-list/, { timeout: 3_000 });

    await page.click('#layout-grid-btn');
    await expect(grid).not.toHaveClass(/layout-list/, { timeout: 3_000 });
  });

  test('search filters session cards', async ({ authedPage: page }) => {
    await page.locator('.session-card').first().waitFor({ timeout: 10_000 });
    const allCards = await page.locator('.session-card').count();
    expect(allCards).toBeGreaterThan(0);

    await page.fill('#session-search', 'zzz-nonexistent-session-name');
    await page.waitForTimeout(500);
    const filtered = await page.locator('.session-card:visible').count();
    expect(filtered).toBe(0);

    await page.fill('#session-search', '');
    await page.waitForTimeout(500);
    const restored = await page.locator('.session-card:visible').count();
    expect(restored).toBeGreaterThan(0);
  });

  test('refresh button reloads sessions', async ({ authedPage: page }) => {
    await page.locator('.session-card').first().waitFor({ timeout: 10_000 });
    await page.click('#refresh-btn');
    await page.waitForTimeout(1_000);
    await expect(page.locator('.session-card').first()).toBeVisible();
  });

  test('create, navigate, and kill session lifecycle', async ({ authedPage: page }) => {
    const name = `e2e-lifecycle-${Date.now()}`;
    const token = await getToken(page);

    const createRes = await page.request.post('/api/sessions', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name, directory: '/tmp', command: 'bash --noprofile --norc' },
    });
    expect(createRes.ok()).toBeTruthy();

    try {
      await page.click('#refresh-btn');
      const card = page.locator(`.session-card[data-name="cc-${name}"]`);
      await card.waitFor({ timeout: 10_000 });
      await expect(card).toBeVisible();

      await card.click();
      await page.waitForSelector('body[data-current-view="terminal"]', { timeout: 10_000 });

      page.once('dialog', dialog => dialog.accept());
      await page.click('#kill-current-btn');
      await page.waitForSelector('body[data-current-view="dashboard"]', { timeout: 10_000 });

      await page.waitForTimeout(500);
      await page.click('#refresh-btn');
      await page.waitForTimeout(1_000);
    } finally {
      await page.request.delete(`/api/sessions/cc-${encodeURIComponent(name)}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
  });

  test('session card click navigates to terminal', async ({ authedPage: page, hubSession }) => {
    await page.click('#refresh-btn');
    await navigateToSession(page, hubSession.name);
    await expect(page.locator('body')).toHaveAttribute('data-current-view', 'terminal');
    await goBackToDashboard(page);
  });

  test('session rename via API updates card', async ({ authedPage: page }) => {
    const name = `e2e-rename-${Date.now()}`;
    const newName = `e2e-renamed-${Date.now()}`;
    const token = await getToken(page);

    await page.request.post('/api/sessions', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name, directory: '/tmp', command: 'bash --noprofile --norc' },
    });

    try {
      await page.click('#refresh-btn');
      const card = page.locator(`.session-card[data-name="cc-${name}"]`);
      await card.waitFor({ timeout: 10_000 });

      const renameRes = await page.request.patch(`/api/sessions/cc-${encodeURIComponent(name)}`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: { newName },
      });
      expect(renameRes.ok()).toBeTruthy();

      await page.click('#refresh-btn');
      await page.waitForTimeout(1_000);
      const renamedCard = page.locator(`.session-card[data-name="cc-${newName}"]`);
      await renamedCard.waitFor({ timeout: 10_000 });
      await expect(renamedCard).toBeVisible();
    } finally {
      await page.request.delete(`/api/sessions/cc-${encodeURIComponent(newName)}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
      await page.request.delete(`/api/sessions/cc-${encodeURIComponent(name)}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
  });

  test('mute toggle changes state', async ({ authedPage: page, hubSession }) => {
    await page.click('#refresh-btn');
    const card = page.locator(`.session-card[data-name="${hubSession.name}"]`);
    await card.waitFor({ timeout: 10_000 });

    // Redesign: Pin/Mute leben in der hover-eingeblendeten Aktionsleiste.
    // Auf Desktop erst nach Hover sichtbar/klickbar.
    await card.hover();
    const muteBtn = card.locator('.session-mute-btn');
    const wasMuted = await muteBtn.getAttribute('data-muted');
    await muteBtn.click();
    await page.waitForTimeout(500);
    const nowMuted = await muteBtn.getAttribute('data-muted');
    expect(nowMuted).not.toBe(wasMuted);
  });

  test('pin toggle changes state', async ({ authedPage: page, hubSession }) => {
    await page.click('#refresh-btn');
    const card = page.locator(`.session-card[data-name="${hubSession.name}"]`);
    await card.waitFor({ timeout: 10_000 });

    // Redesign: Pin/Mute leben in der hover-eingeblendeten Aktionsleiste.
    await card.hover();
    const pinBtn = card.locator('.session-pin-btn');
    const wasPinned = await pinBtn.getAttribute('data-pinned');
    await pinBtn.click();
    await page.waitForTimeout(500);
    const nowPinned = await pinBtn.getAttribute('data-pinned');
    expect(nowPinned).not.toBe(wasPinned);
  });

  test('new session modal opens and closes', async ({ authedPage: page }) => {
    await page.click('#new-session-btn');
    await expect(page.locator('#new-session-modal')).toHaveClass(/open/, { timeout: 3_000 });

    await page.click('#new-session-modal .btn-ghost');
    await expect(page.locator('#new-session-modal')).not.toHaveClass(/open/, { timeout: 3_000 });
  });

  test('bulk kill modal opens and closes', async ({ authedPage: page }) => {
    await page.click('#bulk-kill-btn');
    await expect(page.locator('#bulk-kill-modal')).toHaveClass(/open/, { timeout: 3_000 });

    await page.click('#bulk-kill-cancel');
    await expect(page.locator('#bulk-kill-modal')).not.toHaveClass(/open/, { timeout: 3_000 });
  });
});
