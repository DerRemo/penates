import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canSelfUpdate, isExecutable, updateCommandFor, updateSessionName,
  parseCliVersion, parseNpmOutdated, parseBrewOutdated,
  CLI_TARGETS,
} from './updates.js';

// ── canSelfUpdate truth table ────────────────────────────────────────────────
test('canSelfUpdate — up-to-date when not newer', () => {
  assert.deepEqual(canSelfUpdate({ isNewer: false, clean: true, aheadOfOrigin: 0 }),
    { ok: false, reason: 'up-to-date' });
});
test('canSelfUpdate — dirty tree blocks', () => {
  assert.deepEqual(canSelfUpdate({ isNewer: true, clean: false, aheadOfOrigin: 0 }),
    { ok: false, reason: 'dirty-tree' });
});
test('canSelfUpdate — local-ahead (dev checkout) blocks', () => {
  assert.deepEqual(canSelfUpdate({ isNewer: true, clean: true, aheadOfOrigin: 3 }),
    { ok: false, reason: 'local-ahead' });
});
test('canSelfUpdate — detached HEAD (ahead=0) on foreign install passes', () => {
  assert.deepEqual(canSelfUpdate({ isNewer: true, clean: true, aheadOfOrigin: 0 }),
    { ok: true });
});

// ── registry / isExecutable ──────────────────────────────────────────────────
test('isExecutable — hub/cli/ext executable, agy/dep/unknown not', () => {
  assert.equal(isExecutable('hub'), true);
  assert.equal(isExecutable('cli:claude'), true);
  assert.equal(isExecutable('cli:codex'), true);
  assert.equal(isExecutable('cli:gemini'), true);
  assert.equal(isExecutable('cli:agy'), false);
  assert.equal(isExecutable('ext:moshi-hook'), true);
  assert.equal(isExecutable('ext:whisper-cpp'), true);
  assert.equal(isExecutable('ext:tmux'), true);
  assert.equal(isExecutable('dep:@xterm/xterm'), false);
  assert.equal(isExecutable('dep:express'), false);
  assert.equal(isExecutable('bogus'), false);
  assert.equal(isExecutable(''), false);
  assert.equal(isExecutable(undefined), false);
});
test('updateCommandFor — returns static command, hub interpolates repoDir', () => {
  assert.equal(updateCommandFor('cli:claude'), 'claude update');
  assert.equal(updateCommandFor('cli:codex'), 'codex update');
  assert.equal(updateCommandFor('cli:gemini'), 'brew upgrade gemini-cli');
  assert.equal(updateCommandFor('ext:moshi-hook'), 'brew upgrade moshi-hook');
  assert.equal(updateCommandFor('ext:tmux'), 'brew upgrade tmux');
  assert.equal(updateCommandFor('hub', { repoDir: '/x/repo' }), 'bash /x/repo/scripts/update.sh');
  assert.equal(updateCommandFor('cli:agy'), null);
  assert.equal(updateCommandFor('dep:express'), null);
  assert.equal(updateCommandFor('bogus'), null);
});

// ── session-name mapping ─────────────────────────────────────────────────────
test('updateSessionName — colon-safe tmux session name', () => {
  assert.equal(updateSessionName('hub'), 'cc-update-hub');
  assert.equal(updateSessionName('cli:codex'), 'cc-update-cli-codex');
  assert.equal(updateSessionName('ext:moshi-hook'), 'cc-update-ext-moshi-hook');
});

// ── CLI version parsing ──────────────────────────────────────────────────────
test('parseCliVersion — extracts first semver from varied output', () => {
  assert.equal(parseCliVersion('1.2.3'), '1.2.3');
  assert.equal(parseCliVersion('codex-cli 0.135.0'), '0.135.0');
  assert.equal(parseCliVersion('claude 0.7.1 (Claude Code)\n'), '0.7.1');
  assert.equal(parseCliVersion('v2.10.4'), '2.10.4');
  assert.equal(parseCliVersion('no version here'), null);
  assert.equal(parseCliVersion(''), null);
  assert.equal(parseCliVersion(null), null);
});

// ── npm outdated parsing ─────────────────────────────────────────────────────
test('parseNpmOutdated — maps json to dependency components', () => {
  const json = JSON.stringify({
    '@xterm/xterm': { current: '6.0.0', wanted: '6.0.0', latest: '6.1.0' },
    express: { current: '4.18.0', wanted: '4.18.0', latest: '4.19.0' },
  });
  const out = parseNpmOutdated(json);
  const xterm = out.find(c => c.id === 'dep:@xterm/xterm');
  assert.ok(xterm);
  assert.equal(xterm.category, 'dependency');
  assert.equal(xterm.name, '@xterm/xterm');
  assert.equal(xterm.current, '6.0.0');
  assert.equal(xterm.latest, '6.1.0');
  assert.equal(xterm.outdated, true);
  assert.equal(xterm.executable, false);
  assert.equal(xterm.source, 'npm-outdated');
  assert.equal(out.length, 2);
});
test('parseNpmOutdated — empty/garbage tolerated', () => {
  assert.deepEqual(parseNpmOutdated('{}'), []);
  assert.deepEqual(parseNpmOutdated(''), []);
  assert.deepEqual(parseNpmOutdated('not json'), []);
});

// ── brew outdated parsing ────────────────────────────────────────────────────
test('parseBrewOutdated — filtered to allowlist, external components', () => {
  const json = JSON.stringify({
    formulae: [
      { name: 'tmux', installed_versions: ['3.4'], current_version: '3.5' },
      { name: 'moshi-hook', installed_versions: ['1.0.0'], current_version: '1.1.0' },
      { name: 'wget', installed_versions: ['1.0'], current_version: '1.1' },
    ],
    casks: [],
  });
  const out = parseBrewOutdated(json);
  assert.equal(out.length, 2); // wget filtered out
  const tmux = out.find(c => c.id === 'ext:tmux');
  assert.equal(tmux.category, 'external');
  assert.equal(tmux.current, '3.4');
  assert.equal(tmux.latest, '3.5');
  assert.equal(tmux.outdated, true);
  assert.equal(tmux.executable, true);
  assert.equal(tmux.source, 'brew');
});
test('parseBrewOutdated — empty/garbage tolerated', () => {
  assert.deepEqual(parseBrewOutdated('{"formulae":[],"casks":[]}'), []);
  assert.deepEqual(parseBrewOutdated(''), []);
  assert.deepEqual(parseBrewOutdated('not json'), []);
});

test('CLI_TARGETS — declares the four CLIs with npm mapping', () => {
  const ids = CLI_TARGETS.map(c => c.id);
  assert.deepEqual(ids, ['cli:claude', 'cli:codex', 'cli:gemini', 'cli:agy']);
  assert.equal(CLI_TARGETS.find(c => c.id === 'cli:claude').npm, '@anthropic-ai/claude-code');
  assert.equal(CLI_TARGETS.find(c => c.id === 'cli:agy').npm, null);
});
