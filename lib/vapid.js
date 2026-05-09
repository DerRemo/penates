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

// Guard gegen doppelte Auto-Gen: liest .env und prüft ob da schon was steht.
// Historisches Problem: wenn loadVapid() aus irgendeinem Grund während einer
// Server-Session lief ohne dass process.env vorher aus .env geladen war,
// hat die alte Logik einfach ein weiteres Keypaar angehängt. Ergebnis waren
// drei VAPID-Blöcke hintereinander mit dem ungültigen Default-Subject
// `mailto:admin@localhost` → APNs 403 BadJwtToken.
async function envFileHasVapidKey() {
  try {
    const content = await fs.readFile(ENV_PATH, 'utf-8');
    return /^\s*VAPID_PUBLIC_KEY\s*=\s*\S+/m.test(content);
  } catch {
    return false;
  }
}

export async function loadVapid() {
  let publicKey  = process.env.VAPID_PUBLIC_KEY  || '';
  let privateKey = process.env.VAPID_PRIVATE_KEY || '';
  let subject    = process.env.VAPID_SUBJECT      || '';

  // Inkonsistenter State: eines gesetzt, das andere nicht — darf nie.
  if ((publicKey && !privateKey) || (!publicKey && privateKey)) {
    throw new Error('[vapid] VAPID_PUBLIC_KEY und VAPID_PRIVATE_KEY müssen gemeinsam gesetzt oder beide leer sein. Check .env.');
  }

  if (!publicKey && !privateKey) {
    // Nur auto-generieren wenn in der .env-DATEI auch nichts steht.
    // Sonst hätten wir einen Loader-Bug und würden Duplikate anhängen.
    if (await envFileHasVapidKey()) {
      throw new Error('[vapid] .env enthält bereits VAPID_PUBLIC_KEY, aber process.env nicht. Loader-Bug vermutet — refuse to append duplicates. Check .env-Syntax.');
    }

    if (!subject) {
      throw new Error('[vapid] Kann keine Keys generieren ohne VAPID_SUBJECT. Setze eine valide https-URL (z.B. https://example.com) oder ein mailto mit echter Domain in .env.');
    }

    const keys = webpush.generateVAPIDKeys();
    publicKey  = keys.publicKey;
    privateKey = keys.privateKey;

    console.log('[vapid] Keine VAPID-Keys in .env — generiere neue...');
    await appendToEnv([
      '# Web Push VAPID-Keys (auto-generiert)',
      `VAPID_PUBLIC_KEY=${publicKey}`,
      `VAPID_PRIVATE_KEY=${privateKey}`,
    ]);
    process.env.VAPID_PUBLIC_KEY  = publicKey;
    process.env.VAPID_PRIVATE_KEY = privateKey;
    console.log('[vapid] Keys generiert und in .env geschrieben.');
  }

  // Subject-Sanity-Check: `mailto:admin@localhost` wird von APNs als BadJwtToken abgelehnt.
  if (!subject) {
    throw new Error('[vapid] VAPID_SUBJECT fehlt in .env. Setze eine valide https-URL oder ein mailto mit echter Domain.');
  }
  if (/^mailto:.*@localhost$/i.test(subject)) {
    throw new Error(`[vapid] VAPID_SUBJECT=${subject} wird von Apples APNs als BadJwtToken abgelehnt. Setze eine valide https-URL (z.B. deine öffentliche Domain) oder ein mailto mit echter Domain.`);
  }

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
