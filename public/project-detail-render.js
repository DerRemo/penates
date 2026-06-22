import { relativeTo } from './relpath.js';

// Pure logic extracted from renderProjectDetail in index.html. No DOM or window
// references; collaborators (t, escapeHtml, renderMetaPills) are passed in a
// `deps` object. Tested in project-detail-render.test.js.

// Item-count label for a roadmap section head.
export function sectionCount(sectionKey, items) {
  const doneN = items.filter(i => i.done).length;
  return (sectionKey === 'released' || sectionKey === 'dev')
    ? `${doneN}/${items.length}`
    : `${items.length}`;
}

// Drag-reorder target index within one section. Returns null for a no-op (the
// caller returns early). Mirrors the inline drop math: dropping after a target
// lands one slot later; removing the source first shifts a downward move by one.
export function reorderTargetIndex(srcIndex, targetIndex, after) {
  let to = after ? targetIndex + 1 : targetIndex;
  if (srcIndex < to) to -= 1;
  return to === srcIndex ? null : to;
}

// Focus-restore tag classification. classList = any { contains(name) }.
export function focusTag(classList) {
  if (classList.contains('roadmap-checkbox')) return 'checkbox';
  if (classList.contains('roadmap-item-delete')) return 'delete';
  return null;
}

// Release-button visibility + version payload. The caller sets dataset.projectId
// from p.id and toggles `hidden` from `.show`.
export function releaseButtonState(p) {
  const devCount = (p.dev?.items || []).length;
  const hasVersions = !!(p.dev?.version && p.released?.version);
  return { show: devCount > 0 && hasVersions, dev: p.dev?.version, released: p.released?.version };
}

// One roadmap item <li>. Verbatim port of the inline template (index.html 7483).
export function renderItem(it, sectionKey, index, { t, escapeHtml, renderMetaPills }) {
  return `
          <li class="roadmap-item${it.done ? ' done' : ''}" data-section="${sectionKey}" data-line="${it.line}" data-index="${index}" draggable="true">
            <span class="roadmap-grip" aria-hidden="true" title="${t('projects.detail.dragHandle')}">⠿</span>
            <button class="roadmap-checkbox" type="button" aria-label="${it.done ? t('projects.detail.markAsOpen') : t('projects.detail.markAsDone')}">${it.done ? '[x]' : '[ ]'}</button>
            <span class="roadmap-text" tabindex="0" role="button" title="${t('projects.detail.editItem')}">${escapeHtml(it.text)}</span>
            ${renderMetaPills(it.meta)}
            <span class="roadmap-item-actions">
              <button class="roadmap-item-up" type="button" aria-label="${t('projects.detail.moveUp')}" title="${t('projects.detail.moveUp')}">▲</button>
              <button class="roadmap-item-down" type="button" aria-label="${t('projects.detail.moveDown')}" title="${t('projects.detail.moveDown')}">▼</button>
              <button class="roadmap-item-move" type="button" aria-label="${t('projects.detail.moveItem')}" title="${t('projects.detail.moveItem')}">⤴</button>
              <button class="roadmap-item-edit" type="button" aria-label="${t('projects.detail.editItem')}" title="${t('projects.detail.editItem')}">✎</button>
              <button class="roadmap-item-delete" type="button" aria-label="${t('projects.detail.deleteItem')}" title="${t('projects.detail.deleteTitle')}">×</button>
            </span>
          </li>`;
}

// One roadmap section <section>. `collapsed` is computed by the caller. Verbatim
// port of the inline template (index.html 7498).
export function renderSection({ label, version, items, sectionKey, collapsed }, deps) {
  const { t, escapeHtml, renderMetaPills } = deps;
  const count = sectionCount(sectionKey, items);
  return `
            <section class="roadmap-section${collapsed ? ' collapsed' : ''}" data-section="${sectionKey}">
              <button class="roadmap-section-head" type="button" data-section="${sectionKey}"
                      aria-expanded="${collapsed ? 'false' : 'true'}">
                <span class="roadmap-chevron" aria-hidden="true">▾</span>
                <span class="roadmap-section-label">${label}</span>
                ${version ? `<span class="roadmap-version" role="button" tabindex="0" data-version-edit data-section="${sectionKey}" title="${t('projects.detail.editVersion')}">v${escapeHtml(version)}</span>` : ''}
                <span class="roadmap-section-count">${count}</span>
              </button>
              ${items.length
                ? `<ul class="roadmap-list">${items.map((it, i) => renderItem(it, sectionKey, i, deps)).join('')}</ul>`
                : `<p class="roadmap-empty">${t('projects.detail.sectionEmpty')}</p>`}
              <button class="roadmap-add-btn" type="button" data-section="${sectionKey}">${t('projects.detail.addItem')}</button>
            </section>`;
}

// Changelog <section>, or '' when there is no changelog. Verbatim port (7572).
export function changelogSection(changelog, collapsed, { t, escapeHtml }) {
  return changelog
    ? `<section class="roadmap-section${collapsed ? ' collapsed' : ''}" data-section="changelog">
               <button class="roadmap-section-head" type="button" data-section="changelog"
                       aria-expanded="${collapsed ? 'false' : 'true'}">
                 <span class="roadmap-chevron" aria-hidden="true">▾</span>
                 <span class="roadmap-section-label">${t('projects.detail.sectionChangelog')}</span>
               </button>
               <pre class="roadmap-changelog">${escapeHtml(changelog)}</pre>
             </section>`
    : '';
}

// One linked-session <li>. Verbatim port (index.html 7522).
export function renderSessionItem(s, projectPath, { escapeHtml }) {
  const displayName = s.name.replace(/^cc-/, '');
  const relPath = relativeTo(s.path, projectPath);
  const statusLabel = s.status === 'dormant' ? 'dormant' : 'running';
  return `
            <li class="project-session-item" data-status="${s.status || 'running'}" data-name="${escapeHtml(s.name)}">
              <span class="project-session-dot" title="${statusLabel}"></span>
              <span class="project-session-name">${escapeHtml(displayName)}</span>
              <span class="project-session-path" title="${escapeHtml(s.path)}">${escapeHtml(relPath)}</span>
            </li>`;
}
