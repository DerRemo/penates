import { parentRel } from './relpath.js';

// Pure logic extracted from the FileBrowser IIFE in index.html. No DOM or
// window references; collaborators are passed in as parameters. Tested in
// filebrowser-logic.test.js.

export function highlightMatch(name, match) {
  const esc = (s) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  if (!match || !match.indices || !match.indices.length) return esc(name);
  let out = '', last = 0;
  for (const [a, b] of match.indices) {
    out += esc(name.slice(last, a)) + '<span class="hl">' + esc(name.slice(a, b + 1)) + '</span>';
    last = b + 1;
  }
  out += esc(name.slice(last));
  return out;
}

// Returns the inclusive list of paths to add, or null when the anchor/target
// is not in the visible list (caller falls back to toggling the target).
export function selectionRange(orderedPaths, anchorPath, targetPath) {
  const from = orderedPaths.indexOf(anchorPath);
  const to = orderedPaths.indexOf(targetPath);
  if (from === -1 || to === -1) return null;
  const [a, b] = from < to ? [from, to] : [to, from];
  return orderedPaths.slice(a, b + 1);
}

// Per-projectId WS seq monotonicity. Non-number seq always accepted, last kept.
export function seqGate(lastSeq, seq) {
  if (typeof seq === 'number' && seq <= lastSeq) return { accept: false, next: lastSeq };
  return { accept: true, next: typeof seq === 'number' ? seq : lastSeq };
}

// In-tree drag move/copy decision. `rel` must already be trailing-slash-stripped.
export function moveCopyDecision(rel, destDir, copy) {
  if (!copy && destDir === parentRel(rel)) return 'noop';
  if (destDir === rel || destDir.startsWith(rel + '/')) return 'self-error';
  return 'apply';
}

export function dropEffect(isFiles, modifierHeld) {
  return isFiles ? 'copy' : (modifierHeld ? 'copy' : 'move');
}

// Resolve the file-source for a session: a registered project match wins over
// a session pseudo-id. needsRetry signals the caller to retry after the
// projects cache warms up.
export function resolveFileSource(session, projectsCache, findMatchingProject, sessionName) {
  const match = (session && Array.isArray(projectsCache))
    ? findMatchingProject(session.path, projectsCache)
    : null;
  if (match) {
    return { id: match.id, path: match.path, name: match.displayName || match.name, needsRetry: false };
  }
  return {
    id: 'session:' + sessionName,
    path: (session && session.path) || '',
    name: (session && session.name) || sessionName,
    needsRetry: !!(session && !projectsCache),
  };
}

export function breadcrumbRootName(project) {
  return (project && (project.name || (project.path || '').split('/').filter(Boolean).pop())) || '/';
}

export function nextBackoff(currentMs) {
  return Math.min(currentMs * 2, 30_000);
}

export function isEntryVisible(entry, hideIgnored) {
  return !(hideIgnored && entry.ignored);
}
