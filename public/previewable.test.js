import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PREVIEWABLE_EXT, isPreviewablePath, findPreviewableTokens } from './previewable.js';

test('isPreviewablePath: true for path-like tokens with a known extension', () => {
  for (const t of ['/tmp/x.png', './a.md', '../b.pdf', '~/b.pdf', 'README.md', 'src/app.ts', 'stats.png', '/private/var/folders/zz/T/out.jpeg']) {
    assert.equal(isPreviewablePath(t), true, `${t} should match`);
  }
});

test('isPreviewablePath: false for domains, versions, urls, extensionless, unknown ext', () => {
  for (const t of ['example.com', 'v1.2.3', 'https://x.com/y', 'http://a.b/c.png', 'foo', 'bar.unknownext', '', '   ', 'a b.png', '.gitignore', 'Makefile']) {
    assert.equal(isPreviewablePath(t), false, `${t} should NOT match`);
  }
});

test('PREVIEWABLE_EXT integrity: lowercase, deduped, covers images+pdf+text', () => {
  assert.ok(PREVIEWABLE_EXT instanceof Set);
  for (const e of PREVIEWABLE_EXT) assert.equal(e, e.toLowerCase(), `${e} is lowercase`);
  for (const e of ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf', 'md', 'json', 'ts', 'py', 'log']) {
    assert.ok(PREVIEWABLE_EXT.has(e), `has ${e}`);
  }
  assert.ok(!PREVIEWABLE_EXT.has('com'));
  assert.ok(!PREVIEWABLE_EXT.has('exe'));
});

test('findPreviewableTokens returns tokens with char offsets, skips non-matches', () => {
  const line = 'wrote /tmp/baliet/stats.png (204.3KB) and example.com done';
  const hits = findPreviewableTokens(line);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].text, '/tmp/baliet/stats.png');
  assert.equal(line.slice(hits[0].start, hits[0].end), '/tmp/baliet/stats.png');
});

test('findPreviewableTokens strips trailing punctuation but keeps the path', () => {
  const line = 'see ./notes.md, then /tmp/a.png.';
  const hits = findPreviewableTokens(line);
  assert.deepEqual(hits.map(h => h.text), ['./notes.md', '/tmp/a.png']);
  // offsets point at the bare path inside the original line
  assert.equal(line.slice(hits[0].start, hits[0].end), './notes.md');
  assert.equal(line.slice(hits[1].start, hits[1].end), '/tmp/a.png');
});

test('findPreviewableTokens: empty / whitespace-only line → []', () => {
  assert.deepEqual(findPreviewableTokens(''), []);
  assert.deepEqual(findPreviewableTokens('   \t  '), []);
});
