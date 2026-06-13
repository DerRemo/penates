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

test('parseClaudeFile emits an error row for system/api_error', () => {
  const rows = parseClaudeFile(fixture);
  const errors = rows.filter(r => r.kind === 'error');
  assert.equal(errors.length, 1);
  assert.equal(errors[0].provider, 'claude');
  assert.match(errors[0].date, /^\d{4}-\d{2}-\d{2}$/);
});

test('parseClaudeFile second usage row (opus, end_turn) has expected fields', () => {
  const usage = parseClaudeFile(fixture).filter(r => r.kind === 'usage');
  const r2 = usage.find(r => r.model === 'claude-opus-4-6');
  assert.ok(r2);
  assert.equal(r2.input, 200);
  assert.equal(r2.cacheRead, 0);
  assert.deepEqual(r2.tools, []);
  assert.equal(r2.stopReason, 'end_turn');
});

test('parseClaudeFile captures cwd from the event (for correct byProject labels)', () => {
  const usage = parseClaudeFile(fixture).filter(r => r.kind === 'usage');
  const r2 = usage.find(r => r.model === 'claude-opus-4-6');
  assert.equal(r2.cwd, '/Users/jane/my-cool-project');  // verlustfrei, nicht aus dem Dirnamen unmangelt
  const r1 = usage.find(r => r.model === 'claude-sonnet-4-6');
  assert.equal(r1.cwd, null);                            // ohne cwd-Feld → null
});
