// global-setup.js — runs once before all tests.
// Injects the auth token into browser localStorage so tests skip the login prompt.
// Token is read from AUTH_TOKEN env var — source it from .env before running:
//   export $(grep -v '^#' .env | xargs) && npm run test:e2e

import { chromium } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

export default async function globalSetup() {
  // Try env var first, fall back to parsing .env file
  let token = process.env.AUTH_TOKEN;

  if (!token) {
    try {
      const envPath = resolve(process.cwd(), '.env');
      const envContent = readFileSync(envPath, 'utf8');
      const match = envContent.match(/^AUTH_TOKEN=(.+)$/m);
      if (match) token = match[1].trim();
    } catch {
      // .env not found — proceed without auth
    }
  }

  // Playwright webServer boots on 3334 — use that for the auth-state injection
  const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3334';

  if (!token) {
    console.warn('[global-setup] AUTH_TOKEN not found — tests run without auth (login prompt may appear).');
    // Write empty state so storageState references don't break
    const browser = await chromium.launch();
    const context = await browser.newContext({ baseURL: BASE_URL });
    await context.storageState({ path: 'tests/.auth-state.json' });
    await browser.close();
    return;
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();

  await page.goto('/');
  await page.evaluate((t) => {
    localStorage.setItem('penates_token', t);
  }, token);

  await context.storageState({ path: 'tests/.auth-state.json' });
  await browser.close();
  console.log('[global-setup] Auth token injected into tests/.auth-state.json');
}
