import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cachedParse, _resetCache } from './cache.js';

test('cachedParse calls parseFn once until mtime/size changes', () => {
  _resetCache();
  const dir = mkdtempSync(join(tmpdir(), 'cc-'));
  const f = join(dir, 'x.jsonl');
  writeFileSync(f, 'a');
  let calls = 0;
  const parse = () => { calls++; return [calls]; };
  cachedParse(f, parse);
  cachedParse(f, parse);
  assert.equal(calls, 1);                    // second hit served from cache
  writeFileSync(f, 'ab');                     // size change -> re-parse
  cachedParse(f, parse);
  assert.equal(calls, 2);
  rmSync(dir, { recursive: true, force: true });
});

test('cachedParse on missing file returns [] and does not call parseFn', () => {
  _resetCache();
  let calls = 0;
  const out = cachedParse('/no/such/file.jsonl', () => { calls++; return [1]; });
  assert.deepEqual(out, []);
  assert.equal(calls, 0);
});
