// Persistente Speicherung von Web-Push-Subscriptions.
//
// Jede Subscription = PushSubscriptionJSON vom Browser
// { endpoint, expirationTime, keys: { p256dh, auth } }
//
// Gespeichert in ~/.claude-code-hub/push-subscriptions.json
// Atomare Writes via tmp-Datei + rename.

import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const STORE_DIR  = join(homedir(), '.claude-code-hub');
const STORE_PATH = join(STORE_DIR, 'push-subscriptions.json');

let subs = [];  // Array<PushSubscriptionJSON>

async function save() {
  const tmp = `${STORE_PATH}.tmp-${Date.now()}`;
  const data = JSON.stringify({ subscriptions: subs }, null, 2);
  await fs.mkdir(STORE_DIR, { recursive: true });
  await fs.writeFile(tmp, data, 'utf-8');
  await fs.rename(tmp, STORE_PATH);
}

export async function loadSubs() {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.subscriptions)) {
      subs = parsed.subscriptions;
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn('[push-subs] load failed, starting fresh:', err.message);
    }
    subs = [];
  }
}

// Subscription hinzufügen (oder vorhandene per endpoint deduplizieren).
export async function saveSub(sub) {
  if (!sub || !sub.endpoint) throw new Error('Invalid subscription');
  const idx = subs.findIndex(s => s.endpoint === sub.endpoint);
  if (idx >= 0) {
    subs[idx] = sub;
  } else {
    subs.push(sub);
  }
  await save();
}

// Subscription per endpoint entfernen. Gibt true zurück wenn gefunden.
export async function removeSub(endpoint) {
  const before = subs.length;
  subs = subs.filter(s => s.endpoint !== endpoint);
  if (subs.length !== before) {
    await save();
    return true;
  }
  return false;
}

// Snapshot aller aktuellen Subscriptions (für Broadcast).
export function allSubs() {
  return [...subs];
}
