import { test, expect } from './fixtures.js';
import { getToken } from './helpers.js';

// Navigation to projects tab is done via the sidebar nav button [data-sidebar-nav].
// The old .dashboard-tabs strip no longer exists — it was removed entirely in the
// app-shell redesign; sidebar navigation is the sole nav mechanism.
const NAV_PROJECTS = '[data-sidebar-nav="projects"]';

async function goToProjects(page) {
  // On mobile/tablet viewports the sidebar is hidden behind a hamburger menu
  const hamburger = page.locator('#sidebar-toggle');
  const needsHamburger = await hamburger.isVisible();
  if (needsHamburger) {
    await hamburger.click();
    await page.waitForSelector('body[data-sidebar-open="true"]', { timeout: 3_000 });
  }
  await page.click(NAV_PROJECTS);
  await page.waitForTimeout(500);
  // On mobile/tablet the sidebar drawer may still overlay the content — close it
  if (needsHamburger && await page.locator('body[data-sidebar-open="true"]').count()) {
    await hamburger.click();
    await page.waitForTimeout(300);
  }
}

test.describe('Projects', () => {
  test('projects tab shows project list', async ({ authedPage: page }) => {
    await goToProjects(page);
    await expect(page.locator('body')).toHaveAttribute('data-current-view', 'projects');
    const projectsPanel = page.locator('[data-view="projects"]');
    await expect(projectsPanel).toBeVisible({ timeout: 5_000 });
  });

  test('new project modal opens and closes', async ({ authedPage: page }) => {
    await goToProjects(page);

    await page.click('#new-project-btn');
    await expect(page.locator('#new-project-modal')).toHaveClass(/open/, { timeout: 3_000 });

    await page.click('#new-project-cancel');
    await expect(page.locator('#new-project-modal')).not.toHaveClass(/open/, { timeout: 3_000 });
  });

  test('project detail view opens on card click', async ({ authedPage: page }) => {
    await goToProjects(page);

    const projectCard = page.locator('.project-card').first();
    if (!(await projectCard.count())) {
      test.skip(true, 'no projects registered');
      return;
    }

    await projectCard.click();
    await page.waitForSelector('body[data-current-view="project-detail"]', { timeout: 5_000 });
    await expect(page.locator('#project-detail-view')).toBeVisible();
  });

  test('project detail shows roadmap items', async ({ authedPage: page }) => {
    await goToProjects(page);

    const projectCard = page.locator('.project-card').first();
    if (!(await projectCard.count())) {
      test.skip(true, 'no projects registered');
      return;
    }

    await projectCard.click();
    await page.waitForSelector('body[data-current-view="project-detail"]', { timeout: 5_000 });

    await page.waitForTimeout(1_000);
    await expect(page.locator('#project-detail-view')).toBeVisible();
  });

  test('back button returns to projects view from project detail', async ({ authedPage: page }) => {
    await goToProjects(page);

    const projectCard = page.locator('.project-card').first();
    if (!(await projectCard.count())) {
      test.skip(true, 'no projects registered');
      return;
    }

    await projectCard.click();
    await page.waitForSelector('body[data-current-view="project-detail"]', { timeout: 5_000 });

    // Phase-1-Refactor: Projekte sind eine eigene Top-Level-View mit eigenem
    // History-Eintrag → Zurück aus dem Detail kehrt in die Projekte-View zurück
    // (history.back() popt zum {view:projects}-Eintrag), nicht aufs Dashboard.
    await page.click('#project-back-btn');
    await page.waitForSelector('body[data-current-view="projects"]', { timeout: 5_000 });
  });

  test('roadmap checkbox toggle', async ({ authedPage: page }) => {
    await goToProjects(page);

    const projectCard = page.locator('.project-card').first();
    if (!(await projectCard.count())) {
      test.skip(true, 'no projects registered');
      return;
    }

    await projectCard.click();
    await page.waitForSelector('body[data-current-view="project-detail"]', { timeout: 5_000 });
    await page.waitForTimeout(1_000);

    const checkbox = page.locator('.roadmap-item input[type="checkbox"]').first();
    if (!(await checkbox.count())) {
      test.skip(true, 'no roadmap checkboxes');
      return;
    }

    const wasBefore = await checkbox.isChecked();
    await checkbox.click();
    await page.waitForTimeout(1_000);
    const isAfter = await checkbox.isChecked();
    expect(isAfter).not.toBe(wasBefore);

    // Toggle back to restore state
    await checkbox.click();
    await page.waitForTimeout(500);
  });

  test('new session from project detail', async ({ authedPage: page }) => {
    await goToProjects(page);

    const projectCard = page.locator('.project-card').first();
    if (!(await projectCard.count())) {
      test.skip(true, 'no projects registered');
      return;
    }

    await projectCard.click();
    await page.waitForSelector('body[data-current-view="project-detail"]', { timeout: 5_000 });
    await page.waitForTimeout(500);

    const newSessionBtn = page.locator('#project-new-session-btn');
    if (!(await newSessionBtn.isVisible())) {
      test.skip(true, 'no new-session button in project detail');
      return;
    }

    await newSessionBtn.click();
    await expect(page.locator('#new-session-modal')).toHaveClass(/open/, { timeout: 3_000 });

    // Cancel — don't actually create
    await page.click('#new-session-modal .modal-actions .btn-ghost');
    await expect(page.locator('#new-session-modal')).not.toHaveClass(/open/, { timeout: 3_000 });
  });
});
