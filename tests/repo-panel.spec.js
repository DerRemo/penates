// E2E für das Repo-Panel: History-Timeline (P-B) + Branches (P-C).
// Baut pro Test ein Mehr-Commit-Temp-Repo mit zweitem Branch und startet eine
// cc-Session darin (API), navigiert dann via Session-Card.
import { test, expect } from './fixtures.js';
import { navigateToSession, waitForTerminal } from './helpers.js';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';

async function repoSession(page) {
  const dir = mkdtempSync(join(tmpdir(), 'penates-repo-'));
  const g = (...a) => execFileSync('git', ['-C', dir, ...a]);
  g('init', '-q'); g('config', 'user.email', 't@t'); g('config', 'user.name', 't');
  writeFileSync(join(dir, 'a.txt'), '1\n'); g('add', '.'); g('commit', '-qm', 'feat: a');
  writeFileSync(join(dir, 'b.txt'), '2\n'); g('add', '.'); g('commit', '-qm', 'fix: b');
  writeFileSync(join(dir, 'a.txt'), '1\n2\n'); g('add', '.'); g('commit', '-qm', 'docs: edit a');
  g('branch', 'feature/x');
  const name = `e2e-repo-${Date.now()}`;
  const token = await page.evaluate(() => localStorage.getItem('penates_token'));
  await page.request.post('/api/sessions', {
    headers: { Authorization: `Bearer ${token}` },
    data: { name, directory: dir, command: 'bash --noprofile --norc' },
  });
  return { name: `cc-${name}`, token, dir, cleanup: async () => {
    await page.request.delete(`/api/sessions/cc-${encodeURIComponent(name)}`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  } };
}

test.describe('Repo panel — History (P-B)', () => {
  test('History lists commits and tapping one opens it in Changes', async ({ authedPage: page, isTouch }) => {
    test.skip(isTouch, 'panels are overlays on touch');
    const s = await repoSession(page);
    try {
      await navigateToSession(page, s.name);
      await waitForTerminal(page);
      await page.locator('#btn-toggle-repo').click();
      await page.locator('#repo-tab-history').click();
      const commits = page.locator('#history-list .history-commit');
      await expect(commits.first()).toBeVisible({ timeout: 10_000 });
      expect(await commits.count()).toBeGreaterThanOrEqual(3);
      // Ref-Badge am HEAD-Commit (main/master).
      await expect(page.locator('#history-list .history-commit .hc-ref').first()).toBeVisible();
      // Tap → Changes zeigt den Commit.
      await commits.first().click();
      await expect(page.locator('#repo-tab-changes')).toHaveClass(/active/);
      await expect(page.locator('#changes-source')).toContainText(/Commit/i);
      await expect(page.locator('#changes-back')).toBeVisible();
      await expect(page.locator('#changes-list .changes-row').first()).toBeVisible({ timeout: 10_000 });
      // Back → Working tree.
      await page.locator('#changes-back').click();
      await expect(page.locator('#changes-back')).toBeHidden();
    } finally { await s.cleanup(); }
  });
});

test.describe('Repo panel — Branches (P-C)', () => {
  test('Branches lists local branches with a current marker', async ({ authedPage: page, isTouch }) => {
    test.skip(isTouch, 'panels are overlays on touch');
    const s = await repoSession(page);
    try {
      await navigateToSession(page, s.name);
      await waitForTerminal(page);
      await page.locator('#btn-toggle-repo').click();
      await page.locator('#repo-tab-branches').click();
      const rows = page.locator('#branches-list .branch-row');
      await expect(rows.first()).toBeVisible({ timeout: 10_000 });
      // feature/x + (main|master) = mind. 2 lokale Branches.
      expect(await rows.count()).toBeGreaterThanOrEqual(2);
      await expect(page.locator('#branches-list .branch-row.current .br-current')).toBeVisible();
    } finally { await s.cleanup(); }
  });
});
