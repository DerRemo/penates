// lib/settings.js
// Server-side user settings, persisted across restarts. Mirrors
// lib/known-sessions.js (atomic tmp+rename writes, save-queue, corrupt backup).
// Stores ONLY the user's explicit overrides; get() merges them over the
// env-derived defaults passed at load() — so unset keys follow .env.
//
// Whitelisted keys: tmuxMouse ('on'|'off'), remoteApproval (boolean).

import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const STORE_DIR = join(homedir(), '.claude-code-hub');
const STORE_PATH = join(STORE_DIR, 'settings.json');

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
    const raw = await fs.readFile(STORE_PATH, 'utf-8');
    overrides = sanitize(JSON.parse(raw));
  } catch (err) {
    if (err.code === 'ENOENT') {
      overrides = {};
    } else if (err instanceof SyntaxError) {
      const backup = `${STORE_PATH}.corrupt-${Date.now()}`;
      try { await fs.rename(STORE_PATH, backup); console.warn(`[settings] settings.json korrupt, umbenannt nach ${backup}`); }
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
    await fs.mkdir(STORE_DIR, { recursive: true });
    const tmp = `${STORE_PATH}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tmp, JSON.stringify(overrides, null, 2), 'utf-8');
    await fs.rename(tmp, STORE_PATH);
  };
  saveQueue = saveQueue.then(doSave, doSave);
  return saveQueue;
}

export const _internal = {
  STORE_PATH, STORE_DIR,
  reset() { defaults = { tmuxMouse: 'on', remoteApproval: true }; overrides = {}; },
};
