import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLIS, cliFromCommand } from './clis.js';

test('cliFromCommand maps first token to cli id', () => {
  assert.equal(cliFromCommand('claude'), 'claude');
  assert.equal(cliFromCommand('claude --dangerously-skip-permissions'), 'claude');
  assert.equal(cliFromCommand('codex --yolo'), 'codex');
  assert.equal(cliFromCommand('gemini --approval-mode auto_edit'), 'gemini');
});

test('cliFromCommand strips a path prefix from the binary', () => {
  assert.equal(cliFromCommand('/opt/homebrew/bin/gemini'), 'gemini');
  assert.equal(cliFromCommand('/usr/local/bin/codex --full-auto'), 'codex');
});

test('cliFromCommand returns null for unknown or empty', () => {
  assert.equal(cliFromCommand('aider'), null);
  assert.equal(cliFromCommand(''), null);
  assert.equal(cliFromCommand(null), null);
  assert.equal(cliFromCommand(undefined), null);
});

test('CLIS registry integrity', () => {
  assert.ok(Array.isArray(CLIS) && CLIS.length === 3);
  const ids = CLIS.map(c => c.id);
  assert.deepEqual(ids, ['claude', 'codex', 'gemini']);
  for (const c of CLIS) {
    assert.ok(c.id && c.label && c.binary && c.color, `cli ${c.id} has core fields`);
    assert.ok(Array.isArray(c.variants) && c.variants.length >= 1, `cli ${c.id} has variants`);
    for (const v of c.variants) {
      assert.ok(v.label && v.command, `variant of ${c.id} has label+command`);
      assert.equal(v.command.split(/\s+/)[0], c.binary, `variant command starts with ${c.binary}`);
    }
  }
});
