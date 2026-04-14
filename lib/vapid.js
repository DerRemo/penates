// VAPID-Key-Management für Web Push.
//
// Liest VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT aus .env.
// Falls nicht vorhanden: generiert einmalig neue Keys und hängt sie an .env an.
// Die generierten Keys sind Application-Server-Keys nach RFC 8292.
//
// Importier dieses Modul einmalig in server.js; es gibt `{ publicKey,
// privateKey, subject }` zurück. web-push.setVapidDetails() braucht alle drei.

import webpush from 'web-push';
import { promises as fs } from 'fs';
import { join } from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = join(__dirname, '..', '.env');

async function appendToEnv(lines) {
  const block = '\n' + lines.join('\n') + '\n';
  await fs.appendFile(ENV_PATH, block, 'utf-8');
}

export async function loadVapid() {
  let publicKey  = process.env.VAPID_PUBLIC_KEY  || '';
  let privateKey = process.env.VAPID_PRIVATE_KEY || '';
  let subject    = process.env.VAPID_SUBJECT      || '';

  if (!publicKey || !privateKey) {
    const keys = webpush.generateVAPIDKeys();
    publicKey  = keys.publicKey;
    privateKey = keys.privateKey;
    if (!subject) subject = 'mailto:admin@localhost';

    console.log('[vapid] Keine VAPID-Keys in .env — generiere neue...');
    await appendToEnv([
      '# Web Push VAPID-Keys (auto-generiert)',
      `VAPID_PUBLIC_KEY=${publicKey}`,
      `VAPID_PRIVATE_KEY=${privateKey}`,
      `VAPID_SUBJECT=${subject}`,
    ]);
    // Für den laufenden Prozess setzen, ohne Server-Neustart zu brauchen.
    process.env.VAPID_PUBLIC_KEY  = publicKey;
    process.env.VAPID_PRIVATE_KEY = privateKey;
    process.env.VAPID_SUBJECT     = subject;
    console.log('[vapid] Keys generiert und in .env geschrieben.');
  }

  if (!subject) subject = 'mailto:admin@localhost';
  webpush.setVapidDetails(subject, publicKey, privateKey);

  return { publicKey, privateKey, subject };
}
