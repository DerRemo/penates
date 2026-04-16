// Persistente Speicherung von Web-Push-Subscriptions.
//
// Schema pro Subscription:
//   {
//     endpoint, expirationTime, keys: { p256dh, auth },  // vom Browser
//     deviceId,                                           // Client-generierte UUID
//     createdAt,                                          // ms since epoch
//     failedAttempts,                                     // konsekutive Delivery-Errors
//     lastError: { at, statusCode, reason } | null,
//   }
//
// Gespeichert in ~/.claude-code-hub/push-subscriptions.json
// Atomare Writes via tmp-Datei + rename.
//
// Migration: Alt-Einträge ohne `deviceId` werden beim loadSubs() weggeprunt.
// Der Client re-registriert sich idempotent beim nächsten initPush().

import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const BROKEN_THRESHOLD = 5;

function storePath() {
  return join(homedir(), '.claude-code-hub', 'push-subscriptions.json');
}
function storeDir() {
  return join(homedir(), '.claude-code-hub');
}

let subs = [];  // Array<Subscription>

async function save() {
  const path = storePath();
  const tmp = `${path}.tmp-${Date.now()}`;
  const data = JSON.stringify({ subscriptions: subs }, null, 2);
  await fs.mkdir(storeDir(), { recursive: true });
  await fs.writeFile(tmp, data, 'utf-8');
  await fs.rename(tmp, path);
}

export async function loadSubs() {
  try {
    const raw = await fs.readFile(storePath(), 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.subscriptions)) {
      const before = parsed.subscriptions.length;
      subs = parsed.subscriptions.filter((s) => s && s.endpoint && s.deviceId);
      const pruned = before - subs.length;
      if (pruned > 0) {
        console.log(`[push-subs] ${pruned} alte Subscription(s) ohne deviceId gepruned`);
        await save();
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn('[push-subs] load failed, starting fresh:', err.message);
    }
    subs = [];
  }
}

// Subscription hinzufügen (oder vorhandene per endpoint ersetzen).
// deviceId ist Pflicht.
export async function saveSub(sub) {
  if (!sub || !sub.endpoint) throw new Error('Invalid subscription: missing endpoint');
  if (!sub.deviceId) throw new Error('Invalid subscription: missing deviceId');

  const record = {
    endpoint: sub.endpoint,
    expirationTime: sub.expirationTime ?? null,
    keys: sub.keys,
    deviceId: sub.deviceId,
    createdAt: Date.now(),
    failedAttempts: 0,
    lastError: null,
  };

  const idx = subs.findIndex((s) => s.endpoint === sub.endpoint);
  if (idx >= 0) {
    // Beim Re-Subscribe: createdAt/failedAttempts behalten, Rest überschreiben.
    record.createdAt = subs[idx].createdAt;
    record.failedAttempts = subs[idx].failedAttempts;
    record.lastError = subs[idx].lastError;
    subs[idx] = record;
  } else {
    subs.push(record);
  }
  await save();
}

export async function removeSub(endpoint) {
  const before = subs.length;
  subs = subs.filter((s) => s.endpoint !== endpoint);
  if (subs.length !== before) {
    await save();
    return true;
  }
  return false;
}

export async function incrementFailure(endpoint, { statusCode, reason } = {}) {
  const s = subs.find((x) => x.endpoint === endpoint);
  if (!s) return;
  s.failedAttempts = (s.failedAttempts || 0) + 1;
  s.lastError = { at: Date.now(), statusCode: statusCode ?? null, reason: reason ?? null };
  await save();
}

export async function resetFailure(endpoint) {
  const s = subs.find((x) => x.endpoint === endpoint);
  if (!s) return;
  if (s.failedAttempts === 0 && s.lastError === null) return;
  s.failedAttempts = 0;
  s.lastError = null;
  await save();
}

export function isBroken(sub) {
  return !!sub && (sub.failedAttempts || 0) >= BROKEN_THRESHOLD;
}

// Snapshot aller aktuellen Subscriptions (für Broadcast).
export function allSubs() {
  return [...subs];
}
