import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCodexFile } from './codex.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, '../../__fixtures__/usage/codex-rollout.jsonl');

test('parseCodexFile: dedups, model from turn_context, non-cached input', () => {
  const rows = parseCodexFile(fixture).filter(r => r.kind === 'usage');
  assert.equal(rows.length, 2);              // 3rd token_count is a dup (same cumulative) -> skipped
  assert.ok(rows.every(r => r.provider === 'codex' && r.model === 'gpt-5.5'));
  // first delta: input 1000, cached 200 -> nonCached 800
  const r1 = rows[0];
  assert.equal(r1.input, 800);
  assert.equal(r1.cacheRead, 200);
  assert.equal(r1.output, 50);
  assert.equal(r1.cacheCreate, 0);
  assert.ok(r1.cost > 0);
  assert.match(r1.date, /^\d{4}-\d{2}-\d{2}$/);
});

test('parseCodexFile: raw tokens reconcile to final cumulative total', () => {
  const rows = parseCodexFile(fixture).filter(r => r.kind === 'usage');
  // row.input + row.cacheRead = raw input_tokens; +output = raw per-turn total
  const sumRaw = rows.reduce((a, r) => a + r.input + r.cacheRead + r.output, 0);
  assert.equal(sumRaw, 3120);                // == final total_token_usage.total_tokens
});
