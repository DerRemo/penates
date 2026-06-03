// public/prefs.js
// Pure preference defaults + coercion. No DOM, no localStorage here — importable
// by the browser (dynamic import) AND node:test. Mirrors public/clis.js /
// public/usage-format.js. The DOM glue (read/write/apply) lives in index.html.
//
// DEFAULTS are chosen to EXACTLY reproduce the app's current hardcoded behavior,
// so an install that never opens Settings behaves identically to before Phase 2.

export const DEFAULTS = {
  // Appearance
  animations: true,          // false → reduce motion
  density: 'normal',         // 'normal' | 'compact'
  // Notifications
  soundVolume: 100,          // 0..100 (%) — scales the beep gain
  // Terminal (match new Terminal({...}) in index.html)
  termFontSize: 13,          // px, 11..18
  termScrollback: 5000,      // lines, 500..10000
  termCursor: 'bar',         // 'block' | 'bar' | 'underline'
  termCopyOnSelect: false,
  termBell: false,
  // Behavior
  landingView: 'last',       // 'last' | 'dashboard' | 'projects' | 'usage'
  defaultCli: 'claude',      // a CLIS id; validated against the registry at apply time
  defaultTier: 'auto',       // 'safe' | 'auto' | 'danger'; validated per-CLI at apply time
  confirmKill: true,
};

export const ENUMS = {
  density: ['normal', 'compact'],
  termCursor: ['block', 'bar', 'underline'],
  landingView: ['last', 'dashboard', 'projects', 'usage'],
  defaultTier: ['safe', 'auto', 'danger'],
};

export function coerceInt(raw, min, max, fallback) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function coerceEnum(raw, allowed, fallback) {
  return allowed.includes(raw) ? raw : fallback;
}

export function coerceBool(raw, fallback) {
  if (raw === '1' || raw === true) return true;
  if (raw === '0' || raw === false) return false;
  return fallback;
}

// percent 0..100 (string|number) → gain factor 0..1; bad input → default/100.
export function coercePercent(raw, fallback) {
  const n = parseInt(raw, 10);
  const pct = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : fallback;
  return pct / 100;
}
