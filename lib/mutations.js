// Mutex-geschützter Roadmap-Mutator für Penates.
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
//   mutateRoadmap(projectPath, mutator) → read + mutator + atomic write +
//                                         parse, gibt { roadmap } frisch
//                                         inside-lock zurück (keine Race
//                                         mit konkurrenten Writern)

import { promises as fs } from 'fs';
import { join } from 'path';
import { parseRoadmap } from './roadmap.js';
import { noteSelfWrite } from './project-watcher.js';

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
// zurück (tmp-Datei + rename), parst den neuen Inhalt und gibt beides zurück.
// Das Parsen passiert inside-lock, damit der Caller garantiert den State
// sieht, den er gerade erzeugt hat — keine Race mit einem konkurrenten
// Schreiber, der zwischen Write und Re-Read einschlüpft.
//
// Wirft ENOENT unverändert weiter (Caller mappt auf 404). Alle anderen
// Fehler propagieren ebenfalls unverändert.
//
// mutator:  (content: string) => { content: string, item?: object }
// Rückgabe: { roadmap: ParsedRoadmap, mutatorResult }

export async function mutateRoadmap(projectPath, mutator) {
  // Idea-Pipeline-Cutover: bevorzugt CHANGELOG.md, fällt auf ROADMAP.md zurück
  // (un-migrierte Projekte). Inline statt Import aus projects.js → kein Zyklus.
  let roadmapPath = join(projectPath, 'CHANGELOG.md');
  try { await fs.access(roadmapPath); } catch { roadmapPath = join(projectPath, 'ROADMAP.md'); }
  return withFileLock(roadmapPath, async () => {
    const content = await fs.readFile(roadmapPath, 'utf8');
    const mutatorResult = mutator(content);
    if (!mutatorResult || typeof mutatorResult.content !== 'string') {
      throw new Error('mutator must return { content: string }');
    }
    // Self-Write vor dem Rename markieren — der nachgelagerte fs.watch-Event
    // wird im project-watcher gedroppt, damit der Client, der die Mutation
    // eben ausgelöst hat, keinen zweiten Broadcast/Re-Fetch erlebt.
    noteSelfWrite(roadmapPath);
    const tmp = roadmapPath + '.tmp';
    await fs.writeFile(tmp, mutatorResult.content, 'utf8');
    await fs.rename(tmp, roadmapPath);
    const roadmap = parseRoadmap(mutatorResult.content);
    return { roadmap, mutatorResult };
  });
}
