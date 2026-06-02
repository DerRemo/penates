// lib/usage-scan/pricing.js
// Model normalization, provider classification, and per-row cost.
// Prices are USD per 1M tokens.
//   Anthropic: carried over from lib/usage.js table.
//   OpenAI/Codex: confirmed from CostUsagePricing.swift in steipete/codexbar.

const PER_M = 1_000_000;

// PRICING keys must be ordered most-specific first so that startsWith matching
// picks the right entry (e.g. 'gpt-5-codex' and 'gpt-5.5' before 'gpt-5').
// Each entry: { in, out, cached [, threshold, over: { in, out, cached }] }
// 'cached'   = cache-read rate (per 1M tokens)
// 'threshold' = token count above which 'over' rates apply
const PRICING = new Map([
  // ── Anthropic ──────────────────────────────────────────────────────────────
  // Source: lib/usage.js (hub-internal table); cache rate = input * 0.1
  ['claude-opus-4-6',   { in: 15,   out: 75,  cached: 1.5  }],
  ['claude-opus-4-5',   { in: 15,   out: 75,  cached: 1.5  }],
  ['claude-sonnet-4-6', { in: 3,    out: 15,  cached: 0.3  }],
  ['claude-sonnet-4-5', { in: 3,    out: 15,  cached: 0.3  }],
  ['claude-haiku-4-5',  { in: 0.8,  out: 4,   cached: 0.08 }],
  // ── OpenAI / Codex ─────────────────────────────────────────────────────────
  // Source: CostUsagePricing.swift (steipete/codexbar), lines 61-172.
  // Per-token values converted to per-1M (value * 1e6).
  //
  // gpt-5-codex (lines 66-70): in=1.25e-6, out=1e-5, cached=1.25e-7  → 1.25 / 10 / 0.125
  ['gpt-5-codex', { in: 1.25, out: 10, cached: 0.125 }],
  // gpt-5.5 (lines 161-172): in=5e-6, out=3e-5, cached=5e-7  → 5 / 30 / 0.5
  //   threshold 272k, over: in=1e-5, out=4.5e-5, cached=1e-6  → 10 / 45 / 1
  ['gpt-5.5', {
    in: 5, out: 30, cached: 0.5,
    threshold: 272_000,
    over: { in: 10, out: 45, cached: 1 },
  }],
  // gpt-5 (lines 61-65): in=1.25e-6, out=1e-5, cached=1.25e-7  → 1.25 / 10 / 0.125
  ['gpt-5', { in: 1.25, out: 10, cached: 0.125 }],
]);

// Default: fall back to claude-opus rates when model is unknown.
const DEFAULT = { in: 15, out: 75, cached: 1.5 };

// ---------------------------------------------------------------------------
// normalizeModel
// Strips provider prefix ("openai/") and date suffixes ("-YYYY-MM-DD" or
// "-YYYYMMDD") from a model string.
// ---------------------------------------------------------------------------
export function normalizeModel(model) {
  if (!model || typeof model !== 'string') return 'unknown';
  let m = model.trim();
  const slash = m.lastIndexOf('/');
  if (slash >= 0) m = m.slice(slash + 1);
  // Strip date suffixes: -YYYY-MM-DD or -YYYYMMDD (8 contiguous digits)
  m = m.replace(/[-@]\d{4}-\d{2}-\d{2}$/, '');
  m = m.replace(/[-@]\d{8}$/, '');
  return m;
}

// ---------------------------------------------------------------------------
// providerOf
// Returns 'claude' | 'codex' | 'gemini' | 'unknown'.
// ---------------------------------------------------------------------------
export function providerOf(model) {
  const m = normalizeModel(model);
  if (m.startsWith('claude'))                                           return 'claude';
  if (m.startsWith('gpt') || m.startsWith('o1') ||
      m.startsWith('o3') || m.startsWith('codex'))                     return 'codex';
  if (m.startsWith('gemini'))                                           return 'gemini';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// priceFor (internal)
// Returns the pricing entry for a normalized model name.
// Map iteration is insertion-order, so more-specific keys win over shorter
// prefix matches (gpt-5-codex / gpt-5.5 are listed before gpt-5).
// ---------------------------------------------------------------------------
function priceFor(model) {
  const m = normalizeModel(model);
  for (const [key, p] of PRICING) {
    if (m === key || m.startsWith(key + '-') || m.startsWith(key + '.')) {
      return p;
    }
  }
  // Fallback: prefix-startsWith (handles e.g. 'claude-opus-4-6-20260205' → 'claude-opus-4-6')
  for (const [key, p] of PRICING) {
    if (m.startsWith(key)) return p;
  }
  return DEFAULT;
}

// ---------------------------------------------------------------------------
// costOf
// tokens: { input, output, cacheRead, cacheCreate }
//   input     = regular (non-cached) input tokens billed at the standard rate
//   cacheRead = tokens served from prompt cache, billed at the cheaper rate
//   cacheCreate / output as usual
// Formula: (input/M)*in + (cacheRead/M)*cached + (output/M)*out
// Above-threshold lane applies when input > threshold.
// ---------------------------------------------------------------------------
export function costOf(model, { input = 0, output = 0, cacheRead = 0, cacheCreate = 0 } = {}) {
  const p = priceFor(model);
  const lane = (p.threshold != null && input > p.threshold && p.over) ? p.over : p;
  return (input    / PER_M) * lane.in
       + (cacheRead / PER_M) * lane.cached
       + (output    / PER_M) * lane.out;
}
