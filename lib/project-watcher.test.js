// lib/project-watcher.test.js
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import * as watcher from './project-watcher.js';

afterEach(() => watcher.closeAll());

const captureWarn = (fn) => {
  const warnings = [];
  const orig = console.warn;
  console.warn = (...a) => warnings.push(a.join(' '));
  try { fn(); } finally { console.warn = orig; }
  return warnings;
};

test('attach skips silently when project has neither CHANGELOG.md nor ROADMAP.md', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pw-'));
  const warnings = captureWarn(() => watcher.syncWatchers({ projects: [{ id: 'p1', path: dir }] }));
  assert.equal(watcher._debugState().watching.includes('p1'), false, 'no watcher for docless project');
  assert.equal(warnings.some(w => w.includes('watch failed')), false, 'no watch-failed spam');
  rmSync(dir, { recursive: true, force: true });
});

test('attach watches a project that has CHANGELOG.md', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pw-'));
  writeFileSync(join(dir, 'CHANGELOG.md'), '# x\n');
  watcher.syncWatchers({ projects: [{ id: 'p2', path: dir }] });
  assert.equal(watcher._debugState().watching.includes('p2'), true);
  rmSync(dir, { recursive: true, force: true });
});

test('attach falls back to ROADMAP.md when only that exists', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pw-'));
  writeFileSync(join(dir, 'ROADMAP.md'), '# x\n');
  watcher.syncWatchers({ projects: [{ id: 'p3', path: dir }] });
  assert.equal(watcher._debugState().watching.includes('p3'), true);
  rmSync(dir, { recursive: true, force: true });
});
