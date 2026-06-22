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
