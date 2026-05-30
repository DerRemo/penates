import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureScrollback } from './scrollback.js';

const TMUX = process.env.TMUX_PATH || 'tmux';

// 1) Argv-Konstruktion deterministisch gegen ein Fake-tmux das seine Args druckt.
test('captureScrollback builds the expected capture-pane argv', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sb-'));
  try {
    const fake = join(dir, 'fake-tmux.sh');
    writeFileSync(fake, '#!/bin/sh\nfor a in "$@"; do printf "%s\\n" "$a"; done\n');
    chmodSync(fake, 0o755);
    const out = captureScrollback('mysess', { lines: 500, tmux: fake });
    const args = out.split('\n');
    assert.ok(args.includes('capture-pane'));
    assert.ok(args.includes('-p'));
    assert.ok(args.includes('-e'));
    assert.ok(args.includes('-S'));
    assert.ok(args.includes('-500'));
    assert.ok(args.includes('-E'));
    assert.ok(args.includes('-1'));
    assert.ok(args.includes('-t'));
    assert.ok(args.includes('mysess'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// 2) Echte tmux-Session mit erzwungener Scrollback-History.
test('captureScrollback returns scrolled-off history lines from a real session', () => {
  const sess = `cchub-sbtest-${process.pid}`;
  try {
    execFileSync(TMUX, ['new-session', '-d', '-s', sess, '-x', '120', '-y', '10']);
    execFileSync(TMUX, ['send-keys', '-t', sess, 'for i in $(seq 1 60); do echo SBLINE$i; done', 'Enter']);
    execFileSync('sh', ['-c', 'sleep 0.5']);
    const out = captureScrollback(sess, { lines: 2000, tmux: TMUX });
    assert.ok(out.includes('SBLINE1'), 'früheste Zeile muss in der History stehen');
    assert.ok(out.includes('SBLINE40'), 'mittlere History-Zeile muss vorhanden sein');
  } finally {
    try { execFileSync(TMUX, ['kill-session', '-t', sess]); } catch {}
  }
});

// 3) Nicht-existente Session → '' (best-effort, kein Throw).
test('captureScrollback returns empty string for a missing session', () => {
  const out = captureScrollback(`cchub-nope-${process.pid}`, { lines: 100, tmux: TMUX });
  assert.equal(out, '');
});
