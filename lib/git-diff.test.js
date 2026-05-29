import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';
import { parseStatusV2, getDiff } from './git-diff.js';

// NUL-getrennte porcelain=v2 -z Records als ein String.
function rec(...parts) { return parts.join('\0') + '\0'; }

test('parseStatusV2 liest branch/ahead/behind + kategorisiert Dateien', () => {
  const raw = rec(
    '# branch.head main',
    '# branch.ab +2 -1',
    '1 M. N... 100644 100644 100644 aaa bbb staged-only.txt',
    '1 .M N... 100644 100644 100644 ccc ddd unstaged-only.txt',
    '1 MM N... 100644 100644 100644 eee fff both.txt',
    '? untracked.txt',
  );
  const r = parseStatusV2(raw);
  assert.equal(r.branch, 'main');
  assert.equal(r.ahead, 2);
  assert.equal(r.behind, 1);
  const staged = r.files.filter(f => f.category === 'staged').map(f => f.path).sort();
  const unstaged = r.files.filter(f => f.category === 'unstaged').map(f => f.path).sort();
  const untracked = r.files.filter(f => f.category === 'untracked').map(f => f.path);
  assert.deepEqual(staged, ['both.txt', 'staged-only.txt']);
  assert.deepEqual(unstaged, ['both.txt', 'unstaged-only.txt']);
  assert.deepEqual(untracked, ['untracked.txt']);
});

test('parseStatusV2 erkennt Rename mit oldPath', () => {
  const raw = rec(
    '# branch.head main',
    '# branch.ab +0 -0',
    '2 R. N... 100644 100644 100644 aaa bbb R100 new-name.txt',
    'old-name.txt',
  );
  const r = parseStatusV2(raw);
  const renamed = r.files.find(f => f.path === 'new-name.txt');
  assert.equal(renamed.status, 'R');
  assert.equal(renamed.oldPath, 'old-name.txt');
  assert.equal(renamed.category, 'staged');
});

test('parseStatusV2 ohne branch.head → null', () => {
  assert.equal(parseStatusV2(''), null);
});
