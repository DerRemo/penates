// lib/usage-scan/providers/claude.js
import { homedir } from 'node:os';
import { join } from 'node:path';
import { forEachJsonLine } from '../jsonl.js';
import { localDayKey, dowHour } from '../day-bucket.js';
import { normalizeModel, costOf } from '../pricing.js';

// Multi-root discovery (NEW): CLAUDE_CONFIG_DIR (comma-list) else ~/.config/claude + ~/.claude.
export function claudeProjectRoots() {
  const env = (process.env.CLAUDE_CONFIG_DIR || '').trim();
  if (env) {
    return env.split(',').map(s => s.trim()).filter(Boolean)
      .map(p => (p.endsWith('projects') ? p : join(p, 'projects')));
  }
  return [join(homedir(), '.config', 'claude', 'projects'), join(homedir(), '.claude', 'projects')];
}

export function parseClaudeFile(absPath) {
  const rows = [];
  const seen = new Set();                       // dedup: message.id + requestId
  forEachJsonLine(absPath, (o) => {
    // System events — API errors (matches lib/usage.js: type==='system' && subtype==='api_error')
    if (o?.type === 'system' && o?.subtype === 'api_error') {
      const date = localDayKey(o.timestamp);
      if (date) rows.push({ kind: 'error', provider: 'claude', date });
      return;
    }
    if (o?.type !== 'assistant') return;
    const msg = o.message;
    const u = msg?.usage;
    if (!u) return;
    const key = `${msg.id || ''}:${o.requestId || ''}`;
    if (key !== ':' && seen.has(key)) return;   // duplicate streaming/retry
    if (key !== ':') seen.add(key);

    const date = localDayKey(o.timestamp);
    if (!date) return;
    const dh = dowHour(o.timestamp) || { dow: 0, hour: 0 };
    const cacheCreate = u.cache_creation_input_tokens || 0;
    const cacheRead = u.cache_read_input_tokens || 0;
    const input = (u.input_tokens || 0) + cacheCreate; // prior convention (excludes cacheRead)
    const output = u.output_tokens || 0;
    const model = normalizeModel(msg.model);
    const tools = Array.isArray(msg.content)
      ? msg.content.filter(c => c?.type === 'tool_use').map(c => c.name).filter(Boolean)
      : [];
    rows.push({
      kind: 'usage', provider: 'claude', date, dow: dh.dow, hour: dh.hour,
      model, input, output, cacheRead, cacheCreate,
      cost: costOf(model, { input, output, cacheRead, cacheCreate }),
      sessionId: o.sessionId || null,
      stopReason: msg.stop_reason || null,
      tools,
    });
  });
  return rows;
}
