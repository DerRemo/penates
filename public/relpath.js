// Project-relative path helpers. Paths are '/'-separated, with no leading or
// trailing slash assumed. Shared by FileBrowser and (later) the project-detail
// and terminal phases of the index.html mega-function extraction.

export function parentRel(rel) {
  return rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
}

export function basename(rel) {
  const i = rel.lastIndexOf('/');
  return i === -1 ? rel : rel.slice(i + 1);
}

// Path relative to a base it is equal-to or under. '/'-separated; the caller
// guarantees `path` is `base` or a descendant of it. Born in the project-detail
// phase (renderSessionItem); generic for the later terminal phase.
export function relativeTo(path, base) {
  return path === base ? '.' : path.slice(base.length + 1);
}
