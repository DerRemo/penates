// Persistente Liste aller dem Hub bekannten tmux-Sessions.
//
// Zweck: Recovery nach Reboot/Kill ("dormant" Sessions neu anlegen können)
// und Adoption fremder tmux-Sessions. Einzige Source of Truth für den
// Restore-Pfad ist diese Datei — tmux kennt die cwd/command-Metadaten
// einer toten Session nicht mehr.
//
// Datenmodell: { knownSessions: [ { name, directory, command, createdAt, lastSeenAt } ] }
// Atomare Writes via temp-file + rename, damit ein Crash die Datei nicht
// halb überschrieben hinterlässt.

import { promises as fs } from 'fs';
import { join } from 'path';
import { penatesHome } from './penates-home.js';

// Lazy path accessor — resolved at call time so tests can redirect the state
// dir via process.env.PENATES_HOME (siehe lib/penates-home.js) before load()/save().
const storePath = () => join(penatesHome(), 'sessions.json');

let state = { knownSessions: [] };
let loaded = false;
let saveQueue = Promise.resolve();

export async function load() {
  try {
    const raw = await fs.readFile(storePath(), 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.knownSessions)) {
      state = { knownSessions: parsed.knownSessions };
    } else {
      state = { knownSessions: [] };
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      state = { knownSessions: [] };
    } else if (err instanceof SyntaxError) {
      // Korrupte Datei → umbenennen und frisch weitermachen.
      const backup = `${storePath()}.corrupt-${Date.now()}`;
      try {
        await fs.rename(storePath(), backup);
        console.warn(`[known-sessions] sessions.json korrupt, umbenannt nach ${backup}`);
      } catch (renameErr) {
        console.warn(`[known-sessions] sessions.json korrupt, Backup fehlgeschlagen: ${renameErr.message}`);
      }
      state = { knownSessions: [] };
    } else {
      throw err;
    }
  }
  loaded = true;
}

function save() {
  const doSave = async () => {
    await fs.mkdir(penatesHome(), { recursive: true });
    const p = storePath();
    const tmp = `${p}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf-8');
    await fs.rename(tmp, p);
  };
  saveQueue = saveQueue.then(doSave, doSave);
  return saveQueue;
}

function assertLoaded() {
  if (!loaded) throw new Error('known-sessions: call load() before use');
}

// Awaits every atomic write queued so far. shutdown() drains this before the
// process exits so a kill's manuallyStopped flag — or any pending mutation —
// can't be lost to a restart that races the async write. Without it, the
// tmux-continuum auto-restore would lose its kill-switch and revive a session
// the user explicitly killed.
export function flush() {
  return saveQueue;
}

export function list() {
  assertLoaded();
  return state.knownSessions.map(e => ({ ...e }));
}

export function find(name) {
  assertLoaded();
  return state.knownSessions.find(e => e.name === name) || null;
}

export async function add({ name, directory, command }) {
  assertLoaded();
  const now = new Date().toISOString();
  const existing = state.knownSessions.find(e => e.name === name);
  if (existing) {
    existing.directory = directory;
    existing.command = command;
    existing.lastSeenAt = now;
    delete existing.manuallyStopped; // (Neu-)Start/Restore/Adopt → wieder Auto-Restore-Kandidat
  } else {
    state.knownSessions.push({ name, directory, command, createdAt: now, lastSeenAt: now });
  }
  await save();
}

export async function remove(name) {
  assertLoaded();
  const before = state.knownSessions.length;
  state.knownSessions = state.knownSessions.filter(e => e.name !== name);
  const changed = state.knownSessions.length !== before;
  if (changed) await save();
  return changed;
}

// Boot-Cleanup: entfernt dormant Einträge, deren lastSeenAt älter als maxAgeMs ist.
// Live-Sessions und Einträge ohne parsebaren Timestamp bleiben IMMER erhalten
// (nie Daten löschen, über die wir nicht sicher urteilen können). Spiegelbild zum
// Recency-Gate in planAutoRestore. Gibt die Namen der entfernten Einträge zurück.
// Hinweis: manuallyStopped-Einträge werden NICHT verschont — ist ein bewusst
// gestoppter Eintrag >maxAgeMs alt, ist er ebenso eine Karteileiche und fliegt
// raus (anders als bei planAutoRestore, das manuallyStopped als eigenes Gate hat).
export async function pruneStale({ liveNames = [], now = Date.now(), maxAgeMs } = {}) {
  assertLoaded();
  const live = new Set(liveNames);
  const removed = [];
  state.knownSessions = state.knownSessions.filter(e => {
    if (live.has(e.name)) return true;
    const ts = Date.parse(e.lastSeenAt);
    if (Number.isFinite(ts) && now - ts > maxAgeMs) { removed.push(e.name); return false; }
    return true;
  });
  if (removed.length) await save();
  return removed;
}

export async function rename(oldName, newName) {
  assertLoaded();
  if (oldName === newName) return true;
  const entry = state.knownSessions.find(e => e.name === oldName);
  if (!entry) return false;
  if (state.knownSessions.some(e => e.name === newName)) return false;
  entry.name = newName;
  entry.lastSeenAt = new Date().toISOString();
  await save();
  return true;
}

export async function touchMany(names) {
  assertLoaded();
  if (!names.length) return;
  const now = new Date().toISOString();
  let changed = false;
  for (const name of names) {
    const entry = state.knownSessions.find(e => e.name === name);
    if (entry) {
      entry.lastSeenAt = now;
      changed = true;
    }
  }
  if (changed) await save();
}

// Per-Session Mute-Flag für Notifications. Default: unmuted (= laut).
// Fremd-Sessions ohne known-Eintrag gelten ebenfalls als unmuted —
// das ist eine absichtliche Asymmetrie, damit der Notification-Poller
// nicht jede adoptionswürdige Session automatisch in die Registry drückt.
export function isMuted(name) {
  assertLoaded();
  const entry = state.knownSessions.find(e => e.name === name);
  return !!(entry && entry.muted === true);
}

export async function setMuted(name, muted) {
  assertLoaded();
  const entry = state.knownSessions.find(e => e.name === name);
  if (!entry) return false;
  const next = !!muted;
  if ((entry.muted === true) === next) return true; // no-op
  if (next) entry.muted = true;
  else delete entry.muted; // kompakt halten: `false` nicht persistieren
  await save();
  return true;
}

// Per-Session Pin-Flag. Default: unpinned. Fremd-Sessions ohne known-
// Eintrag werden beim setPinned mit 404 abgelehnt, weil wir nichts zu
// persistieren haben und keine Auto-Adoption triggern wollen — dieselbe
// Asymmetrie wie bei muted.
export function isPinned(name) {
  assertLoaded();
  const entry = state.knownSessions.find(e => e.name === name);
  return !!(entry && entry.pinned === true);
}

export async function setPinned(name, pinned) {
  assertLoaded();
  const entry = state.knownSessions.find(e => e.name === name);
  if (!entry) return false;
  const next = !!pinned;
  if ((entry.pinned === true) === next) return true; // no-op
  if (next) entry.pinned = true;
  else delete entry.pinned; // kompakt halten
  await save();
  return true;
}

// Per-Session Auto-Restore-Opt-out. Ein bewusstes Kill (DELETE / Phase-5-Finish)
// setzt das Flag → die Session wird beim Boot-Auto-Restore übersprungen (bleibt
// aber dormant fürs manuelle Restore). add() löscht es wieder (Neustart / Restore
// / Adopt = wieder Auto-Restore-Kandidat). Default: nicht gestoppt; kompakt
// halten (false nicht persistieren) — selbe Asymmetrie wie muted/pinned.
export function isManuallyStopped(name) {
  assertLoaded();
  const entry = state.knownSessions.find(e => e.name === name);
  return !!(entry && entry.manuallyStopped === true);
}

export async function setManuallyStopped(name, stopped) {
  assertLoaded();
  const entry = state.knownSessions.find(e => e.name === name);
  if (!entry) return false;
  const next = !!stopped;
  if ((entry.manuallyStopped === true) === next) return true; // no-op
  if (next) entry.manuallyStopped = true;
  else delete entry.manuallyStopped; // kompakt halten
  await save();
  return true;
}

// Pfad-Accessor für Tests/Debug (lazy → folgt PENATES_HOME).
export const _internal = { storePath };
