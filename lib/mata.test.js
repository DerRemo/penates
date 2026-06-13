import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import http from 'node:http';
import * as mata from './mata.js';

// ── Pure helpers ────────────────────────────────────────────────────────────
test('MATA_PORT is 3070', () => { assert.equal(mata.MATA_PORT, 3070); });

test('parseStatus: running text', () => {
  const r = mata.parseStatus('Mata: running\nPID: 12345\nVersion: 1.1.10\nStarted: 2026-06-10T10:00:00Z');
  assert.equal(r.running, true);
  assert.equal(r.pid, 12345);
  assert.equal(r.version, '1.1.10');
  assert.equal(r.startedAt, '2026-06-10T10:00:00Z');
});

test('parseStatus: stopped text', () => {
  const r = mata.parseStatus('Mata: not running');
  assert.equal(r.running, false);
  assert.equal(r.pid, undefined);
});

test('parseStatus: status:running key form', () => {
  const r = mata.parseStatus('status: running\npid = 42');
  assert.equal(r.running, true);
  assert.equal(r.pid, 42);
});

test('parseStatus: JSON shape', () => {
  const r = mata.parseStatus('{"running":true,"pid":7,"version":"2.0.0","startedAt":"x"}');
  assert.equal(r.running, true);
  assert.equal(r.pid, 7);
  assert.equal(r.version, '2.0.0');
  assert.equal(r.startedAt, 'x');
});

test('parseStatus: empty/garbage → running:false', () => {
  assert.equal(mata.parseStatus('').running, false);
  assert.equal(mata.parseStatus(null).running, false);
  assert.equal(mata.parseStatus('???').running, false);
});

test('previewPortForSource maps mata→3070, else null', () => {
  assert.equal(mata.previewPortForSource('mata'), 3070);
  assert.equal(mata.previewPortForSource('dev'), null);
  assert.equal(mata.previewPortForSource(undefined), null);
});

// ── CLI wrappers (fake mata bin via MATA_BIN, like voice.test.js) ────────────
function freshEnv() { delete process.env.MATA_BIN; }

// Fake mata CLI: `status` prints $status; start/stop/restart exit per $exit.
function makeFakeMata(dir, { status = 'Mata: running\nPID: 999', exit = 0 } = {}) {
  const bin = join(dir, 'fake-mata.sh');
  writeFileSync(bin, `#!/bin/sh
case "$1" in
  status) printf '%s\\n' "${status}";;
  start|stop|restart) exit ${exit};;
  *) exit 0;;
esac
`);
  chmodSync(bin, 0o755);
  return bin;
}

test('resolveBin: MATA_BIN override wins; missing → null', async () => {
  freshEnv();
  const dir = mkdtempSync(join(tmpdir(), 'mata-'));
  try {
    process.env.MATA_BIN = makeFakeMata(dir);
    assert.equal(mata.resolveBin(), process.env.MATA_BIN);
    assert.equal(mata.isInstalled(), true);
    process.env.MATA_BIN = join(dir, 'nope');
    assert.equal(mata.resolveBin(), null);
    assert.equal(mata.isInstalled(), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('getStatus: parses fake bin output', async () => {
  freshEnv();
  const dir = mkdtempSync(join(tmpdir(), 'mata-'));
  try {
    process.env.MATA_BIN = makeFakeMata(dir, { status: 'Mata: running\nPID: 4321\nVersion: 1.2.3' });
    const r = await mata.getStatus();
    assert.equal(r.running, true);
    assert.equal(r.pid, 4321);
    assert.equal(r.version, '1.2.3');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('getStatus: missing app → null', async () => {
  freshEnv();
  process.env.MATA_BIN = join(tmpdir(), 'definitely-missing-mata');
  assert.equal(await mata.getStatus(), null);
});

test('start/stop/restart: ok on exit 0, !ok on failure', async () => {
  freshEnv();
  const dir = mkdtempSync(join(tmpdir(), 'mata-'));
  try {
    process.env.MATA_BIN = makeFakeMata(dir, { exit: 0 });
    assert.equal((await mata.start()).ok, true);
    assert.equal((await mata.restart()).ok, true);
    process.env.MATA_BIN = makeFakeMata(dir, { exit: 3 });
    assert.equal((await mata.stop()).ok, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── Network probes (throwaway servers) ──────────────────────────────────────
async function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}

test('isViewerPortOpen: true on an open port, false on a closed one', async () => {
  const srv = net.createServer((s) => s.destroy());
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const openPort = srv.address().port;
  try {
    assert.equal(await mata.isViewerPortOpen({ port: openPort, timeout: 500 }), true);
  } finally { srv.close(); }
  const closed = await freePort();
  assert.equal(await mata.isViewerPortOpen({ port: closed, timeout: 500 }), false);
});

test('captureFrame: {buffer,contentType} for image, null for non-image/closed', async () => {
  const imgSrv = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });
  await new Promise((r) => imgSrv.listen(0, '127.0.0.1', r));
  try {
    const f = await mata.captureFrame({ port: imgSrv.address().port, timeout: 1000 });
    assert.ok(f && Buffer.isBuffer(f.buffer));
    assert.match(f.contentType, /image\/png/);
    assert.equal(f.buffer[0], 0x89);
  } finally { imgSrv.close(); }

  const htmlSrv = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<html>');
  });
  await new Promise((r) => htmlSrv.listen(0, '127.0.0.1', r));
  try {
    assert.equal(await mata.captureFrame({ port: htmlSrv.address().port, timeout: 1000 }), null);
  } finally { htmlSrv.close(); }

  const closed = await freePort();
  assert.equal(await mata.captureFrame({ port: closed, timeout: 500 }), null);
});
