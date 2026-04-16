import { test as base, expect } from '@playwright/test';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export const test = base.extend({
  isMobile: async ({}, use, testInfo) => {
    const mobile = ['mobile', 'mobile-small'].includes(testInfo.project.name);
    await use(mobile);
  },

  isTouch: async ({}, use, testInfo) => {
    const touch = ['tablet', 'mobile', 'mobile-small'].includes(testInfo.project.name);
    await use(touch);
  },

  tempProject: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'cchub-test-'));
    mkdirSync(join(dir, 'subdir'));
    writeFileSync(join(dir, 'hello.txt'), 'Hello E2E Test\nLine 2\nLine 3\n');
    writeFileSync(join(dir, 'code.js'), 'function add(a, b) {\n  return a + b;\n}\n');
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
      0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
      0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
      0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc,
      0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
      0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    writeFileSync(join(dir, 'test.png'), pngHeader);
    writeFileSync(join(dir, 'big.txt'), 'x'.repeat(2.5 * 1024 * 1024));

    await use(dir);

    rmSync(dir, { recursive: true, force: true });
  },

  hubSession: async ({ request }, use, testInfo) => {
    const suffix = `${testInfo.titlePath[0] || 'test'}-${Date.now()}`.replace(/[^\w-]/g, '').slice(0, 40);
    const name = `test-${suffix}`;
    const token = process.env.AUTH_TOKEN || '';

    const res = await request.post('/api/sessions', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name, directory: tmpdir(), command: 'bash --noprofile --norc' },
    });
    expect(res.ok(), `session create failed: ${res.status()}`).toBeTruthy();

    await use({ name: `cc-${name}`, shortName: name });

    await request.delete(`/api/sessions/cc-${encodeURIComponent(name)}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  },

  authedPage: async ({ page }, use) => {
    await page.goto('/');
    await page.waitForSelector('body[data-current-view="dashboard"]', { timeout: 10_000 });
    await use(page);
  },

  projectSession: async ({}, use) => {
    await use({ name: 'cc-claude-code-hub', projectId: 'claude-code-hub' });
  },
});

export { expect };
