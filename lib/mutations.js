// Mutex-geschützter Roadmap-Mutator für Claude Code Hub.
//
// Wieso ein Mutex? Ohne Serialisierung könnten zwei gleichzeitige PATCH-
// Requests dieselbe ROADMAP.md lesen, transformieren und schreiben — die
// zweite Schreiboperation überschreibt dann die erste (Lost-Update-Problem).
// Node.js ist single-threaded, aber async I/O macht race conditions möglich.
//
// Der Mutex hier ist per-Dateipfad: Operationen auf verschiedene Projekte
// laufen weiterhin parallel. Pro Prozess — kein gutes Story für Multi-Hub-
// Setups. CLAUDE.md dokumentiert Single-Hub-Betrieb; das reicht.
//
// Öffentliche API:
//   withFileLock(absPath, fn)          → awaits fn() serialized per absPath
//   mutateRoadmap(projectPath, mutator) → read + mutator + atomic write

import { promises as fs } from 'fs';
import { join } from 'path';

// ── withFileLock ──────────────────────────────────────────────────────────────
// Promise-chain-basierter Mutex: jeder neue Call hängt sich hinter den
// aktuellen Tail der Kette für denselben Pfad. Andere Pfade sind unabhängig.

const fileLocks = new Map(); // absPath → Promise (chain tail)

export async function withFileLock(absPath, fn) {
  const prev = fileLocks.get(absPath) || Promise.resolve();
  let release;
  const current = new Promise(resolve => { release = resolve; });
  fileLocks.set(absPath, prev.then(() => current));
  try {
    await prev;
    return await fn();
  } finally {
    release();
  }
}

// ── mutateRoadmap ─────────────────────────────────────────────────────────────
// Liest ROADMAP.md, ruft mutator(content) auf, schreibt das Ergebnis atomar
// zurück (tmp-Datei + rename). Wirft ENOENT unverändert weiter (Caller mappt
// auf 404). Alle anderen Fehler propagieren ebenfalls unverändert.
//
// mutator: (content: string) => { content: string, item?: object }
// Rückgabe: was mutator zurückgibt.

export async function mutateRoadmap(projectPath, mutator) {
  const roadmapPath = join(projectPath, 'ROADMAP.md');
  return withFileLock(roadmapPath, async () => {
    const content = await fs.readFile(roadmapPath, 'utf8');
    const result = mutator(content);
    if (!result || typeof result.content !== 'string') {
      throw new Error('mutator must return { content: string }');
    }
    const tmp = roadmapPath + '.tmp';
    await fs.writeFile(tmp, result.content, 'utf8');
    await fs.rename(tmp, roadmapPath);
    return result;
  });
}
