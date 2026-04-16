import { test, expect } from '@playwright/test';

test.describe('Auth', () => {
  test('login modal appears without token', async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('#login-modal')).toBeVisible({ timeout: 5_000 });
    await context.close();
  });

  test('wrong token shows error', async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForSelector('#login-modal', { timeout: 5_000 });
    await page.fill('#login-token', 'invalid-token-12345');
    await page.click('#login-form button[type="submit"]');
    const toast = page.locator('.toast.error');
    await expect(toast).toBeVisible({ timeout: 5_000 });
    await context.close();
  });

  test('correct token shows dashboard', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('body[data-current-view="dashboard"]', { timeout: 10_000 });
    await expect(page.locator('#dashboard-view')).toBeVisible();
  });

  test('auth persists after reload', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('body[data-current-view="dashboard"]', { timeout: 10_000 });
    await page.reload();
    await page.waitForSelector('body[data-current-view="dashboard"]', { timeout: 10_000 });
    await expect(page.locator('#login-modal')).not.toBeVisible();
  });
});
