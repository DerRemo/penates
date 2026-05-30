// E2E für Image-Paste & Annotation: Picker → Annotator-Modal, Toolbar,
// Tool-Auswahl, Senden trifft den Endpoint + schließt das Modal, cwd-Error-Toast.
// Der /image-Endpoint wird per page.route gemockt → kein echtes tmux/cwd nötig.
// Der Annotator wird über den Picker (setInputFiles) gefahren, das umgeht
// OS-Clipboard/Drag-Flakiness.
import { test, expect } from './fixtures.js';

// 1x1 PNG (gleiche Bytes wie die lib/E2E-Fixture).
const PNG = Buffer.from([
  0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a, 0x00,0x00,0x00,0x0d,0x49,0x48,0x44,0x52,
  0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01, 0x08,0x02,0x00,0x00,0x00,0x90,0x77,0x53,
  0xde,0x00,0x00,0x00,0x0c,0x49,0x44,0x41, 0x54,0x08,0xd7,0x63,0xf8,0xcf,0xc0,0x00,
  0x00,0x00,0x02,0x00,0x01,0xe2,0x21,0xbc, 0x33,0x00,0x00,0x00,0x00,0x49,0x45,0x4e,
  0x44,0xae,0x42,0x60,0x82,
]);

const FILE = { name: 'shot.png', mimeType: 'image/png', buffer: PNG };

test.describe('Image-Paste & Annotation', () => {
  test('Picker öffnet den Annotator und rendert die Toolbar', async ({ authedPage }) => {
    const page = authedPage;
    await page.evaluate(() => { window.currentSessionName = 'cc-img-e2e'; });
    await page.locator('#image-picker-input').setInputFiles(FILE);
    const modal = page.locator('#image-annotator-modal');
    await expect(modal).toHaveClass(/open/, { timeout: 5000 });
    for (const tool of ['arrow', 'box', 'pen', 'text']) {
      await expect(page.locator(`#annotator-toolbar .anno-tool[data-tool="${tool}"]`)).toBeVisible();
    }
    await expect(page.locator('#annotator-undo')).toBeVisible();
    await expect(page.locator('#annotator-send')).toBeVisible();
  });

  test('Tool-Auswahl markiert das Werkzeug aktiv', async ({ authedPage }) => {
    const page = authedPage;
    await page.evaluate(() => { window.currentSessionName = 'cc-img-e2e'; });
    await page.locator('#image-picker-input').setInputFiles(FILE);
    await expect(page.locator('#image-annotator-modal')).toHaveClass(/open/);
    const arrow = page.locator('#annotator-toolbar .anno-tool[data-tool="arrow"]');
    await arrow.click();
    await expect(arrow).toHaveClass(/active/);
  });

  test('Senden trifft den Endpoint und schließt das Modal', async ({ authedPage }) => {
    const page = authedPage;
    let hit = false;
    await page.route('**/api/sessions/*/image', (route) => {
      hit = true;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rel: '.cch-images/test.png' }) });
    });
    await page.evaluate(() => { window.currentSessionName = 'cc-img-e2e'; });
    await page.locator('#image-picker-input').setInputFiles(FILE);
    await expect(page.locator('#image-annotator-modal')).toHaveClass(/open/);
    await page.locator('#annotator-send').click();
    await expect.poll(() => hit, { timeout: 5000 }).toBe(true);
    await expect(page.locator('#image-annotator-modal')).not.toHaveClass(/open/);
  });

  test('cwd-Fehler (404) zeigt den noCwd-Toast', async ({ authedPage }) => {
    const page = authedPage;
    await page.route('**/api/sessions/*/image', (route) => {
      route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Session cwd not found' }) });
    });
    await page.evaluate(() => { window.currentSessionName = 'cc-img-e2e'; });
    await page.locator('#image-picker-input').setInputFiles(FILE);
    await expect(page.locator('#image-annotator-modal')).toHaveClass(/open/);
    await page.locator('#annotator-send').click();
    // Annotator schließt nach Send; Toast erscheint im globalen Toast-Container.
    // noCwd: "Session-Verzeichnis nicht verfügbar" / "Session directory unavailable"
    await expect(page.locator('#toast-container')).toContainText('Session', { timeout: 5000 });
  });

  // Präzise Canvas-Strich-Verifikation (Pixel des Pfeils/Box) ist über
  // Playwrights Pointer-Pipeline nicht zuverlässig erzwingbar (analog
  // dem synthetic-DnD-fixme). Flow + Endpoint + Fehlerpfad sind oben gedeckt.
  test.fixme('zeichnet einen Pfeil mit exakten Pixeln auf das Overlay', async () => {});
});
