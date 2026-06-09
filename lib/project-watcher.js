// fs.watch-Pipeline für ROADMAP.md-Dateien der registrierten Projekte.
//
// Öffentliche API:
//   syncWatchers(registry)        Watcher mit aktueller Registry abgleichen
//   noteSelfWrite(absPath)        unterdrückt den nächsten change-Event für
//                                 diesen Pfad (innerhalb SELF_WRITE_TTL_MS)
//   subscribe(fn)                 Listener-Callback: (event) => void
//                                 event = { type: 'project-changed', id, seq }
//   unsubscribe(fn)               Listener wieder abmelden
//   closeAll()                    beim Shutdown alle Watcher schließen
//
// Design-Entscheidungen:
//
// 1. Ein Watcher pro ROADMAP.md — nicht pro Verzeichnis. fs.watch auf eine
//    einzelne Datei ist simpler (keine Filter-Logic) und auf macOS ebenso
//    performant wie Directory-Watchers mit Filtering.
//
// 2. macOS fs.watch liefert bei atomic tmp+rename-Writes (unser mutateRoadmap)
//    ein `rename`-Event statt `change`. Der Watcher-Handle wird damit stale,
//    weil er auf dem alten inode hängt. Wir schließen bei `rename` und re-
//    öffnen auf demselben Pfad — mit kurzer Grace-Period, falls die Datei
//    noch nicht wieder da ist.
//
// 3. Debounce pro Projekt: 80 ms. Editor-Tools schreiben oft in mehreren
//    Schüben (chmod + rename + touch), das Event-Cluster soll zu einem
//    einzigen Broadcast zusammenlaufen.
//
// 4. Sequence-ID pro Projekt: der Frontend-Client kann damit out-of-order-
//    Fetches erkennen und die stale Response verwerfen. Sequenz monoton
//    steigend, nur beim tatsächlichen Broadcast erhöht.
//
// 5. Self-Write-Suppression: mutateRoadmap ruft vor dem Write `noteSelfWrite`
//    auf. Der Watcher droppt dann Events für diesen Pfad innerhalb einer
//    kurzen TTL — der Client, der die Mutation ausgelöst hat, rendert schon
//    aus der HTTP-Response und braucht kein zweites Round-Trip.

import { watch, existsSync } from 'fs';
import { join } from 'path';

const DEBOUNCE_MS = 80;
const SELF_WRITE_TTL_MS = 400;
const REOPEN_DELAY_MS = 50;

// projectId → { watcher, path, debounceTimer, seq, reopenTimer }
const watchers = new Map();

// absPath → timestamp; any event before that timestamp is dropped.
const selfWriteSuppression = new Map();

// Set<Function> — subscriber callbacks.
const listeners = new Set();

function broadcast(event) {
  for (const fn of listeners) {
    try { fn(event); } catch (e) { console.error('[project-watcher] listener:', e); }
  }
}

function shouldSuppress(absPath) {
  const deadline = selfWriteSuppression.get(absPath);
  if (!deadline) return false;
  if (Date.now() > deadline) {
    selfWriteSuppression.delete(absPath);
    return false;
  }
  return true;
}

function scheduleChange(id, path) {
  const state = watchers.get(id);
  if (!state) return;
  if (shouldSuppress(path)) return;
  if (state.debounceTimer) clearTimeout(state.debounceTimer);
  state.debounceTimer = setTimeout(() => {
    state.debounceTimer = null;
    state.seq++;
    broadcast({ type: 'project-changed', id, seq: state.seq });
  }, DEBOUNCE_MS);
}

function openWatcher(id, path) {
  let watcher;
  try {
    watcher = watch(path, { persistent: false }, (eventType /*, filename */) => {
      if (eventType === 'rename') {
        // Die watched Datei wurde ersetzt (atomic rename aus mutateRoadmap)
        // oder gelöscht. Handle wird stale — neu aufziehen.
        const state = watchers.get(id);
        if (!state || state.watcher !== watcher) return;
        try { watcher.close(); } catch {}
        state.watcher = null;
        if (state.reopenTimer) clearTimeout(state.reopenTimer);
        state.reopenTimer = setTimeout(() => {
          state.reopenTimer = null;
          if (!watchers.has(id)) return; // zwischenzeitlich detached
          const fresh = openWatcher(id, path);
          if (fresh) {
            state.watcher = fresh;
            scheduleChange(id, path);
          } else {
            console.warn(`[project-watcher] reopen failed for ${id} at ${path}`);
          }
        }, REOPEN_DELAY_MS);
      } else if (eventType === 'change') {
        scheduleChange(id, path);
      }
    });
  } catch (e) {
    console.warn(`[project-watcher] watch failed for ${id}: ${e.message}`);
    return null;
  }
  watcher.on('error', (e) => {
    console.warn(`[project-watcher] watcher error on ${id}:`, e.message);
  });
  return watcher;
}

function attach(project) {
  if (watchers.has(project.id)) return;
  // Idea-Pipeline-Cutover: CHANGELOG.md bevorzugt, ROADMAP.md als Fallback.
  const changelog = join(project.path, 'CHANGELOG.md');
  const roadmapPath = existsSync(changelog) ? changelog : join(project.path, 'ROADMAP.md');
  const state = {
    watcher: null,
    path: roadmapPath,
    debounceTimer: null,
    reopenTimer: null,
    seq: 0,
  };
  watchers.set(project.id, state);
  state.watcher = openWatcher(project.id, roadmapPath);
  if (!state.watcher) {
    watchers.delete(project.id);
  }
}

function detach(id) {
  const state = watchers.get(id);
  if (!state) return;
  if (state.debounceTimer) clearTimeout(state.debounceTimer);
  if (state.reopenTimer) clearTimeout(state.reopenTimer);
  if (state.watcher) {
    try { state.watcher.close(); } catch {}
  }
  watchers.delete(id);
}

// Hauptschnittstelle: die Registry ist die Source of Truth, der Watcher
// gleicht sich an sie an. Neu registrierte Projekte bekommen einen Watcher,
// entfernte verlieren ihn. Idempotent — der Caller kann das beliebig oft
// aufrufen.
export function syncWatchers(registry) {
  const activeIds = new Set(registry.projects.map(p => p.id));
  for (const existingId of watchers.keys()) {
    if (!activeIds.has(existingId)) detach(existingId);
  }
  for (const p of registry.projects) {
    if (!watchers.has(p.id)) attach(p);
  }
}

export function noteSelfWrite(absPath) {
  selfWriteSuppression.set(absPath, Date.now() + SELF_WRITE_TTL_MS);
}

export function subscribe(fn) {
  listeners.add(fn);
}

export function unsubscribe(fn) {
  listeners.delete(fn);
}

export function closeAll() {
  for (const id of Array.from(watchers.keys())) {
    detach(id);
  }
  selfWriteSuppression.clear();
  listeners.clear();
}

// Test-Hook: aktueller Watcher-State (read-only View).
export function _debugState() {
  return {
    watching: Array.from(watchers.keys()),
    listenerCount: listeners.size,
    suppressed: Array.from(selfWriteSuppression.keys()),
  };
}
