// lib/approvals.test.js — node --test lib/approvals.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldRoute, IMPACTFUL_TOOLS, create, resolve, get, list,
  pendingForSession, forget, rename, _reset,
} from './approvals.js';

test('IMPACTFUL_TOOLS hat das erwartete Set', () => {
  for (const t of ['Bash', 'Edit', 'Write', 'WebFetch', 'WebSearch', 'Task']) {
    assert.ok(IMPACTFUL_TOOLS.has(t), `${t} fehlt`);
  }
  assert.ok(!IMPACTFUL_TOOLS.has('Read'));
});

test('shouldRoute: nur default-Modus + unattached + impactful + enabled', () => {
  const base = { mode: 'default', hubAttached: 0, tmuxAttached: false, tool: 'Bash', enabled: true };
  assert.equal(shouldRoute(base), true);
  assert.equal(shouldRoute({ ...base, enabled: false }), false, 'feature off');
  assert.equal(shouldRoute({ ...base, mode: 'acceptEdits' }), false, 'auto');
  assert.equal(shouldRoute({ ...base, mode: 'bypassPermissions' }), false, 'yolo');
  assert.equal(shouldRoute({ ...base, mode: 'plan' }), false, 'plan');
  assert.equal(shouldRoute({ ...base, hubAttached: 1 }), false, 'hub attached');
  assert.equal(shouldRoute({ ...base, tmuxAttached: true }), false, 'foreign attached');
  assert.equal(shouldRoute({ ...base, tool: 'Read' }), false, 'non-impactful');
});

test('create → resolve liefert die Entscheidung an den Callback', () => {
  _reset();
  let got = null;
  const id = create({ session: 'cc-a', tool: 'Bash', toolInput: { command: 'ls' }, cwd: '/x' },
    (decision) => { got = decision; });
  assert.ok(get(id), 'pending existiert');
  assert.equal(pendingForSession('cc-a').length, 1);
  assert.equal(resolve(id, 'allow'), true);
  assert.equal(got, 'allow');
  assert.equal(get(id), undefined, 'nach resolve entfernt');
  assert.equal(resolve(id, 'deny'), false, 'zweiter resolve = no-op');
});

test('create: Timeout resolved als defer', async () => {
  _reset();
  let got = null;
  create({ session: 'cc-a', tool: 'Bash', toolInput: {}, cwd: '/x' },
    (d) => { got = d; }, { timeoutMs: 20 });
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(got, 'defer');
});

test('create vergibt ein otp das get mitliefert', () => {
  _reset();
  const id = create({ session: 'cc-a', tool: 'Bash', toolInput: {}, cwd: '/x' }, () => {});
  const p = get(id);
  assert.equal(typeof p.otp, 'string');
  assert.ok(p.otp.length >= 16);
});

test('forget(session) resolved alle Pendings der Session als defer', () => {
  _reset();
  const seen = [];
  const id = create({ session: 'cc-a', tool: 'Bash', toolInput: {}, cwd: '/x' }, (d) => seen.push(d));
  forget('cc-a');
  assert.equal(seen[0], 'defer');
  assert.equal(get(id), undefined);
});

test('rename schlüsselt Pendings auf den neuen Session-Namen um', () => {
  _reset();
  const id = create({ session: 'cc-a', tool: 'Bash', toolInput: {}, cwd: '/x' }, () => {});
  rename('cc-a', 'cc-b');
  assert.equal(pendingForSession('cc-a').length, 0);
  assert.equal(pendingForSession('cc-b').length, 1);
  assert.equal(get(id).session, 'cc-b');
});
