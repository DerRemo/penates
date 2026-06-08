import { expect } from '@playwright/test';

export function getToken(page) {
  return page.evaluate(() => localStorage.getItem('cchub_token'));
}

export async function createSessionViaUI(page, { name, dir, command = 'bash --noprofile --norc' }) {
  await page.click('#new-session-btn');
  await page.waitForSelector('#new-session-modal.open', { timeout: 5_000 });
  await page.fill('#new-session-name', name);

  if (dir) {
    await page.click('#tree-selected');
    await page.waitForTimeout(300);
    const token = await getToken(page);
    await page.evaluate(([d, sel]) => {
      document.querySelector(sel).textContent = d;
    }, [dir, '#tree-selected']);
  }

  if (command !== 'claude') {
    await page.selectOption('#new-session-cmd', { label: command });
  }

  await page.click('#new-session-modal .modal-actions .btn-primary');
  await page.waitForSelector('#new-session-modal:not(.open)', { timeout: 5_000 });
}

export async function ensureSidebarClosed(page) {
  // On mobile/tablet viewports (<=899px) the sidebar is a drawer that overlays
  // the main content. If it's open, close it so subsequent clicks aren't blocked.
  if (await page.locator('body[data-sidebar-open="true"]').count()) {
    const hamburger = page.locator('#sidebar-toggle');
    if (await hamburger.isVisible()) {
      await hamburger.click();
      await page.waitForTimeout(300);
    }
  }
}

export async function ensureSidebarOpen(page) {
  // On mobile/tablet viewports (<=899px) the sidebar is an off-canvas drawer.
  // Open it so its nav items / settings entry become clickable. No-op on
  // desktop — the hamburger is display:none there, so isVisible() is false.
  const hamburger = page.locator('#sidebar-toggle');
  if ((await hamburger.isVisible()) && !(await page.locator('body[data-sidebar-open="true"]').count())) {
    await hamburger.click();
    await page.waitForSelector('body[data-sidebar-open="true"]', { timeout: 3_000 });
  }
}

export async function navigateToSession(page, sessionName) {
  // On mobile/tablet viewports, ensure the sidebar drawer is closed so it
  // doesn't block clicks on session cards in the main content area.
  await ensureSidebarClosed(page);
  const card = page.locator(`.session-card[data-name="${sessionName}"]`);
  await card.waitFor({ timeout: 10_000 });
  await card.click();
  await page.waitForSelector('body[data-current-view="terminal"]', { timeout: 10_000 });
}

export async function waitForTerminal(page) {
  await page.waitForSelector('#terminal-container .xterm-screen', { timeout: 8_000 });
  await page.waitForTimeout(500);
}

export async function goBackToDashboard(page) {
  // Back-Button ist nur auf Touch-Viewports (pointer:coarse) sichtbar. Auf
  // Desktop/Laptop führt der Weg zurück über die Sidebar bzw. history.back().
  const backBtn = page.locator('#disconnect-btn');
  if (await backBtn.isVisible()) {
    await backBtn.click();
  } else {
    await page.goBack();
  }
  await page.waitForSelector('body[data-current-view="dashboard"]', { timeout: 10_000 });
}

export async function deleteSessionViaAPI(page, sessionName) {
  const token = await getToken(page);
  await page.request.delete(`/api/sessions/${encodeURIComponent(sessionName)}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});
}

export async function dismissModal(page) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

export async function openFileSidebar(page) {
  // Der Files-Tree lebt jetzt im Repo-Panel (Files-Tab). Panel öffnen, dann
  // den Files-Tab aktivieren; der Tree rendert in #files-tree (jetzt im
  // #repo-pane-files).
  const panel = page.locator('#repo-panel');
  const isOpen = await panel.evaluate(el => el.classList.contains('open'));
  if (!isOpen) {
    await page.click('#btn-toggle-repo');
    await page.waitForSelector('#repo-panel.open', { timeout: 5_000 });
  }
  await page.click('#repo-tab-files');
  await page.waitForSelector('#repo-pane-files.active', { timeout: 5_000 });
  await page.waitForSelector('#files-tree .file-row', { timeout: 8_000 });
}

export async function createTempFolderViaAPI(page, projectId, namePrefix = 'e2e-tmp') {
  const token = await getToken(page);
  const name = `${namePrefix}-${Date.now()}`;
  const res = await page.request.post(`/api/projects/${projectId}/files/mkdir`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { path: '', name },
  });
  if (!res.ok()) throw new Error(`mkdir failed: ${await res.text()}`);
  return name;
}

export async function deletePathViaAPI(page, projectId, relPath) {
  const token = await getToken(page);
  await page.request.delete(`/api/projects/${projectId}/files`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { paths: [relPath] },
  });
}

export function getViewportCategory(testInfo) {
  const name = testInfo.project.name;
  if (['mobile', 'mobile-small'].includes(name)) return 'mobile';
  if (name === 'tablet') return 'tablet';
  return 'desktop';
}
