// E2E für den Diff-Viewer (Spec 2): Git-Badge → diff-view, Datei-Liste,
// diff2html-Render (viewport-abhängig side-by-side/line-by-line), Live-Refresh.
//
// Die Session wird über den Hub (POST /api/sessions) in einem dirty Git-Repo
// erstellt → läuft als running-Card mit klickbarem Git-Badge. (Foreign tmux-
// Sessions rendern als "tmux"-Adopt-Card OHNE Badge — das ist Design, nicht
// Teil dieses Features.)
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
let SHORT = 'diff-e2e';
let SESSION = `cc-${SHORT}`;
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

async function startSession(request) {
  // Über den Hub starten → cc-prefixed running-Session im Repo-cwd.
  const res = await request.post('/api/sessions', {
    headers: { Authorization: `Bearer ${TOKEN}` },
    data: { name: SHORT, directory: repoDir, command: 'bash --noprofile --norc' },
  });
  expect(res.ok(), `session create failed: ${res.status()}`).toBeTruthy();
}

test.describe('Diff-Viewer', () => {
  test.beforeEach(async ({ request }, testInfo) => {
    SHORT = `diff-e2e-${testInfo.workerIndex}-${Date.now().toString(36)}`;
    SESSION = `cc-${SHORT}`;
    makeDirtyRepo(); killSession(); await startSession(request);
  });
  test.afterEach(async ({ request }) => {
    await request.delete(`/api/sessions/${encodeURIComponent(SESSION)}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    }).catch(() => {});
    killSession();
    if (repoDir) { rmSync(repoDir, { recursive: true, force: true }); repoDir = null; }
  });

  test('Git-Badge öffnet diff-view und rendert den Diff', async ({ authedPage }) => {
    await authedPage.goto('/');
    const badge = authedPage.locator(`.git-badge[data-diff-session="${SESSION}"]`);
    await expect(badge).toBeVisible({ timeout: 15000 });
    await badge.click();
    await expect(authedPage.locator('body')).toHaveAttribute('data-current-view', 'diff');

    // Datei-Liste zeigt die geänderte + die untracked Datei
    await expect(authedPage.locator('.diff-file', { hasText: 'a.txt' })).toBeVisible();
    await expect(authedPage.locator('.diff-file', { hasText: 'new.txt' })).toBeVisible();

    // Diff der gewählten Datei rendert (diff2html .d2h-wrapper ODER <pre>-Fallback)
    await authedPage.locator('.diff-file', { hasText: 'a.txt' }).click();
    const rendered = authedPage.locator('.diff-pane .d2h-wrapper, .diff-pane pre');
    await expect(rendered).toBeVisible({ timeout: 15000 });

    // Viewport-abhängiges Format NUR prüfen, wenn diff2html geladen wurde.
    const d2hLoaded = await authedPage.locator('.diff-pane .d2h-wrapper').count() > 0;
    if (d2hLoaded) {
      const width = authedPage.viewportSize().width;
      const sideCount = await authedPage.locator('.diff-pane .d2h-file-side-diff').count();
      if (width >= 900) {
        expect(sideCount, 'desktop → side-by-side').toBeGreaterThan(0);
      } else {
        expect(sideCount, 'mobile → line-by-line (kein side-by-side)').toBe(0);
      }
    }
  });

  test('Live-Refresh aktualisiert die Datei-Liste', async ({ authedPage }) => {
    await authedPage.goto('/');
    await authedPage.locator(`.git-badge[data-diff-session="${SESSION}"]`).click();
    await expect(authedPage.locator('.diff-file', { hasText: 'new.txt' })).toBeVisible({ timeout: 15000 });

    // Neue untracked Datei im Repo → Live-Refresh über den File-Watcher.
    // Der Watcher (server-seitig) abonniert erst, wenn der WS-`subscribeSession`
    // angekommen ist — das passiert kurz NACH dem Öffnen der Diff-View. Ein
    // einzelner Write direkt nach dem ersten Render kann dieses Fenster
    // verpassen (fs.watch hat kein Replay). Wir schreiben die Datei daher
    // periodisch neu, bis sie auftaucht: jeder Write ist ein frisches
    // Watcher-Event, also greift spätestens der erste nach dem Subscribe.
    const live = join(repoDir, 'live.txt');
    const liveRow = authedPage.locator('.diff-file', { hasText: 'live.txt' });
    let touch = 0;
    const ticker = setInterval(() => {
      if (!repoDir) return;
      try { writeFileSync(live, `added-live ${++touch}\n`); } catch {}
    }, 1000);
    try {
      await expect(liveRow).toBeVisible({ timeout: 15000 });
    } finally {
      clearInterval(ticker);
    }
  });
});
