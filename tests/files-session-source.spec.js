// E2E: Der Files-Picker funktioniert für JEDE Session, auch ohne registriertes
// Projekt. Eine FOREIGN tmux-Session (kein cc-Prefix, kein API-Call) wird in
// einem Temp-Verzeichnis OHNE Projekt-Eintrag gestartet; der Files-Toggle muss
// erscheinen und der Tree den cwd-Inhalt über die `session:<name>`-Quelle laden.
import { test, expect } from './fixtures.js';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const TMUX = process.env.TMUX_PATH || (() => {
  try { return execFileSync('/usr/bin/which', ['tmux'], { encoding: 'utf8', timeout: 3000 }).trim(); }
  catch { return '/opt/homebrew/bin/tmux'; }
})();

// Eindeutiger Name pro Test (File-Watcher cacht session:<name> 30s, s. diff-spec).
let SESSION = 'files-noproj-e2e';
let dir = null;

function killSession() { try { execFileSync(TMUX, ['kill-session', '-t', SESSION], { stdio: 'pipe' }); } catch {} }
function startSession() {
  dir = mkdtempSync(join(tmpdir(), 'files-noproj-'));
  writeFileSync(join(dir, 'probe.txt'), 'hallo\n');
  mkdirSync(join(dir, 'sub'));
  killSession();
  execFileSync(TMUX, ['new-session', '-d', '-s', SESSION, '-c', dir, 'bash', '--noprofile', '--norc'], { stdio: 'pipe' });
}

test.describe('Files-Picker pro Session (ohne Projekt)', () => {
  test.beforeEach(async ({}, testInfo) => {
    SESSION = `files-noproj-${testInfo.workerIndex}-${Date.now().toString(36)}`;
    startSession();
  });
  test.afterEach(async () => {
    killSession();
    if (dir) { rmSync(dir, { recursive: true, force: true }); dir = null; }
  });

  test('Toggle erscheint und der Tree lädt die cwd der projektlosen Session', async ({ authedPage: page }) => {
    await page.goto('/');
    await page.click('#refresh-btn').catch(() => {});

    const item = page.locator(`[data-session="${SESSION}"]`);
    await expect(item).toBeVisible({ timeout: 15000 });
    await item.click();
    await page.waitForSelector('body[data-current-view="terminal"]', { timeout: 10000 });

    const toggle = page.locator('#btn-toggle-files');
    await expect(toggle).toBeVisible({ timeout: 8000 });
    await toggle.click();

    await expect(page.locator('#files-sidebar')).toHaveClass(/open/, { timeout: 5000 });
    // Tree zeigt den cwd-Inhalt (Datei + Unterordner)
    await expect(page.locator('#files-tree .file-row[data-path="probe.txt"]')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('#files-tree .file-row[data-path="sub"]')).toBeVisible();

    // Quelle ist die synthetische session:<name>-id, kein registriertes Projekt
    const sourceId = await page.evaluate(() => window.__currentProjectForFiles?.id);
    expect(sourceId).toBe(`session:${SESSION}`);
  });
});
