// Per-project recursive fs.watch pipeline with debounce, self-write
// suppression, and on-demand attach/detach. Broadcasts events to subscribers.
//
// API:
//   subscribeProject(projectId, rootPath, handler)
//   unsubscribeProject(projectId, handler)
//   noteSelfWrite(absPath)
//   closeAll()
//
// Pattern copied from lib/project-watcher.js but scoped to recursive
// directory watch instead of single-file watch.

import { watch, readdirSync, lstatSync } from 'fs';
import { join, sep, basename } from 'path';
import { platform } from './platform.js';

const DEBOUNCE_MS = 80;
const SELF_WRITE_TTL_MS = 400;
const IDLE_UNATTACH_MS = 30_000;
const POLL_MS = 150;
const IGNORE_TOP = new Set(['.git', 'node_modules', '.DS_Store', 'dist', 'build']);

// projectId → state
const projects = new Map();
// absPath → expiry timestamp
const selfWrite = new Map();

function shouldIgnore(relPath, rootBase) {
  if (!relPath) return false;
  // macOS fs.watch sometimes emits the watched dir's own basename as filename;
  // that is not a child path — drop it.
  if (relPath === rootBase) return true;
  const top = relPath.split(sep)[0];
  return IGNORE_TOP.has(top);
}

function isSuppressed(absPath) {
  const exp = selfWrite.get(absPath);
  if (!exp) return false;
  if (Date.now() > exp) { selfWrite.delete(absPath); return false; }
  return true;
}

function scheduleBroadcast(state, relPath, type) {
  if (state.timers.has(relPath)) clearTimeout(state.timers.get(relPath));
  const timer = setTimeout(() => {
    state.timers.delete(relPath);
    state.seq++;
    const event = { projectId: state.id, type, relPath, seq: state.seq, at: Date.now() };
    for (const h of state.handlers) {
      try { h(event); } catch (e) { console.error('[file-watcher]', e); }
    }
  }, DEBOUNCE_MS);
  state.timers.set(relPath, timer);
}

function scanTree(root, rootBase, relBase = '') {
  const out = new Map();
  let names;
  try { names = readdirSync(join(root, relBase), { withFileTypes: true }); }
  catch { return out; }
  for (const ent of names) {
    const rel = relBase ? `${relBase}${sep}${ent.name}` : ent.name;
    if (shouldIgnore(rel, rootBase)) continue;
    const abs = join(root, rel);
    let st;
    try { st = lstatSync(abs); } catch { continue; }
    out.set(rel, `${st.mtimeMs}:${st.size}:${st.isDirectory() ? 'd' : 'f'}`);
    if (st.isDirectory()) {
      for (const [childRel, sig] of scanTree(root, rootBase, rel)) out.set(childRel, sig);
    }
  }
  return out;
}

function startPolling(state) {
  if (state.pollTimer) return;
  console.warn('[file-watcher] using polling fallback');
  const rootBase = basename(state.root);
  state.snapshot = scanTree(state.root, rootBase);
  state.pollTimer = setInterval(() => {
    const next = scanTree(state.root, rootBase);
    for (const [rel, sig] of next.entries()) {
      const prev = state.snapshot.get(rel);
      if (prev === sig) continue;
      const abs = join(state.root, rel);
      if (isSuppressed(abs)) continue;
      scheduleBroadcast(state, rel, prev ? 'change' : 'rename');
    }
    for (const rel of state.snapshot.keys()) {
      if (next.has(rel)) continue;
      const abs = join(state.root, rel);
      if (isSuppressed(abs)) continue;
      scheduleBroadcast(state, rel, 'rename');
    }
    state.snapshot = next;
  }, POLL_MS);
  state.pollTimer.unref?.();
}

function openWatcher(state, { recursive }) {
  try {
    const rootBase = basename(state.root);
    const watcher = watch(state.root, { persistent: false, recursive }, (eventType, filename) => {
      if (!filename) return;
      const rel = String(filename);
      if (shouldIgnore(rel, rootBase)) return;
      const abs = join(state.root, rel);
      if (isSuppressed(abs)) return;
      scheduleBroadcast(state, rel, eventType === 'rename' ? 'rename' : 'change');
    });
    watcher.on('error', (e) => {
      console.warn('[file-watcher] watcher error:', e.message);
      if (recursive && projects.get(state.id) === state) {
        try { watcher.close(); } catch {}
        state.watcher = openWatcher(state, { recursive: false });
      } else if (!recursive && projects.get(state.id) === state) {
        try { watcher.close(); } catch {}
        state.watcher = null;
        startPolling(state);
      }
    });
    return watcher;
  } catch (e) {
    if (recursive) {
      console.warn('[file-watcher] recursive open failed, falling back:', e.message);
      return openWatcher(state, { recursive: false });
    }
    console.warn('[file-watcher] open failed:', e.message);
    startPolling(state);
    return null;
  }
}

export function subscribeProject(projectId, rootPath, handler) {
  let state = projects.get(projectId);
  if (!state) {
    state = {
      id: projectId,
      root: rootPath,
      watcher: null,
      handlers: new Set(),
      seq: 0,
      timers: new Map(),
      unattachTimer: null,
      pollTimer: null,
      snapshot: new Map(),
    };
    projects.set(projectId, state);
    // Linux' fs.watch hat keinen recursive-Modus → der recursive-Open würde immer
    // werfen und zurückfallen. Auf Linux direkt non-recursive starten (spart den
    // garantierten Throw). macOS behält recursive.
    state.watcher = openWatcher(state, { recursive: platform() === 'macos' });
  }
  if (state.unattachTimer) { clearTimeout(state.unattachTimer); state.unattachTimer = null; }
  state.handlers.add(handler);
}

export function unsubscribeProject(projectId, handler) {
  const state = projects.get(projectId);
  if (!state) return;
  state.handlers.delete(handler);
  if (state.handlers.size === 0) {
    state.unattachTimer = setTimeout(() => {
      if (state.watcher) try { state.watcher.close(); } catch {}
      if (state.pollTimer) clearInterval(state.pollTimer);
      for (const t of state.timers.values()) clearTimeout(t);
      state.timers.clear();
      projects.delete(projectId);
    }, IDLE_UNATTACH_MS);
  }
}

export function noteSelfWrite(absPath) {
  const now = Date.now();
  // Abgelaufene Einträge opportunistisch wegräumen: isSuppressed prunt nur den
  // exakt geprüften Pfad — ein notierter Self-Write, der nie ein passendes
  // Watcher-Event bekommt (idle/detached Projekt, ignorierter Subtree), bliebe
  // sonst für immer in der Map (langsamer Leak über die Server-Laufzeit).
  if (selfWrite.size > 64) {
    for (const [k, exp] of selfWrite) if (now > exp) selfWrite.delete(k);
  }
  selfWrite.set(absPath, now + SELF_WRITE_TTL_MS);
}

export function closeAll() {
  for (const state of projects.values()) {
    if (state.unattachTimer) clearTimeout(state.unattachTimer);
    if (state.watcher) try { state.watcher.close(); } catch {}
    if (state.pollTimer) clearInterval(state.pollTimer);
    for (const t of state.timers.values()) clearTimeout(t);
  }
  projects.clear();
  selfWrite.clear();
}

export function _debugState() {
  return {
    projects: Array.from(projects.keys()),
    suppressed: Array.from(selfWrite.keys()),
  };
}
