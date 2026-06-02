// lib/pace.js
// Pure pace math on a single rate-limit window. Ported from CodexBar
// (Sources/CodexBarCore/UsagePace.swift). No I/O, no provider knowledge.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function windowMinutes(label) {
  if (typeof label !== 'string') return null;
  const m = label.trim().match(/^(\d+)\s*([hd])$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return m[2].toLowerCase() === 'h' ? n * 60 : n * 24 * 60;
}

export function paceStage(delta) {
  const a = Math.abs(delta);
  if (a <= 2) return 'onTrack';
  if (a <= 6) return delta >= 0 ? 'slightlyAhead' : 'slightlyBehind';
  if (a <= 12) return delta >= 0 ? 'ahead' : 'behind';
  return delta >= 0 ? 'farAhead' : 'farBehind';
}

// window: { usedPercent:number, resetsAt:unixSeconds|null, windowMinutes:int }
// now: ms epoch. Returns null when pace is undefined for this window.
export function computePace(window, now = Date.now()) {
  const { usedPercent, resetsAt } = window;
  const minutes = window.windowMinutes;
  if (resetsAt == null || !(minutes > 0)) return null;
  const duration = minutes * 60;                       // seconds
  const timeUntilReset = resetsAt - now / 1000;        // seconds
  if (timeUntilReset <= 0 || timeUntilReset > duration) return null;
  const elapsed = clamp(duration - timeUntilReset, 0, duration);
  const expected = clamp((elapsed / duration) * 100, 0, 100);
  const actual = clamp(usedPercent, 0, 100);
  if (elapsed === 0 && actual > 0) return null;
  const delta = actual - expected;

  let etaSeconds = null;
  let lastsToReset = false;
  if (elapsed > 0 && actual > 0) {
    const rate = actual / elapsed;                     // %/sec
    const candidate = (100 - actual) / rate;
    if (candidate >= timeUntilReset) lastsToReset = true;
    else etaSeconds = candidate;
  } else if (elapsed > 0) {
    lastsToReset = true;
  }

  return {
    stage: paceStage(delta),
    deltaPct: delta,
    expectedPct: expected,
    actualPct: actual,
    etaSeconds,
    lastsToReset,
  };
}
