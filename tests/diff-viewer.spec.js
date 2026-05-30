// E2E für den Diff-Viewer (Spec 2): Git-Badge → diff-view, Datei-Liste,
// diff2html-Render (viewport-abhängig side-by-side/line-by-line), Live-Refresh.
//
// Die Session wird als FOREIGN tmux-Session erstellt (direkt via `tmux
// new-session`, KEIN cc-Prefix, KEIN API-Call) in einem dirty Git-Repo. Der
// Hub listet foreign Sessions; deren Card trägt jetzt ebenfalls den Git-Badge,
// weil das Backend für jede Session mit auflösbarem cwd `git` liefert. Foreign
// (z.B. Moshi-gestartete) Sessions sind das Kern-Interop-Szenario.
import { test, expect } from './fixtures.js';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const TMUX = process.env.TMUX_PATH || (() => {
  try { return execFileSync('/usr/bin/which', ['tmux'], { encoding: 'utf8', timeout: 3000 }).trim(); }
  catch { return '/opt/homebrew/bin/tmux'; }
})();
const TOKEN = process.env.AUTH_TOKEN || '';

// Pro Test eindeutige Namen — der server-seitige File-Watcher cached seinen
// State unter `session:<name>` für 30s nach dem letzten Unsubscribe und zieht
// dabei das Watch-Root NICHT nach. Bei wiederverwendetem Namen würde der
// zweite Test gegen das (gelöschte) Repo-Verzeichnis des ersten watchen →
// Live-Refresh-Events blieben aus. Eindeutige Namen umgehen die Kollision.
// Kein cc-Prefix → die Session erscheint als foreign-Card.
let SESSION = 'diff-e2e';
let repoDir = null;

function gitInRepo(...args) {
  execFileSync('git', ['-C', repoDir, ...args], {
    env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
    stdio: 'pipe',
  });
}
function makeDirtyRepo() {
  repoDir = mkdtempSync(join(tmpdir(), 'diff-e2e-'));
  gitInRepo('init', '-q', '-b', 'main');
  writeFileSync(join(repoDir, 'a.txt'), 'line1\nline2\n');
  gitInRepo('add', '.'); gitInRepo('commit', '-q', '-m', 'init');
  writeFileSync(join(repoDir, 'a.txt'), 'line1\nCHANGED\n');   // unstaged mod
  writeFileSync(join(repoDir, 'new.txt'), 'fresh\n');          // untracked
}
function killSession() { try { execFileSync(TMUX, ['kill-session', '-t', SESSION], { stdio: 'pipe' }); } catch {} }

function startSession() {
  // FOREIGN tmux-Session direkt starten (kein cc-Prefix, kein API-Call) →
  // erscheint im Dashboard als foreign-Card mit Git-Badge.
  execFileSync(TMUX, ['new-session', '-d', '-s', SESSION, '-c', repoDir, 'bash', '--noprofile', '--norc'], { stdio: 'pipe' });
}

test.describe('Diff-Viewer', () => {
  test.beforeEach(async ({}, testInfo) => {
    SESSION = `diff-e2e-${testInfo.workerIndex}-${Date.now().toString(36)}`;
    makeDirtyRepo(); killSession(); startSession();
  });
  test.afterEach(async () => {
    killSession();
    if (repoDir) { rmSync(repoDir, { recursive: true, force: true }); repoDir = null; }
  });

  test('Git-Badge verbindet zur Session und öffnet das Diff-Panel', async ({ authedPage }) => {
    await authedPage.goto('/');
    const badge = authedPage.locator(`.git-badge[data-diff-session="${SESSION}"]`);
    await expect(badge).toBeVisible({ timeout: 15000 });
    await badge.click();
    // Badge verbindet jetzt zur Session (Terminal-View) und öffnet das rechte
    // Diff-Panel — die frühere Vollbild-Diff-View entfällt.
    await expect(authedPage.locator('body')).toHaveAttribute('data-current-view', 'terminal');
    await expect(authedPage.locator('#diff-panel')).toHaveClass(/open/, { timeout: 10000 });

    // Datei-Liste zeigt die geänderte + die untracked Datei
    await expect(authedPage.locator('#diff-filelist .diff-file', { hasText: 'a.txt' })).toBeVisible();
    await expect(authedPage.locator('#diff-filelist .diff-file', { hasText: 'new.txt' })).toBeVisible();

    // Diff der gewählten Datei rendert (diff2html .d2h-wrapper ODER <pre>-Fallback)
    await authedPage.locator('#diff-filelist .diff-file', { hasText: 'a.txt' }).click();
    const rendered = authedPage.locator('#diff-pane .d2h-wrapper, #diff-pane pre');
    await expect(rendered).toBeVisible({ timeout: 15000 });
  });

  test('Diff-Toggle ist mit dem Files-Panel gegenseitig exklusiv', async ({ authedPage, isTouch }) => {
    // Auf Touch sind die Panels Vollbild-Overlays, die die Toolbar überdecken —
    // die Toggles sind dann nicht per Klick erreichbar (wie bei Files/Preview).
    test.skip(isTouch, 'panels are fullscreen overlays on touch — toolbar toggles not clickable');
    await authedPage.goto('/');
    await authedPage.click('#refresh-btn').catch(() => {});
    await authedPage.click(`[data-session="${SESSION}"]`);
    await expect(authedPage.locator('body')).toHaveAttribute('data-current-view', 'terminal');

    const diffToggle = authedPage.locator('#btn-toggle-diff');
    await expect(diffToggle).toBeVisible({ timeout: 8000 });
    await diffToggle.click();
    await expect(authedPage.locator('#diff-panel')).toHaveClass(/open/, { timeout: 8000 });

    // Files öffnen → Diff schließt
    await authedPage.click('#btn-toggle-files');
    await expect(authedPage.locator('#files-sidebar')).toHaveClass(/open/, { timeout: 5000 });
    await expect(authedPage.locator('#diff-panel')).not.toHaveClass(/open/);

    // Diff wieder öffnen → Files schließt
    await diffToggle.click();
    await expect(authedPage.locator('#diff-panel')).toHaveClass(/open/);
    await expect(authedPage.locator('#files-sidebar')).not.toHaveClass(/open/);
  });

  test('Live-Refresh aktualisiert die Datei-Liste', async ({ authedPage }) => {
    await authedPage.goto('/');
    await authedPage.locator(`.git-badge[data-diff-session="${SESSION}"]`).click();
    await expect(authedPage.locator('#diff-filelist .diff-file', { hasText: 'new.txt' })).toBeVisible({ timeout: 15000 });

    // Neue untracked Datei im Repo → Live-Refresh über den File-Watcher.
    // Der Watcher (server-seitig) abonniert erst, wenn der WS-`subscribeSession`
    // angekommen ist — das passiert kurz NACH dem Öffnen der Diff-View. Ein
    // einzelner Write direkt nach dem ersten Render kann dieses Fenster
    // verpassen (fs.watch hat kein Replay). Wir schreiben die Datei daher
    // periodisch neu, bis sie auftaucht: jeder Write ist ein frisches
    // Watcher-Event, also greift spätestens der erste nach dem Subscribe.
    await expect(async () => {
      writeFileSync(join(repoDir, 'live.txt'), 'added-live\n');
      await expect(authedPage.locator('#diff-filelist .diff-file', { hasText: 'live.txt' })).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 12000 });
  });
});
