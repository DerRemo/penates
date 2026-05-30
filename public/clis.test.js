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

test('each CLI has a non-trivial inline SVG logo', () => {
  for (const c of CLIS) {
    assert.equal(typeof c.logo, 'string', `cli ${c.id} has a logo string`);
    assert.ok(c.logo.includes('<svg'), `cli ${c.id} logo is inline svg`);
    assert.ok(c.logo.includes('</svg>'), `cli ${c.id} logo svg is closed`);
    assert.ok(c.logo.length > 80, `cli ${c.id} logo is non-trivial`);
  }
});

test('claude logo is the Claude sunburst, not the Anthropic A', () => {
  const claude = CLIS.find(c => c.id === 'claude');
  // Das Claude-Sunburst (svgl claude-ai-icon) hat viewBox "0 0 256 257";
  // das Anthropic-"A" (simple-icons) hat "0 0 24 24". So bleibt die
  // Entscheidung "Claude-Logo, nicht Anthropic" im Test verankert.
  assert.ok(claude.logo.includes('256 257'), 'claude uses the sunburst viewBox');
  assert.ok(claude.logo.includes('#D97757'), 'claude uses the brand orange');
});
