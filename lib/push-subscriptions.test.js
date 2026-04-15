// Tests für lib/push-subscriptions.js — node --test lib/push-subscriptions.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// In-tmp override via HOME-env. Modul erwartet ~/.claude-code-hub.
const tmp = await fs.mkdtemp(join(tmpdir(), 'cchub-push-'));
process.env.HOME = tmp;

// Dynamischer Import nach HOME-Setup
const subs = await import('./push-subscriptions.js');

async function writeStore(data) {
  await fs.mkdir(join(tmp, '.claude-code-hub'), { recursive: true });
  await fs.writeFile(
    join(tmp, '.claude-code-hub', 'push-subscriptions.json'),
    JSON.stringify(data, null, 2),
    'utf-8',
  );
}

test('saveSub — vollständige Sub mit deviceId wird gespeichert', async () => {
  await writeStore({ subscriptions: [] });
  await subs.loadSubs();
  await subs.saveSub({
    endpoint: 'https://example.test/e1',
    keys: { p256dh: 'p', auth: 'a' },
    deviceId: 'dev-1',
  });
  const all = subs.allSubs();
  assert.equal(all.length, 1);
  assert.equal(all[0].deviceId, 'dev-1');
  assert.equal(all[0].failedAttempts, 0);
  assert.equal(all[0].lastError, null);
  assert.equal(typeof all[0].createdAt, 'number');
});

test('saveSub — ohne deviceId wirft', async () => {
  await writeStore({ subscriptions: [] });
  await subs.loadSubs();
  await assert.rejects(
    () => subs.saveSub({ endpoint: 'x', keys: {} }),
    /deviceId/,
  );
});

test('loadSubs — Alt-Einträge ohne deviceId werden beim Load gepruned', async () => {
  await writeStore({
    subscriptions: [
      { endpoint: 'https://old.test/e1', keys: { p256dh: 'p', auth: 'a' } },
      { endpoint: 'https://new.test/e2', keys: { p256dh: 'p', auth: 'a' }, deviceId: 'dev-1', createdAt: 1, failedAttempts: 0, lastError: null },
    ],
  });
  await subs.loadSubs();
  const all = subs.allSubs();
  assert.equal(all.length, 1);
  assert.equal(all[0].endpoint, 'https://new.test/e2');
});

test('incrementFailure — erhöht Zähler und setzt lastError', async () => {
  await writeStore({ subscriptions: [] });
  await subs.loadSubs();
  await subs.saveSub({
    endpoint: 'https://example.test/e1',
    keys: { p256dh: 'p', auth: 'a' },
    deviceId: 'dev-1',
  });
  await subs.incrementFailure('https://example.test/e1', { statusCode: 403, reason: 'BadJwtToken' });
  await subs.incrementFailure('https://example.test/e1', { statusCode: 403, reason: 'BadJwtToken' });
  const s = subs.allSubs()[0];
  assert.equal(s.failedAttempts, 2);
  assert.equal(s.lastError.statusCode, 403);
  assert.equal(s.lastError.reason, 'BadJwtToken');
});

test('resetFailure — setzt Zähler auf 0 und lastError auf null', async () => {
  await writeStore({ subscriptions: [] });
  await subs.loadSubs();
  await subs.saveSub({
    endpoint: 'https://example.test/e1',
    keys: { p256dh: 'p', auth: 'a' },
    deviceId: 'dev-1',
  });
  await subs.incrementFailure('https://example.test/e1', { statusCode: 403, reason: 'BadJwtToken' });
  await subs.resetFailure('https://example.test/e1');
  const s = subs.allSubs()[0];
  assert.equal(s.failedAttempts, 0);
  assert.equal(s.lastError, null);
});

test('isBroken — true ab 5 failedAttempts', async () => {
  await writeStore({ subscriptions: [] });
  await subs.loadSubs();
  await subs.saveSub({
    endpoint: 'https://example.test/e1',
    keys: { p256dh: 'p', auth: 'a' },
    deviceId: 'dev-1',
  });
  for (let i = 0; i < 5; i++) {
    await subs.incrementFailure('https://example.test/e1', { statusCode: 403, reason: 'BadJwtToken' });
  }
  assert.equal(subs.isBroken(subs.allSubs()[0]), true);
});
