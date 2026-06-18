// E2E (targeted) für Mata-Integration: Source-Switcher erscheint nur bei
// installed:true; Leer-Zustand bei running aber portOpen:false; Mata-Wahl bei
// portOpen:true POSTet {source:'mata'} und lädt den fixen Host /session; der
// not-running-State bietet eine Start-Aktion an (POST /api/mata/control).
// Backend per page.route gemockt — kein echtes Mata/Simulator nötig.
import { test, expect } from './fixtures.js';

async function activate(page, name = 'cc-mata-e2e') {
  await page.evaluate((n) => {
    document.body.setAttribute('data-current-view', 'terminal');
    window.currentSessionName = n;
    window.PreviewPanel.activateForSession(n);
  }, name);
}
function mockConfig(page, body) {
  return page.route('**/api/preview/config', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }));
}
function mockPorts(page, ports = []) {
  return page.route('**/api/preview/ports', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ports }) }));
}
function mockMata(page, status) {
  return page.route('**/api/mata/status', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(status) }));
}

test.describe('Mata integration (preview source-switcher)', () => {
  test.beforeEach(async ({ authedPage }) => {
    // Keine fremde gespeicherte Quelle aus anderen Tests übernehmen.
    await authedPage.evaluate(() => localStorage.removeItem('penates_preview_source:cc-mata-e2e'));
  });

  test('switcher hidden when Mata not installed', async ({ authedPage }) => {
    const page = authedPage;
    await mockConfig(page, { enabled: true, host: 'preview.example.com', activePort: null });
    await mockPorts(page, [{ port: 5173, process: 'node' }]);
    await mockMata(page, { installed: false, running: false, portOpen: false });
    await activate(page);
    await page.evaluate(() => window.PreviewPanel.toggle());
    await expect(page.locator('#preview-panel')).toHaveClass(/open/);
    await expect(page.locator('#preview-source-switch')).toBeHidden();
  });

  test('switcher visible when installed; Mata source → "no simulator" empty-state', async ({ authedPage }) => {
    const page = authedPage;
    await mockConfig(page, { enabled: true, host: 'preview.example.com', activePort: null });
    await mockPorts(page, []);
    await mockMata(page, { installed: true, running: true, portOpen: false });
    await activate(page);
    await page.evaluate(() => window.PreviewPanel.toggle());
    await expect(page.locator('#preview-source-switch')).toBeVisible();
    await page.click('#preview-source-mata');
    await expect(page.locator('#preview-overlay')).toHaveClass(/show/);
    await expect(page.locator('#preview-overlay')).toContainText('simulator');
    // Dev-only Port-Combobox ist ausgeblendet, solange Mata die Quelle ist.
    await expect(page.locator('#preview-port-combo')).toBeHidden();
  });

  test('Mata source with open port POSTs {source:"mata"} and loads the viewer root', async ({ authedPage }) => {
    const page = authedPage;
    await mockConfig(page, { enabled: true, host: 'preview.example.com', activePort: null });
    await mockPorts(page, []);
    await mockMata(page, { installed: true, running: true, portOpen: true });
    let sentSource = null;
    await page.route('**/api/preview/select', async (r) => {
      sentSource = JSON.parse(r.request().postData() || '{}').source;
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, port: 3070, source: 'mata' }) });
    });
    await activate(page);
    await page.evaluate(() => window.PreviewPanel.toggle());
    await page.click('#preview-source-mata');
    await expect.poll(() => sentSource).toBe('mata');
    // Root-Pfad (Viewer-SPA), NICHT /session (= WS/JSON-Endpoint → plain GET liefert JSON).
    await expect(page.locator('#preview-iframe')).toHaveAttribute('src', 'https://preview.example.com/?__penates=mata');
  });

  test('not-running state offers a Start action that POSTs control', async ({ authedPage }) => {
    const page = authedPage;
    await mockConfig(page, { enabled: true, host: 'preview.example.com', activePort: null });
    await mockPorts(page, []);
    await mockMata(page, { installed: true, running: false, portOpen: false });
    let controlAction = null;
    await page.route('**/api/mata/control', async (r) => {
      controlAction = JSON.parse(r.request().postData() || '{}').action;
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });
    await activate(page);
    await page.evaluate(() => window.PreviewPanel.toggle());
    await page.click('#preview-source-mata');
    await expect(page.locator('#preview-overlay .preview-state-action')).toBeVisible();
    await page.click('#preview-overlay .preview-state-action');
    await expect.poll(() => controlAction).toBe('start');
  });
});
