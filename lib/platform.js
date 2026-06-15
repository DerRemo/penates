// lib/platform.js — single source of OS-specific runtime resolution (Express-free, unit-testable).
// macOS behaviour stays byte-identical; Linux is the new arm. Windows is only
// supported via WSL2, which presents process.platform === 'linux' — so anything
// that is not darwin collapses to the Linux path (no win32 branch by design).
import { accessSync, existsSync, constants } from 'node:fs';
import { join, delimiter } from 'node:path';
import { homedir } from 'node:os';

// Computed once at module load (cached from process.platform). A fresh module
// instance re-reads it — which is how the unit tests mock per-OS behaviour.
const _PLATFORM = process.platform === 'darwin' ? 'macos' : 'linux';
export function platform() {
  return _PLATFORM;
}

function isExecutable(p) {
  try { accessSync(p, constants.X_OK); return true; } catch { return false; }
}

// Pure Node PATH scan: walk env.PATH, return the first executable named `name`.
// Replaces every /usr/bin/which hardcode and every /opt/homebrew/... last-resort
// fallback. No shell, no `which` dependency, OS-agnostic.
export function resolveBin(name, { env = process.env } = {}) {
  if (!name) return null;
  for (const dir of String(env.PATH || '').split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, name);
    if (isExecutable(candidate)) return candidate;
  }
  return null;
}

// Directories prepended to PATH at server boot so tmux child processes can find
// claude/codex/agy/tmux. macOS keeps its exact pre-existing list.
export function extraPaths() {
  const home = homedir();
  return platform() === 'macos'
    ? [join(home, '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin']
    : [join(home, '.local/bin'), '/usr/local/bin', '/usr/bin'];
}

// Resolve the trash tool. Returns { bin, args } (args is the fixed prefix, e.g.
// `gio trash`) or null if none found. Keeps the "Trash, never rm" guarantee:
// callers must surface an honest error on null, never fall back to rm.
// macOS: `trash` on PATH or Apple's /usr/bin/trash (unconditional last resort,
// preserving the pre-existing behaviour). Linux: `gio trash` or trash-cli's
// `trash-put`.
export function resolveTrash() {
  if (platform() === 'macos') {
    return { bin: resolveBin('trash') || '/usr/bin/trash', args: [] };
  }
  const gio = resolveBin('gio');
  if (gio) return { bin: gio, args: ['trash'] };
  const trashPut = resolveBin('trash-put');
  if (trashPut) return { bin: trashPut, args: [] };
  return null;
}

export { existsSync }; // re-export convenience for callers that already import from here
