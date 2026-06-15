import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTtlCache } from './single-flight.js';

const tick = () => new Promise((r) => setImmediate(r));

test('concurrent get() with same key share ONE build (in-flight dedup)', async () => {
  const cache = createTtlCache(1000);
  let builds = 0;
  const build = async () => { builds++; await tick(); return builds; };
  const [a, b, c] = await Promise.all([cache.get(build), cache.get(build), cache.get(build)]);
  assert.equal(builds, 1, 'build ran exactly once for three concurrent callers');
  assert.deepEqual([a, b, c], [1, 1, 1]);
});

test('fresh cache is returned without rebuilding', async () => {
  let t = 0;
  const cache = createTtlCache(1000, { now: () => t });
  let builds = 0;
  const build = async () => { builds++; return 'v'; };
  await cache.get(build);
  t = 500; // still within TTL
  await cache.get(build);
  assert.equal(builds, 1);
});

test('expired cache rebuilds', async () => {
  let t = 0;
  const cache = createTtlCache(1000, { now: () => t });
  let builds = 0;
  const build = async () => { builds++; return builds; };
  assert.equal(await cache.get(build), 1);
  t = 1500; // past TTL
  assert.equal(await cache.get(build), 2);
});

test('force bypasses freshness but still dedups concurrent forced builds', async () => {
  let t = 0;
  const cache = createTtlCache(10_000, { now: () => t });
  let builds = 0;
  const build = async () => { builds++; await tick(); return builds; };
  await cache.get(build);                 // builds=1, cached
  const [a, b] = await Promise.all([
    cache.get(build, { force: true }),
    cache.get(build, { force: true }),
  ]);
  assert.equal(builds, 2, 'two concurrent forced refreshes share one rebuild');
  assert.deepEqual([a, b], [2, 2]);
});

test('separate keys keep separate cache + in-flight slots', async () => {
  const cache = createTtlCache(1000);
  let builds = 0;
  const build = async () => { const my = ++builds; await tick(); return my; };
  const [x, y] = await Promise.all([
    cache.get(build, { key: 'a' }),
    cache.get(build, { key: 'b' }),
  ]);
  assert.equal(builds, 2, 'different keys do not dedup against each other');
  assert.notEqual(x, y);
});

test('build rejection does not poison the cache and clears in-flight', async () => {
  const cache = createTtlCache(1000);
  let attempt = 0;
  const build = async () => { attempt++; if (attempt === 1) throw new Error('boom'); return 'ok'; };
  await assert.rejects(() => cache.get(build), /boom/);
  assert.equal(await cache.get(build), 'ok', 'retry after failure rebuilds');
});

test('invalidate() clears cache; keyed invalidate is scoped', async () => {
  let t = 0;
  const cache = createTtlCache(10_000, { now: () => t });
  let builds = 0;
  const build = async () => { builds++; return builds; };
  await cache.get(build, { key: 'a' });
  await cache.get(build, { key: 'b' });
  cache.invalidate('a');
  await cache.get(build, { key: 'a' }); // rebuilds a
  await cache.get(build, { key: 'b' }); // b still cached
  assert.equal(builds, 3);
});
