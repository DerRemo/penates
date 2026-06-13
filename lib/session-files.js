// lib/session-files.js — guarded session-scoped file reader (Express-frei,
// unit-testbar). Hält die strikte cwd-Scoping-Philosophie von files.js intakt:
// die breitere Reichweite (Temp-Dirs) ist hier isoliert + auditierbar. Lese-/
// Klassifikationslogik wird via readResolved aus files.js geteilt (DRY).
import { realpathSync } from 'fs';
import { resolve, relative, sep, join, dirname, basename } from 'path';
import { homedir, tmpdir } from 'os';
import { readResolved } from './files.js';

export class SessionFileError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // EOUTSIDE | ENOENT | TOOLARGE | UNKNOWN
  }
}

// realpath-aufgelöste Temp-Wurzeln: os.tmpdir() + /tmp (+ deren realpath, z.B.
// /private/tmp, /private/var/folders/... auf macOS). Fehlertolerant.
export function allowedTmpRoots() {
  const roots = new Set();
  for (const r of [tmpdir(), '/tmp']) {
    if (!r) continue;
    try { roots.add(realpathSync(r)); } catch { /* gone → skip */ }
  }
  return [...roots];
}

function isUnder(rootReal, absReal) {
  if (absReal === rootReal) return true;
  const rel = relative(rootReal, absReal);
  return !!rel && !rel.startsWith('..') && rel.split(sep)[0] !== '..';
}

// realpath des tiefsten existierenden Vorfahren + fehlende Segmente angehängt.
// So wird ein nicht-existenter Escape (../x) korrekt aufgelöst (→ Containment-
// Check erkennt EOUTSIDE), eine fehlende In-Scope-Datei aber als gültiger Pfad
// zurückgegeben (read wirft dann ENOENT).
function realpathDeepest(abs) {
  let existing = resolve(abs);
  const missing = [];
  while (true) {
    try {
      const real = realpathSync(existing);
      return missing.length ? resolve(real, ...missing) : real;
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      const parent = dirname(existing);
      if (parent === existing) return resolve(abs); // hit root, nothing exists
      missing.unshift(basename(existing));
      existing = parent;
    }
  }
}

// Löst inputPath (relativ/bare/~/absolut) gegen sessionCwd auf, realpath-t und
// erzwingt Containment unter cwd ODER einem Temp-Root. Sonst SessionFileError.
export function resolveSessionFile(sessionCwd, inputPath, opts = {}) {
  const home = opts.homedir || homedir();
  const tmpRoots = opts.tmpRoots || allowedTmpRoots();

  let target;
  if (inputPath === '~' || inputPath.startsWith('~/')) {
    target = join(home, inputPath.slice(1));
  } else if (inputPath.startsWith('/')) {
    target = inputPath;
  } else {
    target = join(sessionCwd, inputPath);
  }

  const real = realpathDeepest(target);

  const cwdReal = (() => { try { return realpathSync(sessionCwd); } catch { return sessionCwd; } })();
  const allowed = [cwdReal, ...tmpRoots];
  if (!allowed.some(root => isUnder(root, real))) {
    throw new SessionFileError('EOUTSIDE', `Path outside allowed scope: ${inputPath}`);
  }
  return real;
}

export async function readSessionFile(sessionCwd, inputPath, opts = {}) {
  const abs = resolveSessionFile(sessionCwd, inputPath, opts);
  try {
    return await readResolved(abs);
  } catch (e) {
    if (e && e.code === 'ENOENT') throw new SessionFileError('ENOENT', `File not found: ${inputPath}`);
    if (e && e.code === 'oversize') throw new SessionFileError('TOOLARGE', e.message);
    if (e && e.code === 'unsupported') throw new SessionFileError('UNKNOWN', e.message);
    if (e && e.code === 'not-a-file') throw new SessionFileError('ENOENT', e.message);
    throw e;
  }
}
