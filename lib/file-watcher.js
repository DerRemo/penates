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

import { watch } from 'fs';
import { join, sep, basename } from 'path';

const DEBOUNCE_MS = 80;
const SELF_WRITE_TTL_MS = 400;
const IDLE_UNATTACH_MS = 30_000;
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

function openRecursive(state) {
  try {
    const rootBase = basename(state.root);
    return watch(state.root, { persistent: false, recursive: true }, (eventType, filename) => {
      if (!filename) return;
      const rel = String(filename);
      if (shouldIgnore(rel, rootBase)) return;
      const abs = join(state.root, rel);
      if (isSuppressed(abs)) return;
      scheduleBroadcast(state, rel, eventType === 'rename' ? 'rename' : 'change');
    });
  } catch (e) {
    console.warn('[file-watcher] open failed:', e.message);
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
    };
    projects.set(projectId, state);
    state.watcher = openRecursive(state);
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
      for (const t of state.timers.values()) clearTimeout(t);
      state.timers.clear();
      projects.delete(projectId);
    }, IDLE_UNATTACH_MS);
  }
}

export function noteSelfWrite(absPath) {
  selfWrite.set(absPath, Date.now() + SELF_WRITE_TTL_MS);
}

export function closeAll() {
  for (const state of projects.values()) {
    if (state.unattachTimer) clearTimeout(state.unattachTimer);
    if (state.watcher) try { state.watcher.close(); } catch {}
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
