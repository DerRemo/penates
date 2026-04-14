import { test, expect } from '@playwright/test';

// Helper: navigate to dashboard and wait for it to be ready
async function goDashboard(page) {
  await page.goto('/');
  await page.waitForSelector('body[data-current-view="dashboard"]', { timeout: 10_000 });
  await page.waitForSelector('#sessions-grid', { timeout: 10_000 });
  // Wait for initial fade-in to settle
  await page.waitForTimeout(400);
}

// ── Desktop (1280×900) ───────────────────────────────────────────────────────

test.describe('Desktop 1280×900', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('kein horizontales Scrollen', async ({ page }) => {
    await goDashboard(page);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test('Header sticky an top=0, Höhe > 50px', async ({ page }) => {
    await goDashboard(page);
    const box = await page.locator('.header').boundingBox();
    expect(box.y).toBeCloseTo(0, 1);
    expect(box.height).toBeGreaterThan(50);
  });

  test('project-toast z-index ≤ 3000', async ({ page }) => {
    await goDashboard(page);
    const z = await page.evaluate(() => {
      const el = document.querySelector('.project-toast');
      return el ? parseInt(getComputedStyle(el).zIndex, 10) : null;
    });
    if (z !== null) expect(z).toBeLessThanOrEqual(3000);
  });

  test('modal-overlay z-index = 1000', async ({ page }) => {
    await goDashboard(page);
    await page.click('#new-session-btn');
    await page.waitForSelector('#new-session-modal.open');
    const z = await page.evaluate(() => {
      const el = document.querySelector('#new-session-modal');
      return el ? parseInt(getComputedStyle(el).zIndex, 10) : null;
    });
    expect(z).toBe(1000);
    await page.keyboard.press('Escape');
  });

  test('Screenshot Desktop Dashboard', async ({ page }) => {
    await goDashboard(page);
    await expect(page).toHaveScreenshot('desktop-dashboard.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });
});

// ── iPhone 14 Pro (393×852) ─────────────────────────────────────────────────

test.describe('iPhone 14 Pro 393×852', () => {
  test.use({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });

  test('kein horizontales Scrollen', async ({ page }) => {
    await goDashboard(page);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test('dashboard-header-right bleibt in Viewport', async ({ page }) => {
    await goDashboard(page);
    const box = await page.locator('.dashboard-header-right').boundingBox();
    if (box) {
      expect(box.x + box.width).toBeLessThanOrEqual(393 + 1);
    }
  });

  test('touch-bar z-index > modal-overlay z-index', async ({ page }) => {
    await goDashboard(page);
    const z = await page.evaluate(() => {
      const el = document.getElementById('touch-bar');
      return el ? parseInt(getComputedStyle(el).zIndex, 10) : null;
    });
    if (z !== null) expect(z).toBeGreaterThan(1000);
  });

  test('Modal "Neue Session" passt in 393px Viewport', async ({ page }) => {
    await goDashboard(page);
    await page.click('#new-session-btn');
    await page.waitForSelector('#new-session-modal.open');
    const box = await page.locator('#new-session-modal .modal').boundingBox();
    expect(box).not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(393 + 1);
    await expect(page.locator('#new-session-title')).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('Screenshot iPhone 14 Pro Dashboard', async ({ page }) => {
    await goDashboard(page);
    await expect(page).toHaveScreenshot('iphone14pro-dashboard.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('Screenshot iPhone 14 Pro Modal offen', async ({ page }) => {
    await goDashboard(page);
    await page.click('#new-session-btn');
    await page.waitForSelector('#new-session-modal.open');
    await page.waitForTimeout(200);
    await expect(page).toHaveScreenshot('iphone14pro-modal-open.png', {
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
  });
});

// ── iPhone SE (320×568) ─────────────────────────────────────────────────────

test.describe('iPhone SE 320×568', () => {
  test.use({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });

  test('kein horizontales Scrollen', async ({ page }) => {
    await goDashboard(page);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test('Modal passt in 320px Viewport', async ({ page }) => {
    await goDashboard(page);
    await page.click('#new-session-btn');
    await page.waitForSelector('#new-session-modal.open');
    const box = await page.locator('#new-session-modal .modal').boundingBox();
    expect(box).not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320 + 1);
    await expect(page.locator('#new-session-title')).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('Screenshot iPhone SE Modal', async ({ page }) => {
    await goDashboard(page);
    await page.click('#new-session-btn');
    await page.waitForSelector('#new-session-modal.open');
    await page.waitForTimeout(200);
    await expect(page).toHaveScreenshot('iphoneSE-modal.png', {
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
  });
});

// ── Mid-range 704×900 (Session-Card Gap) ───────────────────────────────────

test.describe('Mid-range 704×900 (641–767px range)', () => {
  test.use({ viewport: { width: 704, height: 900 } });

  test('kein horizontales Scrollen in List-Layout', async ({ page }) => {
    await goDashboard(page);
    const listBtn = page.locator('#layout-list-btn');
    if (await listBtn.isVisible()) {
      await listBtn.click();
      await page.waitForSelector('.sessions-grid.layout-list');
    }
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test('Session-Card bleibt in Viewport bei 704px (List)', async ({ page }) => {
    await goDashboard(page);
    const listBtn = page.locator('#layout-list-btn');
    if (await listBtn.isVisible()) {
      await listBtn.click();
      await page.waitForSelector('.sessions-grid.layout-list');
    }
    const card = page.locator('.session-card').first();
    if (await card.count() > 0) {
      const box = await card.boundingBox();
      if (box) expect(box.x + box.width).toBeLessThanOrEqual(704 + 1);
    }
  });

  test('Screenshot Mid-range List-Layout', async ({ page }) => {
    await goDashboard(page);
    const listBtn = page.locator('#layout-list-btn');
    if (await listBtn.isVisible()) {
      await listBtn.click();
      await page.waitForTimeout(200);
    }
    await expect(page).toHaveScreenshot('midrange-list-layout.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });
});
