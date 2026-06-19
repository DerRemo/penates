import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTmuxSessions, buildSpawnArgs, LIST_FORMAT } from './tmux.js';

test('parseTmuxSessions: empty / whitespace / nullish input yields []', () => {
  assert.deepEqual(parseTmuxSessions(''), []);
  assert.deepEqual(parseTmuxSessions('   \n  '), []);
  assert.deepEqual(parseTmuxSessions(undefined), []);
  assert.deepEqual(parseTmuxSessions(null), []);
});

test('parseTmuxSessions: parses a single session line', () => {
  const r = parseTmuxSessions('cc-foo|1700000000|2|1|/Users/me/proj');
  assert.deepEqual(r, [{
    name: 'cc-foo', created: 1700000000000, windows: 2, attached: true, path: '/Users/me/proj',
  }]);
});

test('parseTmuxSessions: attached is true only for a count > 0', () => {
  assert.equal(parseTmuxSessions('a|1|1|0|/p')[0].attached, false);
  assert.equal(parseTmuxSessions('a|1|1|1|/p')[0].attached, true);
  assert.equal(parseTmuxSessions('a|1|1|2|/p')[0].attached, true);
});

test('parseTmuxSessions: keeps | inside the pane path (last field rejoined)', () => {
  const r = parseTmuxSessions('cc-x|1700000000|1|0|/Users/me/we|rd|dir');
  assert.equal(r[0].path, '/Users/me/we|rd|dir');
});

test('parseTmuxSessions: empty path field falls back to ~', () => {
  assert.equal(parseTmuxSessions('cc-x|1700000000|1|0|')[0].path, '~');
});

test('parseTmuxSessions: parses multiple sessions, trims surrounding whitespace', () => {
  const r = parseTmuxSessions('a|1|1|0|/p\nb|2|3|1|/q\n');
  assert.equal(r.length, 2);
  assert.equal(r[1].name, 'b');
  assert.equal(r[1].windows, 3);
  assert.equal(r[1].created, 2000);
});

test('buildSpawnArgs: assembles new-session argv with env between -s and -c', () => {
  const args = buildSpawnArgs({ sessionName: 'cc-foo', envArgs: ['-e', 'X=1'], dir: '/d', shellCmd: 'claude' });
  assert.deepEqual(args, ['new-session', '-d', '-s', 'cc-foo', '-e', 'X=1', '-c', '/d', 'claude']);
});

test('buildSpawnArgs: omits the env block when envArgs is empty/absent', () => {
  assert.deepEqual(
    buildSpawnArgs({ sessionName: 's', dir: '/d', shellCmd: 'codex' }),
    ['new-session', '-d', '-s', 's', '-c', '/d', 'codex'],
  );
});

test('buildSpawnArgs: keeps all three hub -e env pairs in order before -c (real spawn path)', () => {
  const envArgs = ['-e', 'PENATES_SESSION=cc-x', '-e', 'PENATES_URL=http://h', '-e', 'PENATES_TOKEN=tok'];
  assert.deepEqual(
    buildSpawnArgs({ sessionName: 'cc-x', envArgs, dir: '/proj', shellCmd: 'claude' }),
    ['new-session', '-d', '-s', 'cc-x', '-e', 'PENATES_SESSION=cc-x', '-e', 'PENATES_URL=http://h', '-e', 'PENATES_TOKEN=tok', '-c', '/proj', 'claude'],
  );
});

test('parseTmuxSessions: a malformed line without | degrades safely (name kept, path → ~)', () => {
  const r = parseTmuxSessions('weirdline');
  assert.equal(r.length, 1);
  assert.equal(r[0].name, 'weirdline');
  assert.equal(r[0].path, '~');
});

test('LIST_FORMAT is the five pipe-joined tmux fields the parser expects', () => {
  assert.equal(LIST_FORMAT, '#{session_name}|#{session_created}|#{session_windows}|#{session_attached}|#{pane_current_path}');
});
