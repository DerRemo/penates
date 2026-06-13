import { test, expect } from './fixtures.js';
import { navigateToSession, waitForTerminal } from './helpers.js';

// Tiny valid 1x1 PNG (base64) for the mocked image response.
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test.describe('Terminal File-Preview (clickable paths)', () => {
  test.beforeEach(async ({ authedPage: page, hubSession }) => {
    await navigateToSession(page, hubSession.name);
    await waitForTerminal(page);
  });

  // Write a line to the buffer and return the link object the provider yields
  // for the matching token (scanning the populated rows).
  async function linkFor(page, lineText) {
    return page.evaluate(async (text) => {
      await new Promise(r => window.term.write(text + '\r\n', r));
      const provider = window._filePreviewLinkProvider;
      if (!provider) return null;
      const buf = window.term.buffer.active;
      for (let row = 1; row <= buf.length; row++) {
        const link = await new Promise(res => provider.provideLinks(row, res));
        const hit = (link || []).find(l => l.text && l.text.includes('.'));
        if (hit) return { text: hit.text, hasRange: !!(hit.range && hit.range.start && hit.range.end) };
      }
      return null;
    }, lineText);
  }

  test('a previewable path becomes a link with the right text', async ({ authedPage: page }) => {
    const link = await linkFor(page, 'codex wrote /tmp/baliet/stats.png (204.3KB)');
    expect(link).not.toBeNull();
    expect(link.text).toBe('/tmp/baliet/stats.png');
    expect(link.hasRange).toBe(true);
  });

  test('a domain is NOT linked', async ({ authedPage: page }) => {
    const link = await linkFor(page, 'visit example.com for details');
    expect(link).toBeNull();
  });

  test('clicking a path opens the modal with an image', async ({ authedPage: page }) => {
    await page.route('**/api/sessions/**/file-content**', route =>
      route.fulfill({ status: 200, contentType: 'image/png', headers: { 'X-File-Size': '70' }, body: Buffer.from(PNG_B64, 'base64') }));
    await page.evaluate(async () => {
      await new Promise(r => window.term.write('out /tmp/shot.png\r\n', r));
      const buf = window.term.buffer.active;
      for (let row = 1; row <= buf.length; row++) {
        const links = await new Promise(res => window._filePreviewLinkProvider.provideLinks(row, res));
        const hit = (links || []).find(l => l.text === '/tmp/shot.png');
        if (hit) { hit.activate(new MouseEvent('click')); return; }
      }
    });
    const modal = page.locator('#file-preview-modal');
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await expect(modal.locator('img')).toBeVisible({ timeout: 5_000 });
  });

  test('clicking a path opens the modal with text + highlighting', async ({ authedPage: page }) => {
    await page.route('**/api/sessions/**/file-content**', route =>
      route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'X-File-Lang': 'markdown', 'X-File-Size': '12' }, body: '# Hello\nbody' }));
    await page.evaluate(async () => {
      await new Promise(r => window.term.write('see /tmp/readme.md\r\n', r));
      const buf = window.term.buffer.active;
      for (let row = 1; row <= buf.length; row++) {
        const links = await new Promise(res => window._filePreviewLinkProvider.provideLinks(row, res));
        const hit = (links || []).find(l => l.text === '/tmp/readme.md');
        if (hit) { hit.activate(new MouseEvent('click')); return; }
      }
    });
    const modal = page.locator('#file-preview-modal');
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await expect(modal.locator('pre code').first()).toBeVisible({ timeout: 5_000 });
    await expect(modal.locator('pre code').first()).toContainText('Hello');
  });

  test('a 403 from the reader shows the forbidden hint', async ({ authedPage: page }) => {
    await page.route('**/api/sessions/**/file-content**', route =>
      route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'EOUTSIDE' }) }));
    await page.evaluate(async () => {
      window.FilePreview.openUrl('/api/sessions/cc-x/file-content?path=' + encodeURIComponent('/etc/secret.png'), 'secret.png');
    });
    const body = page.locator('#file-preview-body');
    await expect(body).toContainText(/allowed area|außerhalb/i, { timeout: 5_000 });
  });

  test('a 404 from the reader shows the not-found hint', async ({ authedPage: page }) => {
    await page.route('**/api/sessions/**/file-content**', route =>
      route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'ENOENT' }) }));
    await page.evaluate(async () => {
      window.FilePreview.openUrl('/api/sessions/cc-x/file-content?path=' + encodeURIComponent('/tmp/missing.md'), 'missing.md');
    });
    const body = page.locator('#file-preview-body');
    await expect(body).toContainText(/not found|nicht gefunden/i, { timeout: 5_000 });
  });
});
