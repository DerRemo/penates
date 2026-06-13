// Update-System aggregator (Express-frei, unit-testbar). Baut eine flache
// Komponentenliste über vier fehlertolerante Collectors (Hub/CLIs/Deps/Externals)
// plus eine statische Update-Registry und den Self-Update-Guard. Reines
// Daten-/Funktionsmodul, kein Express. Runner/Fetch sind injizierbar (Tests).

import { execFileSync } from 'child_process';
import { join } from 'path';
import { semverGt } from './update-check.js';

// ── CLI-Ziele: id → bin + npm-Paket (latest via npm-Registry) ────────────────
export const CLI_TARGETS = [
  { id: 'cli:claude', name: 'Claude Code', bin: 'claude', npm: '@anthropic-ai/claude-code' },
  { id: 'cli:codex',  name: 'Codex',       bin: 'codex',  npm: '@openai/codex' },
  { id: 'cli:gemini', name: 'Gemini CLI',  bin: 'gemini', npm: '@google/gemini-cli' },
  { id: 'cli:agy',    name: 'Antigravity', bin: 'agy',    npm: null },
];

// brew-Externals-Allowlist.
export const BREW_ALLOWLIST = ['moshi-hook', 'whisper-cpp', 'tmux'];

// ── Update-Registry: componentId → statischer Befehl | null ──────────────────
// null = Anzeige-only (kein Button). Befehle sind STATISCHE Strings (nie aus
// User-Input). Hub interpoliert repoDir (server-kontrolliert, vertrauenswürdig).
const REGISTRY = {
  'hub':            ({ repoDir } = {}) => `bash ${join(repoDir || '.', 'scripts/update.sh')}`,
  'cli:claude':     () => 'claude update',
  'cli:codex':      () => 'codex update',
  'cli:gemini':     () => 'brew upgrade gemini-cli',
  'cli:agy':        null,
  'ext:moshi-hook': () => 'brew upgrade moshi-hook',
  'ext:whisper-cpp':() => 'brew upgrade whisper-cpp',
  'ext:tmux':       () => 'brew upgrade tmux',
};

export function isExecutable(id) {
  return typeof REGISTRY[id] === 'function';
}

export function updateCommandFor(id, ctx) {
  const fn = REGISTRY[id];
  return typeof fn === 'function' ? fn(ctx || {}) : null;
}

// id → tmux-Session-Name. tmux verträgt kein ':' (Target-Syntax) → ersetzen.
export function updateSessionName(id) {
  return 'cc-update-' + String(id).replace(/[^\w-]/g, '-');
}

// ── Self-Update-Guard (nur Hub) ──────────────────────────────────────────────
export function canSelfUpdate({ isNewer, clean, aheadOfOrigin } = {}) {
  if (!isNewer) return { ok: false, reason: 'up-to-date' };
  if (!clean) return { ok: false, reason: 'dirty-tree' };
  if (aheadOfOrigin > 0) return { ok: false, reason: 'local-ahead' };
  return { ok: true };
}

// ── Parser ───────────────────────────────────────────────────────────────────
const SEMVER_RE = /(\d+\.\d+\.\d+)/;
export function parseCliVersion(raw) {
  if (typeof raw !== 'string') return null;
  const m = raw.match(SEMVER_RE);
  return m ? m[1] : null;
}

function parseJSON(s) { try { return JSON.parse(s); } catch { return null; } }

// `npm outdated --json` → dependency-Components. npm liefert {pkg:{current,wanted,latest}}.
export function parseNpmOutdated(raw) {
  const data = parseJSON(raw);
  if (!data || typeof data !== 'object') return [];
  return Object.entries(data).map(([pkg, info]) => {
    const current = info.current ?? null;
    const latest = info.latest ?? null;
    return {
      id: `dep:${pkg}`, category: 'dependency', name: pkg,
      current, latest,
      outdated: !!(current && latest && semverGt(latest, current)),
      source: 'npm-outdated', executable: false, url: null,
    };
  });
}

// `brew outdated --json=v2` → external-Components, gefiltert auf Allowlist.
export function parseBrewOutdated(raw) {
  const data = parseJSON(raw);
  if (!data || !Array.isArray(data.formulae)) return [];
  return data.formulae
    .filter(f => BREW_ALLOWLIST.includes(f.name))
    .map(f => {
      const current = Array.isArray(f.installed_versions) ? (f.installed_versions[0] ?? null) : null;
      const latest = f.current_version ?? null;
      const id = `ext:${f.name}`;
      return {
        id, category: 'external', name: f.name,
        current, latest,
        outdated: true, // brew listet nur veraltete Formeln
        source: 'brew', executable: isExecutable(id), url: null,
      };
    });
}

// ── Collectors (alle fehlertolerant) ─────────────────────────────────────────

// Default-Runner: <bin> --version, stdout getrimmt. Tests injizieren exec.
function defaultCliExec(bin) {
  return execFileSync(bin, ['--version'], { encoding: 'utf8', timeout: 5000 });
}
// npm outdated wirft bei Exit≠0 (Standardverhalten bei Outdates) — stdout aus
// dem Error fischen statt als Fehler zu werten.
function defaultNpmExec(cwd) {
  try {
    return execFileSync('npm', ['outdated', '--json'], { encoding: 'utf8', cwd, timeout: 30000 });
  } catch (e) {
    if (e && e.stdout) return e.stdout.toString();
    throw e;
  }
}
function defaultBrewExec() {
  return execFileSync('brew', ['outdated', '--json=v2'], { encoding: 'utf8', timeout: 15000 });
}

export function collectHub(hubState) {
  const s = hubState || {};
  return {
    id: 'hub', category: 'hub', name: 'Claude Code Hub',
    current: s.current ?? null, latest: s.latest ?? null,
    outdated: !!s.isNewer, source: 'github', executable: true, url: s.url ?? null,
  };
}

export async function collectClis({ exec = defaultCliExec, fetchFn = globalThis.fetch, timeoutMs = 10000 } = {}) {
  const out = [];
  for (const t of CLI_TARGETS) {
    let current;
    try { current = parseCliVersion(exec(t.bin)); }
    catch { continue; } // CLI nicht im PATH → weglassen
    let latest = null;
    if (t.npm) {
      try {
        const res = await fetchFn(`https://registry.npmjs.org/${t.npm}/latest`, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined,
        });
        if (res && res.ok) {
          const data = await res.json();
          latest = data && data.version ? String(data.version) : null;
        }
      } catch { latest = null; }
    }
    out.push({
      id: t.id, category: 'cli', name: t.name,
      current: current ?? null, latest,
      outdated: !!(current && latest && semverGt(latest, current)),
      source: 'cli', executable: isExecutable(t.id),
      url: t.npm ? `https://www.npmjs.com/package/${t.npm}` : null,
    });
  }
  return out;
}

export function collectNpmDeps({ exec = defaultNpmExec, cwd } = {}) {
  try { return parseNpmOutdated(exec(cwd)); }
  catch { return []; }
}

export function collectBrew({ exec = defaultBrewExec } = {}) {
  try { return parseBrewOutdated(exec()); }
  catch { return []; }
}

// ── Aggregator mit TTL-Cache + Refresh (Muster wie update-check.js) ──────────
export function createUpdates({
  hubStateFn,
  execCli, fetchFn, execNpm, execBrew,
  cwd, repoDir, ttlMs = 3_600_000, now = () => Date.now(),
} = {}) {
  let cache = null; // { payload, ts }

  async function build() {
    let hub = null, clis = [], dependencies = [], externals = [];
    try { hub = collectHub(hubStateFn ? hubStateFn() : null); } catch { hub = collectHub(null); }
    try { clis = await collectClis({ exec: execCli, fetchFn }); } catch { clis = []; }
    try { dependencies = collectNpmDeps({ exec: execNpm ? () => execNpm(cwd) : undefined, cwd }); } catch { dependencies = []; }
    try { externals = collectBrew({ exec: execBrew }); } catch { externals = []; }
    const all = [hub, ...clis, ...dependencies, ...externals].filter(Boolean);
    return {
      hub, clis, dependencies, externals,
      outdatedCount: all.filter(c => c.outdated).length,
      checkedAt: now(), error: null,
    };
  }

  return {
    repoDir,
    async getAll({ refresh = false } = {}) {
      if (!refresh && cache && now() - cache.ts < ttlMs) return cache.payload;
      const payload = await build();
      cache = { payload, ts: now() };
      return payload;
    },
  };
}
