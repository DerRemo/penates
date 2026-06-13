import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { getAntigravityUsage, _resetCache } from './antigravity-usage.js';

function dir() { return mkdtempSync(join(tmpdir(), 'agy-test-')); }

test('limited account when 429 reset is in the future', () => {
  _resetCache();
  const d = dir();
  writeFileSync(join(d, 'cli-20260601_073000.log'),
    'I0601 07:30:00.0 1 x.go:1] hello\n' +
    'E0601 07:35:46.846 99 log.go:398] RESOURCE_EXHAUSTED (code 429): Individual quota reached. Resets in 10h0m0s.\n');
  const eventMs = new Date(2026, 5, 1, 7, 35, 46).getTime();
  const now = eventMs + 60 * 60 * 1000; // 1h nach Event → 9h verbleibend
  const r = getAntigravityUsage({ logDir: d, now });
  assert.ok(r, 'returns an account');
  assert.equal(r.agent, 'antigravity');
  assert.equal(r.limited, true);
  assert.equal(r.windows[0].resetsAt, Math.floor((eventMs + 10 * 3600 * 1000) / 1000));
  rmSync(d, { recursive: true, force: true });
});

test('null when reset already passed', () => {
  _resetCache();
  const d = dir();
  writeFileSync(join(d, 'cli-20260601_073000.log'),
    'E0601 07:35:46.846 99 log.go:398] RESOURCE_EXHAUSTED (code 429): Resets in 1h0m0s.\n');
  const now = new Date(2026, 5, 1, 7, 35, 46).getTime() + 2 * 3600 * 1000; // 2h später
  assert.equal(getAntigravityUsage({ logDir: d, now }), null);
  rmSync(d, { recursive: true, force: true });
});

test('null when no 429 present', () => {
  _resetCache();
  const d = dir();
  writeFileSync(join(d, 'cli-20260601_073000.log'), 'I0601 07:30:00.0 1 x.go:1] all good\n');
  assert.equal(getAntigravityUsage({ logDir: d, now: Date.now() }), null);
  rmSync(d, { recursive: true, force: true });
});

test('null when log dir missing', () => {
  _resetCache();
  assert.equal(getAntigravityUsage({ logDir: '/nonexistent/agy/log', now: Date.now() }), null);
});

test('picks the latest future reset across multiple 429 lines', () => {
  _resetCache();
  const d = dir();
  writeFileSync(join(d, 'cli-20260601_073000.log'),
    'E0601 07:00:00.0 1 log.go:1] RESOURCE_EXHAUSTED (code 429): Resets in 2h0m0s.\n' +
    'E0601 08:00:00.0 1 log.go:1] RESOURCE_EXHAUSTED (code 429): Resets in 5h0m0s.\n');
  const now = new Date(2026, 5, 1, 8, 30, 0).getTime();
  const r = getAntigravityUsage({ logDir: d, now });
  assert.ok(r);
  assert.equal(r.windows[0].resetsAt, Math.floor((new Date(2026, 5, 1, 8, 0, 0).getTime() + 5 * 3600 * 1000) / 1000));
  rmSync(d, { recursive: true, force: true });
});

test('year-boundary: Jan-Zeile in Dez-datierter Datei → Reset im NÄCHSTEN Jahr', () => {
  _resetCache();
  const d = dir();
  // Datei am 31.12.2025 angelegt, RESOURCE_EXHAUSTED-Zeile am 01.01. (=2026).
  writeFileSync(join(d, 'cli-20251231_235900.log'),
    'E0101 00:05:00.0 1 log.go:1] RESOURCE_EXHAUSTED (code 429): Resets in 10h0m0s.\n');
  const eventMs = new Date(2026, 0, 1, 0, 5, 0).getTime();  // 2026, nicht 2025!
  const now = eventMs + 60 * 60 * 1000;
  const r = getAntigravityUsage({ logDir: d, now });
  assert.ok(r, 'muss limitiert sein — Event liegt in 2026, nicht 2025');
  assert.equal(r.windows[0].resetsAt, Math.floor((eventMs + 10 * 3600 * 1000) / 1000));
  rmSync(d, { recursive: true, force: true });
});

test('parses day/hour/minute/second duration combos', () => {
  _resetCache();
  const d = dir();
  writeFileSync(join(d, 'cli-20260601_073000.log'),
    'E0601 07:00:00.0 1 log.go:1] RESOURCE_EXHAUSTED (code 429): Resets in 5d9h55m4s.\n');
  const now = new Date(2026, 5, 1, 7, 0, 0).getTime();
  const r = getAntigravityUsage({ logDir: d, now });
  assert.ok(r);
  const dur = (5 * 86400 + 9 * 3600 + 55 * 60 + 4) * 1000;
  assert.equal(r.windows[0].resetsAt, Math.floor((now + dur) / 1000));
  rmSync(d, { recursive: true, force: true });
});
