import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseClaudeFile } from './claude.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, '../../__fixtures__/usage/claude-sample.jsonl');

test('parseClaudeFile dedups, filters non-assistant, extracts tools', () => {
  const rows = parseClaudeFile(fixture);
  const usage = rows.filter(r => r.kind === 'usage');
  assert.equal(usage.length, 2);                 // duplicate m1 counted once
  const r1 = usage.find(r => r.model === 'claude-sonnet-4-6');
  assert.equal(r1.provider, 'claude');
  assert.equal(r1.input, 110);                   // 100 + cache_creation 10
  assert.equal(r1.cacheRead, 50);
  assert.equal(r1.cacheCreate, 10);
  assert.equal(r1.output, 20);
  assert.equal(r1.stopReason, 'tool_use');
  assert.deepEqual(r1.tools, ['Bash']);
  assert.ok(r1.cost > 0);
  assert.match(r1.date, /^\d{4}-\d{2}-\d{2}$/);
});
