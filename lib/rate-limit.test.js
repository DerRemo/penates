import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from './rate-limit.js';

// Minimaler Express-req/res-Stub.
function mkReq(ip = '1.2.3.4') { return { headers: {}, ip }; }
function mkRes() {
  const res = { statusCode: 200, headers: {}, body: null };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}
function run(mw, req) {
  const res = mkRes();
  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });
  return { res, nextCalled };
}

test('allows up to max, then 429 with Retry-After', () => {
  const mw = createRateLimiter({ bucket: 'test', max: 3, windowMs: 60_000 });
  for (let i = 0; i < 3; i++) assert.equal(run(mw, mkReq()).nextCalled, true, `req ${i} allowed`);
  const { res, nextCalled } = run(mw, mkReq());
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 429);
  assert.ok(Number(res.headers['Retry-After']) >= 1);
});

test('separate keys have independent buckets', () => {
  const mw = createRateLimiter({ bucket: 'test', max: 1, windowMs: 60_000 });
  assert.equal(run(mw, mkReq('a')).nextCalled, true);
  assert.equal(run(mw, mkReq('a')).nextCalled, false);  // a exhausted
  assert.equal(run(mw, mkReq('b')).nextCalled, true);   // b independent
});

test('cf-connecting-ip is preferred over req.ip as the key', () => {
  const mw = createRateLimiter({ bucket: 'test', max: 1, windowMs: 60_000 });
  const r1 = mkReq('shared'); r1.headers['cf-connecting-ip'] = 'cf-a';
  const r2 = mkReq('shared'); r2.headers['cf-connecting-ip'] = 'cf-b';
  assert.equal(run(mw, r1).nextCalled, true);
  assert.equal(run(mw, r2).nextCalled, true);  // verschiedene CF-IPs → eigene Buckets trotz gleicher req.ip
});

test('window resets after windowMs (via injected clock through keyFn timing)', () => {
  // windowMs sehr klein → nach kurzem Warten neues Fenster. Wir testen die
  // Reset-Logik über zwei Aufrufe mit windowMs=0-nahe (sofort abgelaufen).
  const mw = createRateLimiter({ bucket: 'test', max: 1, windowMs: 1 });
  assert.equal(run(mw, mkReq()).nextCalled, true);
  // busy-wait > 1ms
  const t = Date.now(); while (Date.now() - t < 3) { /* spin */ }
  assert.equal(run(mw, mkReq()).nextCalled, true);  // neues Fenster
});

test('onExceeded callback fires on 429 and swallows its own errors', () => {
  let fired = 0;
  const mw = createRateLimiter({
    bucket: 'test', max: 1, windowMs: 60_000,
    onExceeded: () => { fired++; throw new Error('boom'); },
  });
  run(mw, mkReq());                  // allowed
  const { res } = run(mw, mkReq());  // exceeded → onExceeded throws, must be swallowed
  assert.equal(fired, 1);
  assert.equal(res.statusCode, 429);
});

test('rejects invalid config', () => {
  assert.throws(() => createRateLimiter({ max: 1, windowMs: 1 }), /bucket/);
  assert.throws(() => createRateLimiter({ bucket: 'b', max: 0, windowMs: 1 }), /max/);
  assert.throws(() => createRateLimiter({ bucket: 'b', max: 1, windowMs: 0 }), /windowMs/);
});
