import { test, expect } from './fixtures.js';
import { navigateToSession, waitForTerminal } from './helpers.js';
import { mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';

test.describe('Terminal-View redesign', () => {
  test('back button is hidden on desktop, visible on touch', async ({ authedPage: page, hubSession, isTouch }) => {
    await navigateToSession(page, hubSession.name);
    await waitForTerminal(page);
    const back = page.locator('#disconnect-btn');
    if (isTouch) {
      await expect(back).toBeVisible();
    } else {
      await expect(back).toBeHidden();
    }
  });

  test('conn-status pill is hidden once connected', async ({ authedPage: page, hubSession }) => {
    await navigateToSession(page, hubSession.name);
    await waitForTerminal(page);
    const status = page.locator('#conn-status');
    // Logik unverändert: data-state wird auf 'connected' gesetzt …
    await expect(status).toHaveAttribute('data-state', 'connected', { timeout: 15_000 });
    // … aber per CSS display:none — also nicht sichtbar.
    await expect(status).toBeHidden();
  });

  test('toolbar is icon-only with a hairline divider', async ({ authedPage: page, hubSession }) => {
    await navigateToSession(page, hubSession.name);
    await waitForTerminal(page);
    // Keine sichtbaren Button-Labels in der Terminal-Toolbar.
    const visibleLabels = page.locator('.terminal-toolbar .btn-label:visible');
    await expect(visibleLabels).toHaveCount(0);
    // Hairline-Divider vorhanden.
    await expect(page.locator('.terminal-toolbar-divider')).toHaveCount(1);
  });

  test('panel toggle shows active state when its panel is open', async ({ authedPage: page, hubSession, isTouch }) => {
    test.skip(isTouch, 'panels are fullscreen overlays on touch — toolbar toggles not clickable');
    await navigateToSession(page, hubSession.name);
    await waitForTerminal(page);
    const filesBtn = page.locator('#btn-toggle-files');
    // Der Files-Toggle ist nur sichtbar, wenn die Session aktivierbar ist.
    if (!(await filesBtn.isVisible())) test.skip(true, 'files toggle not available for this session');
    await expect(filesBtn).not.toHaveClass(/is-active/);
    await filesBtn.click();
    await page.waitForSelector('#files-sidebar.open', { timeout: 5_000 });
    await expect(filesBtn).toHaveClass(/is-active/);
  });

  test('toolbar buttons carry data-tooltip', async ({ authedPage: page, hubSession }) => {
    await navigateToSession(page, hubSession.name);
    await waitForTerminal(page);
    await expect(page.locator('#btn-toggle-search')).toHaveAttribute('data-tooltip', 'Search');
    await expect(page.locator('#image-picker-btn')).toHaveAttribute('data-tooltip', 'Insert image');
  });

  test('git-dot reflects a dirty session cwd', async ({ authedPage: page, isTouch }) => {
    test.skip(isTouch, 'diff toggle is hidden behind overlays on touch');
    const dir = mkdtempSync(join(tmpdir(), 'cchub-gitdot-'));
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 't@t'], { cwd: dir });
    execFileSync('git', ['config', 'user.name', 't'], { cwd: dir });
    writeFileSync(join(dir, 'a.txt'), 'committed\n');
    execFileSync('git', ['add', '.'], { cwd: dir });
    execFileSync('git', ['commit', '-qm', 'init'], { cwd: dir });
    // Uncommitted change → dirty.
    writeFileSync(join(dir, 'a.txt'), 'changed\n');

    const name = `e2e-gitdot-${Date.now()}`;
    const token = await page.evaluate(() => localStorage.getItem('cchub_token'));
    await page.request.post('/api/sessions', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name, directory: dir, command: 'bash --noprofile --norc' },
    });
    try {
      await navigateToSession(page, `cc-${name}`);
      await waitForTerminal(page);
      await expect(page.locator('#btn-toggle-diff')).toHaveAttribute('data-dirty', 'true', { timeout: 10_000 });
    } finally {
      await page.request.delete(`/api/sessions/cc-${encodeURIComponent(name)}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
  });

  test('terminal container is a rounded card on desktop', async ({ authedPage: page, hubSession, isTouch }) => {
    test.skip(isTouch, 'mobile is near full-bleed (radius 0)');
    await navigateToSession(page, hubSession.name);
    await waitForTerminal(page);
    const radius = await page.locator('#terminal-container').evaluate(
      el => getComputedStyle(el).borderTopLeftRadius
    );
    expect(parseInt(radius, 10)).toBeGreaterThan(0);
  });

  test('connecting overlay clears once connected', async ({ authedPage: page, hubSession }) => {
    await navigateToSession(page, hubSession.name);
    await waitForTerminal(page);
    await expect(page.locator('#conn-status')).toHaveAttribute('data-state', 'connected', { timeout: 15_000 });
    await expect(page.locator('#terminal-container')).not.toHaveClass(/is-connecting/);
    await expect(page.locator('#term-connecting')).toBeHidden();
  });

  test('terminal card shows a focus ring class on focus', async ({ authedPage: page, hubSession }) => {
    await navigateToSession(page, hubSession.name);
    await waitForTerminal(page);
    await page.locator('#terminal-container').click();
    await expect(page.locator('#terminal-container')).toHaveClass(/term-focused/);
  });

  test('session name shows CLI logo and cwd tooltip', async ({ authedPage: page, hubSession }) => {
    await navigateToSession(page, hubSession.name);
    await waitForTerminal(page);
    // Logo-Slot enthält ein SVG (Brand oder Fallback-Glyph).
    await expect(page.locator('#terminal-cli-logo svg')).toBeVisible();
    // cwd-Tooltip auf der Namen-Gruppe ist gesetzt (nicht leer). Auf der Gruppe
    // statt dem Namen-Span, weil dessen overflow:hidden das ::after klippen würde.
    const tip = await page.locator('.terminal-name-group').getAttribute('data-tooltip');
    expect(tip && tip.length).toBeTruthy();
  });

  test('double-click renames the session inline', async ({ authedPage: page }) => {
    const name = `e2e-tname-${Date.now()}`;
    const newName = `e2e-tname2-${Date.now()}`;
    const token = await page.evaluate(() => localStorage.getItem('cchub_token'));
    await page.request.post('/api/sessions', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name, directory: '/tmp', command: 'bash --noprofile --norc' },
    });
    try {
      await navigateToSession(page, `cc-${name}`);
      await waitForTerminal(page);
      await page.locator('#terminal-session-name').dblclick();
      const input = page.locator('.terminal-name-group .rename-input');
      await expect(input).toBeVisible();
      await input.fill(newName);
      await input.press('Enter');
      await expect(page.locator('#terminal-session-name')).toHaveText(newName, { timeout: 10_000 });
    } finally {
      // unter beiden möglichen Namen aufräumen
      await page.request.delete(`/api/sessions/cc-${encodeURIComponent(newName)}`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
      await page.request.delete(`/api/sessions/cc-${encodeURIComponent(name)}`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    }
  });
});
