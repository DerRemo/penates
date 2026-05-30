// lib/approvals.js
// Pending-Approval-Registry für bidirektionale Tool-Freigaben (Spec 4).
// Express-frei, damit unit-testbar. Der PreToolUse-Hook hält per Long-Poll
// eine HTTP-Antwort offen; create() merkt sich deren resolver, resolve()
// (vom Dashboard/Push) bzw. der Timeout lösen sie auf.
import { randomUUID } from 'node:crypto';

export const IMPACTFUL_TOOLS = new Set(['Bash', 'Edit', 'Write', 'WebFetch', 'WebSearch', 'Task']);

export function shouldRoute({ mode, hubAttached, tmuxAttached, tool, enabled }) {
  if (!enabled) return false;
  if (mode !== 'default') return false;
  if ((hubAttached || 0) > 0 || tmuxAttached) return false;
  if (!IMPACTFUL_TOOLS.has(tool)) return false;
  return true;
}

const DEFAULT_TIMEOUT_MS = 110_000;
const pending = new Map(); // id -> { id, session, tool, toolInput, cwd, createdAt, otp, resolve, timer }

export function create({ session, tool, toolInput, cwd }, onResolve, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const id = randomUUID();
  const timer = setTimeout(() => resolve(id, 'defer'), timeoutMs);
  if (typeof timer.unref === 'function') timer.unref();
  pending.set(id, {
    id, session, tool, toolInput, cwd,
    createdAt: Date.now(), otp: randomUUID(),
    resolve: onResolve, timer,
  });
  return id;
}

export function get(id) { return pending.get(id); }

export function resolve(id, decision) {
  const p = pending.get(id);
  if (!p) return false;
  pending.delete(id);
  clearTimeout(p.timer);
  try { p.resolve(decision); } catch (e) { console.error('[approvals] resolve:', e); }
  return true;
}

export function list() {
  return [...pending.values()].map(({ resolve: _r, timer: _t, ...rest }) => rest);
}

export function pendingForSession(name) {
  return [...pending.values()].filter((p) => p.session === name);
}

export function forget(session) {
  for (const p of [...pending.values()]) {
    if (p.session === session) resolve(p.id, 'defer');
  }
}

export function rename(oldName, newName) {
  if (oldName === newName) return;
  for (const p of pending.values()) {
    if (p.session === oldName) p.session = newName;
  }
}

export function _reset() {
  for (const p of pending.values()) clearTimeout(p.timer);
  pending.clear();
}
