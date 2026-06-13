// Single source of truth for "which terminal tokens are previewable file paths".
// Browser-import (terminal link provider) AND node:test-import. Pure data/logic,
// no DOM. Curated extension allowlist (NOT "anything with a dot") so domains and
// versions (example.com, v1.2.3) never match — only their extension counts.

export const PREVIEWABLE_EXT = new Set([
  // images
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp',
  // documents
  'pdf',
  // text / code / data
  'txt', 'md', 'json', 'js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs',
  'py', 'rb', 'go', 'rs', 'java', 'c', 'h', 'cpp',
  'css', 'scss', 'html', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf',
  'sh', 'bash', 'zsh', 'sql', 'csv', 'tsv', 'log', 'diff', 'patch',
]);

// True if `token` (a single whitespace-free buffer token) looks like a previewable
// file path: not a URL, has a basename of the form `name.ext` (name non-empty) and
// `ext` ∈ PREVIEWABLE_EXT. Absolute (/…), home (~/…), relative (./… ../… a/b.ext)
// and bare (stats.png) all qualify — the allowlist is the discriminator.
export function isPreviewablePath(token) {
  if (typeof token !== 'string') return false;
  const s = token.trim();
  if (!s || s.length !== token.length) return false; // had surrounding whitespace
  if (/\s/.test(s)) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return false; // scheme://… → WebLinksAddon's job
  const base = s.slice(s.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return false;                 // no ext, or leading-dot dotfile (".gitignore")
  if (dot === base.length - 1) return false;  // trailing dot, no ext
  const ext = base.slice(dot + 1).toLowerCase();
  return PREVIEWABLE_EXT.has(ext);
}

// Trailing characters a CLI commonly appends right after a path with no space:
// closing brackets, sentence punctuation, quotes.
const TRAILING = /[)\]\}>.,;:!?'"]+$/;

// Tokenize a line on whitespace, return previewable matches as { text, start, end }
// where start/end are char offsets into the ORIGINAL line (so the link provider can
// map them to xterm cell coordinates). Strips trailing punctuation before matching,
// and the returned offsets cover only the bare path.
export function findPreviewableTokens(line) {
  if (typeof line !== 'string' || !line) return [];
  const out = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    const raw = m[0];
    const tStart = m.index;
    const trimmed = raw.replace(TRAILING, '');
    if (!trimmed) continue;
    if (isPreviewablePath(trimmed)) {
      out.push({ text: trimmed, start: tStart, end: tStart + trimmed.length });
    }
  }
  return out;
}
