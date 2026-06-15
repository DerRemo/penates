// lib/session-images.js — Session-Image-Storage (Express-frei, unit-testbar).
// Reuse des Path-Guards aus lib/files.js (DRY) — kein eigener Guard-Nachbau.
import { mkdirSync, writeFileSync, existsSync, readFileSync, appendFileSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import { resolveSafe, FileError } from './files.js';

const DIR = '.penates-images';

// Lokale Zeit → "YYYY-MM-DD-HHMMSS".
function timestamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-` +
         `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// Kollisionssicherer Name innerhalb .penates-images/ (Suffix -1, -2, … wie suggestName in files.js).
function uniqueName(dirAbs, base, ext) {
  let name = `${base}.${ext}`;
  let i = 1;
  while (existsSync(join(dirAbs, name))) name = `${base}-${i++}.${ext}`;
  return name;
}

// Stellt sicher dass <cwd>/.gitignore eine eigene Zeile ".penates-images/" hat (idempotent).
// Funktioniert auch im Nicht-Repo (legt/ergänzt die Datei harmlos). Fehler werden geschluckt.
function ensureGitignore(cwd) {
  try {
    const gi = join(cwd, '.gitignore');
    const cur = existsSync(gi) ? readFileSync(gi, 'utf8') : '';
    const lines = cur.split('\n').map((l) => l.trim());
    if (lines.includes('.penates-images/') || lines.includes('.penates-images')) return;
    const prefix = cur && !cur.endsWith('\n') ? '\n' : '';
    appendFileSync(gi, `${prefix}.penates-images/\n`);
  } catch { /* best-effort */ }
}

export function saveSessionImage(cwd, buffer, { ext = 'png' } = {}) {
  const dirAbs = resolveSafe(cwd, DIR);          // Guard auf den Ordner
  mkdirSync(dirAbs, { recursive: true });
  const name = uniqueName(dirAbs, timestamp(), ext);
  const abs = resolveSafe(cwd, `${DIR}/${name}`); // Guard auch auf den finalen Pfad
  writeFileSync(abs, buffer);
  ensureGitignore(cwd);
  try { cleanupOldImages(cwd); } catch { /* best-effort */ }
  return { rel: `${DIR}/${name}`, abs };
}

export function cleanupOldImages(cwd, { maxAgeDays = 7 } = {}) {
  try {
    const dirAbs = resolveSafe(cwd, DIR);
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    for (const name of readdirSync(dirAbs)) {
      if (!name.toLowerCase().endsWith('.png')) continue;
      const abs = join(dirAbs, name);
      try {
        if (statSync(abs).mtimeMs < cutoff) unlinkSync(abs);
      } catch { /* skip */ }
    }
  } catch { /* Ordner fehlt / Permission → schlucken */ }
}
