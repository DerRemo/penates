// E2E für den Diff-Viewer, jetzt das Changes-Tab im Repo-Panel (P-A): Repo-
// Toggle → Repo-Panel → Changes-Tab, List⇄Diff-Toggle, diff2html-Render,
// Live-Refresh, ein konsolidierter Repo-Toggle (kein separater Files/Diff),
// Git-Dot am Repo-Toggle.
//
// Die Session wird als FOREIGN tmux-Session erstellt (direkt via `tmux
// new-session`, KEIN cc-Prefix, KEIN API-Call) in einem dirty Git-Repo. Der
// Hub listet foreign Sessions; deren Card trägt den Git-Badge, weil das Backend
// für jede Session mit auflösbarem cwd `git` liefert. Foreign (z.B. Moshi-
// gestartete) Sessions sind das Kern-Interop-Szenario.
import { test, expect } from './fixtures.js';
import { ensureSidebarOpen } from './helpers.js';
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

// Navigiert robust zur (foreign) Session. Der `[data-session]`-Eintrag lebt im
// Sidebar — auf Mobile ist das ein Off-Canvas-Drawer, der erst geöffnet werden
// muss (sonst ist der Eintrag „outside of the viewport"); auf Desktop ist die
// Sidebar permanent sichtbar (ensureSidebarOpen ist dort ein No-Op).
async function openSession(page) {
  await page.goto('/');
  await ensureSidebarOpen(page);
  const card = page.locator(`[data-session="${SESSION}"]`);
  await card.waitFor({ timeout: 10000 });
  await card.scrollIntoViewIfNeeded();
  await card.click();
  await expect(page.locator('body')).toHaveAttribute('data-current-view', 'terminal');
}

// Öffnet das Repo-Panel auf dem Changes-Tab für die aktive Session.
async function openChanges(page) {
  const repoToggle = page.locator('#btn-toggle-repo');
  await expect(repoToggle).toBeVisible({ timeout: 8000 });
  await repoToggle.click();
  await expect(page.locator('#repo-panel')).toHaveClass(/open/, { timeout: 10000 });
  await page.locator('#repo-tab-changes').click();
  await expect(page.locator('#repo-pane-changes')).toHaveClass(/active/, { timeout: 5000 });
}

test.describe('Repo panel — Changes (P-A)', () => {
  test.beforeEach(async ({}, testInfo) => {
    SESSION = `diff-e2e-${testInfo.workerIndex}-${Date.now().toString(36)}`;
    makeDirtyRepo(); killSession(); startSession();
  });
  test.afterEach(async () => {
    killSession();
    if (repoDir) { rmSync(repoDir, { recursive: true, force: true }); repoDir = null; }
  });

  test('one Repo toggle (no separate Files/Diff) opens the panel', async ({ authedPage, isTouch }) => {
    await openSession(authedPage);
    // Konsolidierung: keine separaten Files-/Diff-Toggles mehr.
    await expect(authedPage.locator('#btn-toggle-files')).toHaveCount(0);
    await expect(authedPage.locator('#btn-toggle-diff')).toHaveCount(0);
    const repoToggle = authedPage.locator('#btn-toggle-repo');
    await expect(repoToggle).toBeVisible({ timeout: 8000 });
    test.skip(isTouch, 'panels are fullscreen overlays on touch — toolbar toggles not clickable');
    await repoToggle.click();
    await expect(authedPage.locator('#repo-panel')).toHaveClass(/open/, { timeout: 10000 });
  });

  test('Changes shows working-tree diff with List⇄Diff toggle', async ({ authedPage, isTouch }) => {
    test.skip(isTouch, 'panels are fullscreen overlays on touch — toolbar toggles not clickable');
    await openSession(authedPage);
    await openChanges(authedPage);

    // List-Modus: die geänderte + die untracked Datei als Zeilen.
    await expect(authedPage.locator('#repo-pane-changes')).toHaveClass(/mode-list/);
    await expect(authedPage.locator('#changes-list .changes-row', { hasText: 'a.txt' })).toBeVisible({ timeout: 10000 });
    await expect(authedPage.locator('#changes-list .changes-row', { hasText: 'new.txt' })).toBeVisible();

    // Klick auf Zeile → Diff-Modus + diff2html (.d2h-wrapper ODER <pre>-Fallback).
    await authedPage.locator('#changes-list .changes-row', { hasText: 'a.txt' }).click();
    await expect(authedPage.locator('#repo-pane-changes')).toHaveClass(/mode-diff/);
    // Diff rendert über den internen .udiff-Renderer (repo-panel-Redesign;
    // diff2html .d2h-wrapper / <pre> sind Alt-Fallbacks).
    await expect(authedPage.locator('#diff-pane .udiff, #diff-pane .d2h-wrapper, #diff-pane pre')).toBeVisible({ timeout: 15000 });

    // Zurück zu List.
    await authedPage.locator('#changes-mode-list').click();
    await expect(authedPage.locator('#repo-pane-changes')).toHaveClass(/mode-list/);
  });

  test('Repo-Toggle ist mit dem Preview-Panel gegenseitig exklusiv', async ({ authedPage, isTouch }) => {
    // Auf Touch sind die Panels Vollbild-Overlays, die die Toolbar überdecken —
    // die Toggles sind dann nicht per Klick erreichbar.
    test.skip(isTouch, 'panels are fullscreen overlays on touch — toolbar toggles not clickable');
    await openSession(authedPage);

    const repoToggle = authedPage.locator('#btn-toggle-repo');
    await expect(repoToggle).toBeVisible({ timeout: 8000 });
    await repoToggle.click();
    await expect(authedPage.locator('#repo-panel')).toHaveClass(/open/, { timeout: 8000 });

    // Preview öffnen → Repo schließt.
    await authedPage.click('#btn-toggle-preview');
    await expect(authedPage.locator('#preview-panel')).toHaveClass(/open/, { timeout: 5000 });
    await expect(authedPage.locator('#repo-panel')).not.toHaveClass(/open/);

    // Repo wieder öffnen → Preview schließt.
    await repoToggle.click();
    await expect(authedPage.locator('#repo-panel')).toHaveClass(/open/);
    await expect(authedPage.locator('#preview-panel')).not.toHaveClass(/open/);
  });

  test('git-dot am Repo-Toggle wenn die cwd dirty ist', async ({ authedPage }) => {
    await openSession(authedPage);
    await expect(authedPage.locator('#btn-toggle-repo')).toHaveAttribute('data-dirty', 'true', { timeout: 12000 });
  });

  test('Live-Refresh aktualisiert die Changes-Liste', async ({ authedPage, isTouch }) => {
    test.skip(isTouch, 'panels are fullscreen overlays on touch — toolbar toggles not clickable');
    await openSession(authedPage);
    await openChanges(authedPage);
    await expect(authedPage.locator('#changes-list .changes-row', { hasText: 'new.txt' })).toBeVisible({ timeout: 15000 });

    // Neue untracked Datei im Repo → Live-Refresh über den File-Watcher.
    // Der Watcher (server-seitig) abonniert erst, wenn der WS-`subscribeSession`
    // angekommen ist — das passiert kurz NACH dem Öffnen der Changes-View. Wir
    // schreiben die Datei daher periodisch neu, bis sie auftaucht.
    await expect(async () => {
      writeFileSync(join(repoDir, 'live.txt'), 'added-live\n');
      await expect(authedPage.locator('#changes-list .changes-row', { hasText: 'live.txt' })).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 12000 });
  });
});
