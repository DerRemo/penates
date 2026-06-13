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

import {
  collectHub, collectClis, collectNpmDeps, collectBrew, createUpdates,
} from './updates.js';

// ── collectHub ───────────────────────────────────────────────────────────────
test('collectHub — maps update-check state to a hub component', () => {
  const c = collectHub({ current: '0.7.1', latest: '0.8.0', isNewer: true, url: 'https://x' });
  assert.equal(c.id, 'hub');
  assert.equal(c.category, 'hub');
  assert.equal(c.current, '0.7.1');
  assert.equal(c.latest, '0.8.0');
  assert.equal(c.outdated, true);
  assert.equal(c.executable, true);
  assert.equal(c.source, 'github');
  assert.equal(c.url, 'https://x');
});
test('collectHub — null state still yields a component', () => {
  const c = collectHub(null);
  assert.equal(c.id, 'hub');
  assert.equal(c.outdated, false);
  assert.equal(c.executable, true);
});

// ── collectClis ──────────────────────────────────────────────────────────────
test('collectClis — version + npm latest, agy latest:null, missing bin skipped', async () => {
  const exec = (bin) => {
    if (bin === 'claude') return '0.7.0';
    if (bin === 'codex') return 'codex-cli 0.135.0';
    if (bin === 'gemini') throw new Error('not found'); // missing → skip
    if (bin === 'agy') return 'agy 1.0.0';
    throw new Error('unexpected');
  };
  const fetchFn = async (url) => ({
    ok: true,
    json: async () => ({
      version: url.includes('claude-code') ? '0.8.0'
             : url.includes('codex') ? '0.135.0' : '9.9.9',
    }),
  });
  const out = await collectClis({ exec, fetchFn });
  const ids = out.map(c => c.id);
  assert.ok(!ids.includes('cli:gemini')); // missing bin dropped
  const claude = out.find(c => c.id === 'cli:claude');
  assert.equal(claude.current, '0.7.0');
  assert.equal(claude.latest, '0.8.0');
  assert.equal(claude.outdated, true);
  assert.equal(claude.executable, true);
  const codex = out.find(c => c.id === 'cli:codex');
  assert.equal(codex.current, '0.135.0');
  assert.equal(codex.latest, '0.135.0');
  assert.equal(codex.outdated, false);
  const agy = out.find(c => c.id === 'cli:agy');
  assert.equal(agy.current, '1.0.0');
  assert.equal(agy.latest, null);
  assert.equal(agy.outdated, false);
  assert.equal(agy.executable, false);
});
test('collectClis — fetch failure leaves latest:null, never throws', async () => {
  const exec = () => '1.0.0';
  const fetchFn = async () => { throw new Error('net down'); };
  const out = await collectClis({ exec, fetchFn });
  assert.equal(out.find(c => c.id === 'cli:claude').latest, null);
  assert.equal(out.find(c => c.id === 'cli:claude').outdated, false);
});

// ── collectNpmDeps ───────────────────────────────────────────────────────────
test('collectNpmDeps — parses runner stdout (non-zero exit tolerated)', () => {
  const exec = () => JSON.stringify({ express: { current: '4.18.0', wanted: '4.18.0', latest: '4.19.0' } });
  const out = collectNpmDeps({ exec, cwd: '/repo' });
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'dep:express');
});
test('collectNpmDeps — runner throw → empty', () => {
  const exec = () => { throw new Error('npm missing'); };
  assert.deepEqual(collectNpmDeps({ exec, cwd: '/repo' }), []);
});

// ── collectBrew ──────────────────────────────────────────────────────────────
test('collectBrew — parses runner output, runner throw → empty', () => {
  const exec = () => JSON.stringify({ formulae: [{ name: 'tmux', installed_versions: ['3.4'], current_version: '3.5' }], casks: [] });
  assert.equal(collectBrew({ exec })[0].id, 'ext:tmux');
  const boom = () => { throw new Error('brew missing'); };
  assert.deepEqual(collectBrew({ exec: boom }), []);
});

// ── createUpdates aggregator ─────────────────────────────────────────────────
test('createUpdates — groups payload, computes outdatedCount, caches', async () => {
  let builds = 0;
  const u = createUpdates({
    hubStateFn: () => { builds++; return { current: '0.7.1', latest: '0.8.0', isNewer: true, url: 'u' }; },
    execCli: () => '1.0.0',
    fetchFn: async () => ({ ok: true, json: async () => ({ version: '1.0.0' }) }),
    execNpm: () => JSON.stringify({ express: { current: '4.0.0', latest: '4.1.0' } }),
    execBrew: () => JSON.stringify({ formulae: [{ name: 'tmux', installed_versions: ['3.4'], current_version: '3.5' }], casks: [] }),
    cwd: '/repo', ttlMs: 10_000, now: () => 1000,
  });
  const p = await u.getAll();
  assert.equal(p.hub.id, 'hub');
  assert.equal(p.clis.length, 4);          // agy included (latest:null)
  assert.equal(p.dependencies.length, 1);
  assert.equal(p.externals.length, 1);
  assert.equal(p.checkedAt, 1000);
  // outdated: hub + express + tmux = 3 (clis all current at 1.0.0)
  assert.equal(p.outdatedCount, 3);
  // cache hit → no rebuild
  await u.getAll();
  assert.equal(builds, 1);
  // refresh forces rebuild
  await u.getAll({ refresh: true });
  assert.equal(builds, 2);
});
test('createUpdates — a throwing collector does not kill the payload', async () => {
  const u = createUpdates({
    hubStateFn: () => ({ current: '1.0.0', latest: '1.0.0', isNewer: false, url: null }),
    execCli: () => { throw new Error('no clis'); },
    fetchFn: async () => { throw new Error('net'); },
    execNpm: () => { throw new Error('no npm'); },
    execBrew: () => { throw new Error('no brew'); },
    cwd: '/repo', now: () => 1,
  });
  const p = await u.getAll();
  assert.equal(p.hub.id, 'hub');
  assert.deepEqual(p.clis, []);
  assert.deepEqual(p.dependencies, []);
  assert.deepEqual(p.externals, []);
  assert.equal(p.outdatedCount, 0);
  assert.equal(p.error, null);
});
