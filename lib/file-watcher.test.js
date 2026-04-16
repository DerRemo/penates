import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, realpathSync } from 'fs';
import { join } from 'path';
import { makeTempProject } from './files.test-helpers.js';
import { subscribeProject, unsubscribeProject, closeAll, noteSelfWrite } from './file-watcher.js';

test('detects file add within debounce window', async () => {
  const { root: rawRoot, cleanup } = makeTempProject({});
  const root = realpathSync(rawRoot);
  const events = [];
  const handler = (ev) => events.push(ev);
  subscribeProject('p1', root, handler);
  await new Promise(r => setTimeout(r, 150));
  writeFileSync(join(root, 'new.txt'), 'hi');
  await new Promise(r => setTimeout(r, 400));
  assert.ok(events.length > 0, 'expected at least one event');
  assert.equal(events[0].projectId, 'p1');
  unsubscribeProject('p1', handler);
  closeAll();
  cleanup();
});

test('self-write-suppression drops own events', async () => {
  const { root: rawRoot, cleanup } = makeTempProject({});
  const root = realpathSync(rawRoot);
  const events = [];
  const handler = (ev) => events.push(ev);
  subscribeProject('p2', root, handler);
  await new Promise(r => setTimeout(r, 150));
  const abs = join(root, 'uploaded.txt');
  noteSelfWrite(abs);
  writeFileSync(abs, 'bye');
  await new Promise(r => setTimeout(r, 400));
  assert.equal(events.length, 0, 'self-written file should not emit');
  unsubscribeProject('p2', handler);
  closeAll();
  cleanup();
});

test('ignores filtered folders', async () => {
  const { root: rawRoot, cleanup } = makeTempProject({});
  const root = realpathSync(rawRoot);
  const events = [];
  const handler = (ev) => events.push(ev);
  subscribeProject('p3', root, handler);
  await new Promise(r => setTimeout(r, 150));
  mkdirSync(join(root, 'node_modules'));
  writeFileSync(join(root, 'node_modules', 'p.json'), '{}');
  await new Promise(r => setTimeout(r, 400));
  assert.equal(events.length, 0, 'node_modules should be ignored');
  unsubscribeProject('p3', handler);
  closeAll();
  cleanup();
});
