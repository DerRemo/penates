// Reines Modul: Conventional-Commit-Typ → Catppuccin-Token-Farbe. Browser
// (RepoHistory) UND node:test nutzen dieselbe Datei (Muster wie clis.js).
// Kein DOM. Unbekannt / kein Typ → null (neutral rendern).

// Typ am Subject-Anfang: "<type>[optional (scope)][optional !]: ".
const TYPE_RE = /^([a-z]+)(?:\([^)]*\))?!?:\s/;

export function commitType(subject) {
  const m = TYPE_RE.exec(String(subject || ''));
  return m ? m[1] : null;
}

// Typ → CSS-Custom-Property-Name (ohne var()). Fallback null.
const COLORS = {
  feat: '--green',
  fix: '--orange',
  refactor: '--accent',
  perf: '--green',
  docs: '--text-muted',
  test: '--accent',
  chore: '--text-muted',
  style: '--text-muted',
  build: '--text-muted',
  ci: '--text-muted',
  revert: '--red',
};

export function commitTypeColor(subject) {
  const t = commitType(subject);
  return (t && COLORS[t]) || null;
}
