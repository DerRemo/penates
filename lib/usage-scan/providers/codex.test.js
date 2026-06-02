import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

test('parseCodexFile: corrective row emitted for reconciliation shortfall', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cch-codex-test-'));
  try {
    const ts = '2025-01-15T10:00:00.000Z';
    const lines = [
      JSON.stringify({ type: 'session_meta', payload: { id: 'sess-corrective' } }),
      JSON.stringify({ type: 'turn_context', payload: { model: 'gpt-5.5' } }),
      // last_token_usage delta: 1000+50=1050 raw, but cumulative total is 5000
      JSON.stringify({
        type: 'event_msg',
        timestamp: ts,
        payload: {
          type: 'token_count',
          info: {
            last_token_usage: { input_tokens: 1000, cached_input_tokens: 0, output_tokens: 50, total_tokens: 1050 },
            total_token_usage: { total_tokens: 5000 },
          },
        },
      }),
    ];
    const filePath = join(dir, 'session.jsonl');
    writeFileSync(filePath, lines.join('\n') + '\n');

    const rows = parseCodexFile(filePath).filter(r => r.kind === 'usage');
    assert.equal(rows.length, 2, 'expected 1 normal + 1 corrective row');

    const corrective = rows[1];
    assert.equal(corrective.output, 0, 'corrective row output should be 0');
    assert.equal(corrective.input, 3950, 'corrective row input should be 5000 - 1050 = 3950');

    const sumAll = rows.reduce((a, r) => a + r.input + r.cacheRead + r.output, 0);
    assert.equal(sumAll, 5000, 'sum of all rows should equal final cumulative total');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('parseCodexFile: unknown model and missing last_token_usage yields graceful zeros', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cch-codex-test-'));
  try {
    const ts = '2025-01-15T10:00:00.000Z';
    const lines = [
      // no turn_context -> model stays null -> 'unknown'
      JSON.stringify({
        type: 'event_msg',
        timestamp: ts,
        payload: {
          type: 'token_count',
          info: {
            // last_token_usage intentionally omitted
            total_token_usage: { total_tokens: 100 },
          },
        },
      }),
    ];
    const filePath = join(dir, 'session.jsonl');
    writeFileSync(filePath, lines.join('\n') + '\n');

    let rows;
    assert.doesNotThrow(() => { rows = parseCodexFile(filePath).filter(r => r.kind === 'usage'); });
    assert.ok(rows.length >= 1, 'should produce at least one row');
    // The first row (normal delta) should carry graceful zeros from the missing last_token_usage
    const normal = rows[0];
    assert.equal(normal.model, 'unknown');
    assert.equal(normal.input, 0);
    assert.equal(normal.output, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
