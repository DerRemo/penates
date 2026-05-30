// E2E für Browser-Preview (Single-Host-Modell): Panel öffnet/toggelt, Port-Dropdown
// befüllt sich aus gemocktem /api/preview/ports, Port-Auswahl POSTet an
// /api/preview/select und lädt den FIXEN Host ins iframe, und der
// "nicht konfiguriert"-State erscheint bei config.enabled:false.
// Backend wird per page.route gemockt — keine echte Domain/Tunnel nötig.
import { test, expect } from './fixtures.js';

// Aktiviert das Panel ohne echte Terminal-WS-Verbindung. Terminal-View sichtbar
// machen, sonst ist das Panel display:none (Dashboard) und selectOption scheitert.
async function activate(page, name = 'cc-preview-e2e') {
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
function mockPorts(page, ports) {
  return page.route('**/api/preview/ports', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ports }) }));
}

test.describe('Browser-Preview (single host)', () => {
  test('Panel öffnet sich und befüllt das Port-Dropdown aus /api/preview/ports', async ({ authedPage }) => {
    const page = authedPage;
    await mockConfig(page, { enabled: true, host: 'preview.example.com', activePort: null });
    await mockPorts(page, [{ port: 5173, process: 'node' }, { port: 3000, process: 'next' }]);

    await activate(page);
    await page.evaluate(() => window.PreviewPanel.toggle());
    await expect(page.locator('#preview-panel')).toHaveClass(/open/);
    const opts = page.locator('#preview-port-select option');
    await expect(opts).toHaveCount(3);                 // placeholder + 2 ports
    await expect(page.locator('#preview-port-select')).toContainText(':5173');
    await expect(page.locator('#preview-port-select')).toContainText(':3000');
  });

  test('Port-Auswahl POSTet an /select und lädt den fixen Host ins iframe', async ({ authedPage }) => {
    const page = authedPage;
    await mockConfig(page, { enabled: true, host: 'preview.example.com', activePort: null });
    await mockPorts(page, [{ port: 5173, process: 'node' }]);
    let selectedPort = null;
    await page.route('**/api/preview/select', async (r) => {
      const body = JSON.parse(r.request().postData() || '{}');
      selectedPort = body.port;
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, port: body.port }) });
    });

    await activate(page);
    await page.evaluate(() => window.PreviewPanel.toggle());
    await expect(page.locator('#preview-panel')).toHaveClass(/open/);
    await page.selectOption('#preview-port-select', '5173');

    // Hub bekam den Port mitgeteilt …
    await expect.poll(() => selectedPort).toBe(5173);
    // … und das iframe zeigt auf den FIXEN Host (kein <port>.-Präfix), Port nur als Cache-Bust-Query.
    await expect(page.locator('#preview-iframe')).toHaveAttribute('src', 'https://preview.example.com/?__cchub=5173');
  });

  test('"nicht konfiguriert"-State bei config.enabled:false', async ({ authedPage }) => {
    const page = authedPage;
    await mockConfig(page, { enabled: false, host: null, activePort: null });

    await activate(page);
    await page.evaluate(() => window.PreviewPanel.toggle());
    await expect(page.locator('#preview-panel')).toHaveClass(/open/);
    await expect(page.locator('#preview-overlay')).toHaveClass(/show/);
    await expect(page.locator('#preview-overlay')).toContainText('PREVIEW_DOMAIN');
  });

  // Echter Proxy/HMR-Round-Trip + CF-Routing ist in Playwright nicht reproduzierbar
  // (keine echte DNS/Tunnel/Access-Kette). Lokal end-to-end gegen echtes Vite verifiziert
  // (siehe finale Verifikation / Commit-Log).
  test.fixme('lädt + hot-reloadt einen echten Dev-Server über den fixen Host', async () => {});
});
