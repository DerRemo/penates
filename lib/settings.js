// lib/settings.js
// Server-side user settings, persisted across restarts. Mirrors
// lib/known-sessions.js (atomic tmp+rename writes, save-queue, corrupt backup).
// Stores ONLY the user's explicit overrides; get() merges them over the
// env-derived defaults passed at load() — so unset keys follow .env.
//
// Whitelisted keys: tmuxMouse ('on'|'off'), remoteApproval (boolean).

import { promises as fs } from 'fs';
import { join } from 'path';
import { penatesHome } from './penates-home.js';

// Lazy path accessors — resolved at call time so tests can redirect the state
// dir via process.env.PENATES_HOME (siehe lib/penates-home.js) before load()/save().
const storeDir = () => penatesHome();
const storePath = () => join(storeDir(), 'settings.json');

const VALIDATORS = {
  tmuxMouse: (v) => (v === 'on' || v === 'off') ? v : undefined,
  remoteApproval: (v) => (typeof v === 'boolean') ? v : undefined,
};

let defaults = { tmuxMouse: 'on', remoteApproval: true };
let overrides = {};
let saveQueue = Promise.resolve();

function sanitize(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const [k, validate] of Object.entries(VALIDATORS)) {
    if (k in obj) { const v = validate(obj[k]); if (v !== undefined) out[k] = v; }
  }
  return out;
}

export async function load(envDefaults = {}) {
  defaults = { ...defaults, ...sanitize(envDefaults) };
  try {
    const raw = await fs.readFile(storePath(), 'utf-8');
    overrides = sanitize(JSON.parse(raw));
  } catch (err) {
    if (err.code === 'ENOENT') {
      overrides = {};
    } else if (err instanceof SyntaxError) {
      const backup = `${storePath()}.corrupt-${Date.now()}`;
      try { await fs.rename(storePath(), backup); console.warn(`[settings] settings.json korrupt, umbenannt nach ${backup}`); }
      catch (e) { console.warn(`[settings] settings.json korrupt, Backup fehlgeschlagen: ${e.message}`); }
      overrides = {};
    } else {
      throw err;
    }
  }
}

export function get() {
  return { ...defaults, ...overrides };
}

export async function patch(partial) {
  overrides = { ...overrides, ...sanitize(partial) };
  await save();
  return get();
}

function save() {
  const doSave = async () => {
    await fs.mkdir(storeDir(), { recursive: true });
    const tmp = `${storePath()}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tmp, JSON.stringify(overrides, null, 2), 'utf-8');
    await fs.rename(tmp, storePath());
  };
  saveQueue = saveQueue.then(doSave, doSave);
  return saveQueue;
}

// Accessor functions (not value constants) so nothing can capture a stale path
// once and reuse it after PENATES_HOME changes — lazy resolution everywhere.
export const _internal = {
  storePath, storeDir,
  reset() { defaults = { tmuxMouse: 'on', remoteApproval: true }; overrides = {}; },
};
