// lib/server-control.js
// Pure-ish helpers for the server-control endpoints (restart + logs). The exec
// dependency is injected so the launchd-managed check is unit-testable without
// actually shelling out. tailFile reads only the last maxBytes of a (possibly
// large) log file and returns the last `lines` lines.

import { promises as fs } from 'fs';

export function buildLaunchdTarget(uid, label) {
  return `gui/${uid}/${label}`;
}

// execFn(args) should run `launchctl <args>` and throw on non-zero exit
// (execFileSync does exactly that). Returns true iff the service is known.
export function isLaunchdManaged(target, execFn) {
  try {
    execFn(['print', target]);
    return true;
  } catch {
    return false;
  }
}

// systemd --user arm (Linux). Mirrors the launchd helpers above: pure, with the
// exec dependency injected so the "is this service managed?" check is unit-testable.
export function buildSystemdUnit(name = 'penates') {
  return name.endsWith('.service') ? name : `${name}.service`;
}

// execFn(args) runs `systemctl <args>` and throws on non-zero exit (execFileSync
// does exactly that). `is-enabled` exits 0 only when the unit is enabled.
export function isSystemdManaged(unit, execFn) {
  try {
    execFn(['--user', 'is-enabled', unit]);
    return true;
  } catch {
    return false;
  }
}

export async function tailFile(path, lines, maxBytes = 256 * 1024) {
  let handle;
  try {
    handle = await fs.open(path, 'r');
    const { size } = await handle.stat();
    const start = Math.max(0, size - maxBytes);
    const len = size - start;
    const buf = Buffer.alloc(len);
    await handle.read(buf, 0, len, start);
    const text = buf.toString('utf-8');
    const all = text.split('\n');
    const usable = start > 0 ? all.slice(1) : all;
    // Drop a trailing empty element caused by a final newline before slicing
    const trimmed = usable.length > 0 && usable[usable.length - 1] === '' ? usable.slice(0, -1) : usable;
    return trimmed.slice(-lines).join('\n');
  } catch (err) {
    if (err.code === 'ENOENT') return '';
    throw err;
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}
