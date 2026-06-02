import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModel, providerOf, costOf } from './pricing.js';

test('normalizeModel strips prefixes and date suffixes', () => {
  assert.equal(normalizeModel('openai/gpt-5.5'), 'gpt-5.5');
  assert.equal(normalizeModel('gpt-5-2026-01-01'), 'gpt-5');
  assert.equal(normalizeModel('claude-opus-4-6-20260101'), 'claude-opus-4-6');
});

test('providerOf classifies by model family', () => {
  assert.equal(providerOf('claude-opus-4-6'), 'claude');
  assert.equal(providerOf('gpt-5.5'), 'codex');
  assert.equal(providerOf('o3-mini'), 'codex');
  assert.equal(providerOf('gemini-2.5-pro'), 'gemini');
  assert.equal(providerOf('mystery'), 'unknown');
});

test('costOf: claude opus uses input/output + cache-read discount', () => {
  // in=15, out=75, cached=1.5 (per 1M tokens)
  // cost = 1M*15/1M + 1M*1.5/1M + 1M*75/1M = 15 + 1.5 + 75 = 91.5
  const c = costOf('claude-opus-4-6', { input: 1_000_000, output: 1_000_000, cacheRead: 1_000_000, cacheCreate: 0 });
  assert.ok(Math.abs(c - 91.5) < 1e-6, `expected 91.5, got ${c}`);
});

test('costOf: claude-opus-4-8 is a known model priced at opus rates', () => {
  assert.equal(providerOf('claude-opus-4-8'), 'claude');
  // Same opus rates (15/75/1.5) → identical to opus-4-6 for the same tokens.
  const c = costOf('claude-opus-4-8', { input: 1_000_000, output: 1_000_000, cacheRead: 1_000_000, cacheCreate: 0 });
  assert.ok(Math.abs(c - 91.5) < 1e-6, `expected 91.5, got ${c}`);
  // A dated/suffixed variant still resolves to the opus entry.
  const c2 = costOf('claude-opus-4-8-20260601', { input: 1_000_000, output: 0, cacheRead: 0, cacheCreate: 0 });
  assert.ok(Math.abs(c2 - 15) < 1e-6, `expected 15, got ${c2}`);
});

test('costOf: openai gpt-5 below 272k tier', () => {
  // Confirmed from CostUsagePricing.swift lines 61-65:
  //   gpt-5: inputCostPerToken=1.25e-6, outputCostPerToken=1e-5, cacheReadInputCostPerToken=1.25e-7
  //   => per 1M: in=1.25, out=10, cached=0.125   (no threshold)
  // cost = 1M*1.25/1M + 1M*0.125/1M + 1M*10/1M = 1.25 + 0.125 + 10 = 11.375
  const c = costOf('gpt-5', { input: 1_000_000, output: 1_000_000, cacheRead: 1_000_000, cacheCreate: 0 });
  assert.ok(Math.abs(c - 11.375) < 1e-6, `expected 11.375, got ${c}`);
});

test('costOf: gpt-5.5 resolves to its own price (not gpt-5)', () => {
  // Confirmed from CostUsagePricing.swift lines 161-172:
  //   gpt-5.5: in=5e-6, out=3e-5, cached=5e-7 => per 1M: in=5, out=30, cached=0.5
  //   threshold=272k, over: in=10, out=45, cached=1
  // Below threshold (input=200k < 272k):
  //   cost = 200k*5/1M + 200k*0.5/1M + 200k*30/1M = 1 + 0.1 + 6 = 7.1
  const c = costOf('gpt-5.5', { input: 200_000, output: 200_000, cacheRead: 200_000, cacheCreate: 0 });
  assert.ok(Math.abs(c - 7.1) < 1e-6, `expected 7.1, got ${c}`);
  // Also confirm gpt-5 would give a different result for the same tokens:
  const cGpt5 = costOf('gpt-5', { input: 200_000, output: 200_000, cacheRead: 200_000, cacheCreate: 0 });
  // gpt-5: 200k*1.25/1M + 200k*0.125/1M + 200k*10/1M = 0.25 + 0.025 + 2 = 2.275
  assert.ok(Math.abs(cGpt5 - 2.275) < 1e-6, `gpt-5 expected 2.275, got ${cGpt5}`);
  assert.notEqual(c, cGpt5, 'gpt-5.5 and gpt-5 should have different costs');
});

test('costOf: gpt-5.5 above 272k threshold uses elevated rates', () => {
  // input=300k (> 272k) triggers over-threshold lane: in=10, out=45, cached=1 per 1M
  // cost = 300k*10/1M + 100k*1/1M + 100k*45/1M = 3 + 0.1 + 4.5 = 7.6
  const c = costOf('gpt-5.5', { input: 300_000, output: 100_000, cacheRead: 100_000, cacheCreate: 0 });
  assert.ok(Math.abs(c - 7.6) < 1e-6, `expected 7.6, got ${c}`);
});

test('costOf: gpt-5-codex uses same price as gpt-5', () => {
  // gpt-5-codex: same as gpt-5 (in=1.25, out=10, cached=0.125 per 1M)
  const c = costOf('gpt-5-codex', { input: 1_000_000, output: 1_000_000, cacheRead: 1_000_000, cacheCreate: 0 });
  assert.ok(Math.abs(c - 11.375) < 1e-6, `expected 11.375, got ${c}`);
});

test('costOf: unknown model falls back to default, never throws', () => {
  const c = costOf('mystery', { input: 1000, output: 1000, cacheRead: 0, cacheCreate: 0 });
  assert.ok(typeof c === 'number' && c >= 0);
});

test('costOf: default args (no tokens)', () => {
  const c = costOf('mystery');
  assert.strictEqual(c, 0);
});
