// lib/port-scan.js — lauschende TCP-Ports erkennen (Express-frei, unit-testbar).
// Quelle: `lsof -nP -iTCP -sTCP:LISTEN`. Argv-Array, kein Shell-Interp (Bestand-Muster).
// Fehlertolerant wie lib/moshi-hook.js: fehlendes/kaputtes lsof → [].
import { execFileSync } from 'child_process';
import { platform, resolveBin } from './platform.js';

// Reiner Parser über den lsof-Text. Extrahiert pro Zeile Port aus dem NAME-Feld
// (z.B. "127.0.0.1:5173" / "*:3000" / "[::1]:5173") + Prozessname (COMMAND, Spalte 1).
// Dedup über Port (lsof listet IPv4+IPv6 separat). Exclude Hub-Port + Ports < 1024.
export function parseLsof(raw, { excludePort } = {}) {
  const seen = new Set();
  const out = [];
  for (const line of String(raw || '').split('\n')) {
    if (!line || line.startsWith('COMMAND')) continue;
    const cols = line.trim().split(/\s+/);
    if (cols.length < 9) continue;
    const command = cols[0];
    const name = cols[cols.length - 1] === '(LISTEN)' ? cols[cols.length - 2] : cols[cols.length - 1];
    // Port = alles nach dem letzten ':' im NAME-Feld.
    const idx = name.lastIndexOf(':');
    if (idx < 0) continue;
    const port = parseInt(name.slice(idx + 1), 10);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) continue;
    if (excludePort != null && port === Number(excludePort)) continue;
    if (seen.has(port)) continue;
    seen.add(port);
    out.push({ port, process: command });
  }
  return out;
}

// Reiner Parser über `ss -ltnH` (iproute2) — Linux-Fallback, wenn lsof fehlt.
// Spalten: State Recv-Q Send-Q Local-Address:Port Peer-Address:Port. Ohne -p
// (= privilegiert) gibt es keinen Prozessnamen → process: '' (nur informativ in der UI).
export function parseSs(raw, { excludePort } = {}) {
  const seen = new Set();
  const out = [];
  for (const line of String(raw || '').split('\n')) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 4) continue;
    const local = cols[3];
    const idx = local.lastIndexOf(':');
    if (idx < 0) continue;
    const port = parseInt(local.slice(idx + 1), 10);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) continue;
    if (excludePort != null && port === Number(excludePort)) continue;
    if (seen.has(port)) continue;
    seen.add(port);
    out.push({ port, process: '' });
  }
  return out;
}

// lsof-Kandidaten: PATH-Lookup zuerst, dann OS-spezifische Absolutpfade.
// macOS behält /usr/sbin/lsof (fehlt im minimalen LaunchAgent-PATH).
function lsofCandidates() {
  const onPath = resolveBin('lsof');
  const abs = platform() === 'macos'
    ? ['/usr/sbin/lsof', '/usr/bin/lsof', '/opt/homebrew/bin/lsof']
    : ['/usr/bin/lsof', '/usr/sbin/lsof', '/bin/lsof'];
  return [onPath, ...abs].filter(Boolean);
}

export function listListeningPorts({ excludePort } = {}) {
  for (const bin of lsofCandidates()) {
    try {
      const raw = execFileSync(bin, ['-nP', '-iTCP', '-sTCP:LISTEN'], {
        encoding: 'utf8', timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'],
      });
      return parseLsof(raw, { excludePort });
    } catch {
      // dieser Kandidat fehlt / Fehler → nächsten probieren
    }
  }
  // Linux-Fallback: ss (iproute2). lsof fehlt auf minimalen Server-Images oft.
  if (platform() === 'linux') {
    const ss = resolveBin('ss') || '/usr/sbin/ss'; // iproute2-Default-Ort
    try {
      const raw = execFileSync(ss, ['-ltnH'], {
        encoding: 'utf8', timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'],
      });
      return parseSs(raw, { excludePort });
    } catch {
      // ss fehlt auch → leere Liste
    }
  }
  return []; // kein Tool gefunden → leere Liste, manuelle Port-Eingabe bleibt nutzbar
}
