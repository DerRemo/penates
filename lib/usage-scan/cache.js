// lib/usage-scan/cache.js
// mtime+size keyed cache of parsed rows per file. Bump VERSION when any parser
// changes shape, to invalidate stale aggregates after code updates.
import { statSync } from 'node:fs';

const VERSION = 1;
const cache = new Map(); // absPath -> { mtimeMs, size, version, rows }

export function cachedParse(absPath, parseFn) {
  let st;
  try { st = statSync(absPath); } catch { return []; }
  const hit = cache.get(absPath);
  if (hit && hit.version === VERSION && hit.mtimeMs === st.mtimeMs && hit.size === st.size) {
    return hit.rows;
  }
  const rows = parseFn(absPath);
  cache.set(absPath, { mtimeMs: st.mtimeMs, size: st.size, version: VERSION, rows });
  return rows;
}

export function _resetCache() { cache.clear(); }
