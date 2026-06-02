// lib/usage-scan/providers/codex.js
// Codex rollout JSONL -> usage rows.
//   session_meta.payload.id  -> sessionId
//   turn_context.payload.model -> authoritative model for the current turn
//   event_msg payload.type=="token_count" payload.info.last_token_usage -> per-turn delta
// Per-turn deltas attributed to the event timestamp's local day + current model.
// Dedup: skip a token_count whose cumulative total_tokens did not advance.
// Cross-check: raw (input+output) deltas should reconstruct the final cumulative
// total; on shortfall, add one corrective row for the difference.
// NOTE: output_tokens already includes reasoning; cached_input_tokens is a subset
// of input_tokens. Row 'input' is the NON-cached input (cost convention).

import { homedir } from 'node:os';
import { join } from 'node:path';
import { forEachJsonLine } from '../jsonl.js';
import { localDayKey, dowHour } from '../day-bucket.js';
import { normalizeModel, costOf } from '../pricing.js';

export function codexSessionRoots() {
  const home = process.env.CODEX_HOME || join(homedir(), '.codex');
  return [join(home, 'sessions'), join(home, 'archived_sessions')];
}

export function parseCodexFile(absPath) {
  const rows = [];
  let model = null, sessionId = null;
  let prevTotal = null, summedRaw = 0, lastFinalTotal = 0;
  let lastDate = null, lastDow = 0, lastHour = 0, lastModel = null;

  forEachJsonLine(absPath, (o) => {
    if (o?.type === 'session_meta') { sessionId = o.payload?.id || sessionId; return; }
    if (o?.type === 'turn_context') { const m = o.payload?.model; if (m) model = normalizeModel(m); return; }
    if (o?.type === 'event_msg' && o.payload?.type === 'token_count') {
      const info = o.payload.info || {};
      const total = info.total_token_usage?.total_tokens;
      if (typeof total === 'number') {
        if (prevTotal !== null && total === prevTotal) return; // dedup: no progress
        prevTotal = total;
        lastFinalTotal = total;
      }
      const date = localDayKey(o.timestamp);
      if (!date) return;
      const dh = dowHour(o.timestamp) || { dow: 0, hour: 0 };

      const last = info.last_token_usage || {};
      const rawInput = last.input_tokens || 0;     // includes cached
      const cached = last.cached_input_tokens || 0;
      const output = last.output_tokens || 0;      // already includes reasoning
      const nonCached = Math.max(0, rawInput - cached);
      summedRaw += rawInput + output;
      const mdl = model || 'unknown';
      lastDate = date; lastDow = dh.dow; lastHour = dh.hour; lastModel = mdl;
      rows.push({
        kind: 'usage', provider: 'codex', date, dow: dh.dow, hour: dh.hour,
        model: mdl, input: nonCached, output, cacheRead: cached, cacheCreate: 0,
        cost: costOf(mdl, { input: nonCached, output, cacheRead: cached }),
        sessionId, stopReason: null, tools: [],
      });
    }
  });

  if (lastFinalTotal > 0 && summedRaw !== lastFinalTotal && lastDate) {
    const diff = lastFinalTotal - summedRaw;
    if (diff > 0) {
      const mdl = lastModel || model || 'unknown';
      rows.push({
        kind: 'usage', provider: 'codex', date: lastDate, dow: lastDow, hour: lastHour,
        model: mdl, input: diff, output: 0, cacheRead: 0, cacheCreate: 0,
        cost: costOf(mdl, { input: diff, output: 0, cacheRead: 0 }),
        sessionId, stopReason: null, tools: [],
      });
    }
  }
  return rows;
}
