import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { forEachJsonLine } from './jsonl.js';

test('forEachJsonLine parses valid lines and skips garbage', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jsonl-'));
  const file = join(dir, 'a.jsonl');
  writeFileSync(file, '{"a":1}\n{bad json}\n\n{"a":2}\n');
  const seen = [];
  forEachJsonLine(file, (obj) => seen.push(obj.a));
  assert.deepEqual(seen, [1, 2]);
  rmSync(dir, { recursive: true, force: true });
});

test('forEachJsonLine on missing file is a no-op (no throw)', () => {
  let count = 0;
  forEachJsonLine('/no/such/file.jsonl', () => count++);
  assert.equal(count, 0);
});
