import { test } from 'node:test';
import assert from 'node:assert/strict';
import { byProviderFromRows } from './aggregate.js';

const rows = [
  { kind:'usage', provider:'claude', model:'claude-opus-4-6', input:100, output:50, cost:1.0 },
  { kind:'usage', provider:'claude', model:'claude-opus-4-6', input:100, output:50, cost:1.0 },
  { kind:'usage', provider:'claude', model:'claude-haiku-4-5', input:200, output:10, cost:0.1 },
  { kind:'usage', provider:'codex',  model:'gpt-5.5', input:300, output:20, cost:0.5 },
  { kind:'error',  provider:'claude', date:'2026-06-01' },
];

test('byProviderFromRows rolls up tokens+cost per provider and model', () => {
  const bp = byProviderFromRows(rows);
  assert.equal(bp.length, 2);
  assert.equal(bp[0].provider, 'claude');           // sorted by tokens desc
  const claude = bp.find(p => p.provider === 'claude');
  assert.equal(claude.tokens, 100+50+100+50+200+10); // 510
  assert.ok(Math.abs(claude.costUsd - 2.1) < 1e-9);
  assert.equal(claude.models.length, 2);
  assert.equal(claude.models[0].model, 'claude-opus-4-6'); // biggest model first
  const codex = bp.find(p => p.provider === 'codex');
  assert.equal(codex.tokens, 320);
  assert.equal(codex.models[0].model, 'gpt-5.5');
});
