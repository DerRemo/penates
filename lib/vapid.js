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

  // Clock-Skew-Check gegen Apples Infrastruktur. `web.push.apple.com` liefert
  // bei HEAD kein Date-Header, daher `www.apple.com` als Proxy — läuft auf
  // derselben NTP-Basis. Fail-open: kein Netz → nur debuggen, kein Crash.
  try {
    const ctl = new AbortController();
    const timeout = setTimeout(() => ctl.abort(), 3000);
    const resp = await fetch('https://www.apple.com/', { method: 'HEAD', signal: ctl.signal });
    clearTimeout(timeout);
    const dateHdr = resp.headers.get('date');
    if (dateHdr) {
      const serverMs = Date.parse(dateHdr);
      const localMs  = Date.now();
      const deltaS   = Math.round((localMs - serverMs) / 1000);
      if (Math.abs(deltaS) > 30) {
        console.warn(`[vapid] ⚠ Clock-Skew ${deltaS}s (local vs apple). VAPID-JWTs können als BadJwtToken abgelehnt werden. NTP prüfen!`);
      } else {
        console.log(`[vapid] Clock-Skew OK (${deltaS}s vs apple).`);
      }
    } else {
      console.log(`[vapid] Clock-Skew-Check: kein date-Header (HTTP ${resp.status}) — übersprungen.`);
    }
  } catch (err) {
    console.log(`[vapid] Clock-Skew-Check übersprungen: ${err.message}`);
  }

  return { publicKey, privateKey, subject };
}
