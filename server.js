// dotenv MUSS als Side-Effect-Import ganz oben stehen. ES-Module-Hoisting
// führt alle `import`-Statements aus bevor Top-Level-Statements laufen —
// wenn wir dotenv.config() erst nach den Imports riefen, hätten Module
// wie lib/cf-access.js, die Env-Variablen beim Load lesen, nur leere
// Werte gesehen.
import 'dotenv/config';
import express from 'express';
import expressWs from 'express-ws';
import { spawn } from 'node-pty';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join, resolve, sep } from 'path';
import { readdirSync, readFileSync } from 'fs';
import { createChecker } from './lib/update-check.js';
import { homedir } from 'os';
import { getCurrentContext, getDailyUsageV2 } from './lib/usage.js';
import * as usageLimits from './lib/usage-limits.js';
import * as moshiHook from './lib/moshi-hook.js';
import { getAntigravityUsage } from './lib/antigravity-usage.js';
import * as knownSessions from './lib/known-sessions.js';
import * as board from './lib/board.js';
import { slugifySessionName, buildBrainstormPriming, resolveBrainstormSpawn, ideaGenSessionName, buildIdeaGenPriming, looksLikeTrustPrompt, implementSessionName, buildImplementPriming, promptedSpawnCommand } from './lib/brainstorm-spawn.js';
import * as settings from './lib/settings.js';
import * as serverControl from './lib/server-control.js';
import * as cfAccess from './lib/cf-access.js';
import * as auditLog from './lib/audit-log.js';
import { createRateLimiter } from './lib/rate-limit.js';
import { discoverProjects, listProjects, getProject, patchProject, createProject, releaseProject, searchItems, loadRegistry, setProjectPinned, removeProject, getProjectsSync } from './lib/projects.js';
import {
  listDir as filesListDir,
  readFile as filesReadFile,
  mkdir as filesMkdir,
  createEmptyFile as filesCreateEmptyFile,
  renameOrMove as filesRenameOrMove,
  copy as filesCopy,
  deleteToTrash as filesDeleteToTrash,
  writeStream as filesWriteStream,
  streamFileToResponse as filesStreamToResponse,
  FileError,
} from './lib/files.js';
import Busboy from 'busboy';
import * as projectWatcher from './lib/project-watcher.js';
import {
  subscribeProject as fwSubscribe,
  unsubscribeProject as fwUnsubscribe,
  noteSelfWrite as fwNoteSelfWrite,
  closeAll as fwCloseAll,
} from './lib/file-watcher.js';
import * as attention from './lib/attention.js';
import * as attachTracker from './lib/attach-tracker.js';
import * as approvals from './lib/approvals.js';
import { loadVapid } from './lib/vapid.js';
import * as pushSubs from './lib/push-subscriptions.js';
import webpush from 'web-push';
import { browseMkdir, BrowseMkdirError } from './lib/browse-mkdir.js';
import { parseStatusV2, getDiff, gitStatusMap, getRecentCommits, detectBaseBranch, getBranchDiff } from './lib/git-diff.js';
import { getLog, getBranches, showCommit } from './lib/git-history.js';
import { captureScrollback } from './lib/scrollback.js';
import { saveSessionImage } from './lib/session-images.js';
import { isPreviewHost, proxyHttp, attachUpgrade } from './lib/preview-proxy.js';
import * as voice from './lib/voice.js';
import { listListeningPorts } from './lib/port-scan.js';
import { computePace, windowMinutes } from './lib/pace.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pkgJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const updateChecker = createChecker({ current: pkgJson.version });

const PORT = process.env.PORT || 3333;
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
// Browser-Preview: Reverse-Proxy für EINEN lokalen Dev-Server über den festen
// Host preview.<PREVIEW_DOMAIN> (z.B. preview.code.derremo.xyz). Single-Host-
// Modell → eine Ebene flach, vom Universal-SSL-Wildcard *.<domain> gedeckt
// (kein ACM, kein Catch-all). PREVIEW_DOMAIN unset → Feature komplett aus.
const PREVIEW_DOMAIN = process.env.PREVIEW_DOMAIN || '';
const PREVIEW_ENABLED = !!PREVIEW_DOMAIN;
const PREVIEW_HOST = PREVIEW_ENABLED ? 'preview.' + PREVIEW_DOMAIN : '';
// Aktuell gewählter Dev-Server-Port hinter dem fixen Preview-Host (eine Preview
// zur Zeit). Wird über POST /api/preview/select gesetzt.
let activePreviewPort = null;
// SSRF-Guard: nur Ports proxen, die der Detektor aktuell als lauschend meldet.
function isPreviewPortListening(port) {
  return listListeningPorts({ excludePort: PORT }).some((p) => p.port === port);
}
// Liefert den aktiven Port nur, wenn gesetzt UND noch lauschend — sonst null.
function previewPortReady() {
  return activePreviewPort != null && isPreviewPortListening(activePreviewPort) ? activePreviewPort : null;
}
const SESSION_PREFIX = process.env.SESSION_PREFIX || 'cc-';
const TMUX = process.env.TMUX_PATH || (() => {
  // Auto-detect tmux in PATH instead of hardcoding Homebrew Apple Silicon path.
  // Covers Intel Macs (/usr/local/bin), Linux, nix, MacPorts, etc.
  try {
    return execFileSync('/usr/bin/which', ['tmux'], { encoding: 'utf8' }).trim();
  } catch {
    return '/opt/homebrew/bin/tmux'; // last-resort fallback
  }
})();

// LaunchAgent startet uns mit minimalem PATH (/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin).
// `claude` liegt in ~/.local/bin und wäre sonst für tmux-Child-Prozesse unauffindbar →
// neu erstellte Sessions würden sofort mit Exit 127 sterben.
const EXTRA_PATHS = [join(homedir(), '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin'];
process.env.PATH = [...new Set([...EXTRA_PATHS, ...(process.env.PATH || '').split(':')])].filter(Boolean).join(':');

// Mouse-Mode in tmux steuern. Default `on`, sodass Wheel-Events im xterm.js-
// Client als Scroll-Back funktionieren. Ohne das sieht der attached Client keine
// Scroll-Events und die Terminal-View scheint eingefroren, sobald Output länger
// als die Pane-Höhe wird. Per `.env TMUX_MOUSE=off` abschaltbar — nützlich, wenn
// primär über Moshi (mobiles Terminal) gearbeitet wird, wo der server-globale
// Mouse-Mode native Touch-Selektion stört. tmux Mouse ist nicht per-Client
// scopebar. Race-Condition: Server startet evtl. bevor tmux läuft → Aufruf
// scheitert still. Deshalb auch nach jeder Session-Erstellung gerufen.
const TMUX_MOUSE_DEFAULT = (process.env.TMUX_MOUSE || 'on').toLowerCase() === 'off' ? 'off' : 'on';
let tmuxMouseMode = TMUX_MOUSE_DEFAULT;   // overridden by settings.load() at boot
function ensureMouseMode() {
  try {
    execFileSync(TMUX, ['set-option', '-g', 'mouse', tmuxMouseMode], {
      encoding: 'utf-8', timeout: 2000, stdio: 'pipe',
    });
  } catch { /* tmux-Server noch nicht da */ }
}
ensureMouseMode();

// Globales OSC-52-Clipboard-Forwarding: `set-clipboard on` weist tmux an, OSC 52
// von inneren Apps (vim, copy-mode-yank) an den äußeren xterm-Client durchzureichen.
// Tmux tut das nur, wenn es den äußeren Client für clipboard-fähig hält — was über
// die Ms-Capability von TERM=xterm-256color (server.js, pty-Env) gegeben ist.
// Wie ensureMouseMode race-tolerant: scheitert still, wenn der tmux-Server noch
// nicht läuft, und wird nach Session-Erstellung erneut gerufen. `-g` = global, idempotent.
function ensureClipboardMode() {
  try {
    execFileSync(TMUX, ['set-option', '-g', 'set-clipboard', 'on'], {
      encoding: 'utf-8', timeout: 2000, stdio: 'pipe',
    });
  } catch { /* tmux-Server noch nicht da */ }
}
ensureClipboardMode();

const app = express();
expressWs(app, null, {
  // C3: Token-Auth für WebSocket per Sec-WebSocket-Protocol. Client sendet
  // ['bearer.<token>']; wir echo'n den Protokoll-String zurück, ansonsten
  // schließen manche Browser die Verbindung. Das eigentliche Matching passiert
  // unten im Route-Handler.
  wsOptions: {
    handleProtocols: (protocols /* Set<string> in ws v8 */) => {
      for (const p of protocols) {
        if (typeof p === 'string' && p.startsWith('bearer.')) return p;
      }
      return false;
    },
  },
});

// ── Browser-Preview Host-Dispatch (VOR Auth/Static/Catch-all/JSON) ───────────
// Greift NUR beim fixen Host preview.<PREVIEW_DOMAIN>. Normale Hub-Hosts fallen
// durch (next()) und laufen die bestehende Kette. CF Access hat am Tunnel-Edge
// bereits authentifiziert; der Hub-Bearer-Token ist hier irrelevant. Der Zielport
// kommt aus activePreviewPort (per POST /api/preview/select gesetzt).
app.use((req, res, next) => {
  if (!PREVIEW_ENABLED) return next();
  if (!isPreviewHost(req.headers.host, PREVIEW_HOST)) return next();   // → normaler Hub-Pfad
  const port = previewPortReady();
  if (port == null) {
    res.status(503).set('Content-Type', 'text/html; charset=utf-8');
    return res.end(`<!doctype html><meta charset=utf-8><body style="font:16px system-ui;padding:2rem;background:#0f1115;color:#e5e7eb">Keine Preview aktiv — wähle im Hub einen Port (läuft dein Dev-Server?).</body>`);
  }
  return proxyHttp(req, res, port);                      // kein next() — Proxy übernimmt
});

// express.json() für alles außer /api/hooks — Claude liefert dort
// gelegentlich syntaktisch kaputtes JSON und der Parser würde mit 400
// abbrechen, bevor unser Handler läuft. Hook-Route hat ihren eigenen
// Raw-Body-Parser mit try/catch.
const jsonParser = express.json();
app.use((req, res, next) => {
  if (req.path.startsWith('/api/hooks/')) return next();
  return jsonParser(req, res, next);
});

// Security-Header. CSP ist bewusst mit `'unsafe-inline'` für script/style,
// weil das Frontend eine Single-File-SPA mit inline-JS/CSS ist — Hashes
// oder Nonces wären aufwendig zu pflegen ohne Build-Step. Externe Ressourcen
// sind strikt auf die bekannten CDNs begrenzt, damit XSS-Folgeschäden
// (externe Script-Injection, Daten-Exfil) gedeckelt sind. `connect-src`
// erlaubt ws/wss zum eigenen Host für den Terminal-WebSocket.
// START_TIME dient doppelt: Uptime-Rechnung in /healthz und Client-Reload-
// Detektion via X-CCH-Boot-Header (siehe Security-Middleware).
const START_TIME = Date.now();

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' ws: wss: https:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  PREVIEW_ENABLED ? `frame-src blob: https://${PREVIEW_HOST}` : "frame-src blob:",
  "frame-ancestors 'none'",
].join('; ');
app.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  // Server-Boot-Zeit als Header auf jeder Response — der Client vergleicht
  // bei jedem Poll gegen den zuletzt gesehenen Wert und reloaded sich
  // selbst wenn er einen neuen Server-Start erkennt. Billiger als ein
  // eigener Handshake und natural-resilient gegen Netzwerk-Aussetzer.
  res.setHeader('X-CCH-Boot', String(START_TIME));
  next();
});

// Healthcheck für Cloudflare-Tunnel-Monitoring und zukünftige Uptime-Checks.
// Bewusst außerhalb von `/api` und vor dem auth-middleware registriert, damit
// er ohne Token erreichbar ist. Liefert aktuellen Zustand als JSON plus
// Basis-Metriken, die als Startpunkt für das spätere Metrics-Feature dienen.
app.get('/healthz', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    status: 'ok',
    uptimeSeconds: Math.floor((Date.now() - START_TIME) / 1000),
    sessions: getTmuxSessions().length,
    activePtys: activePtys.size,
    version: pkgJson.version || null,
  });
});

// Request-Logger: nur HTTP, keine WS (die kommen über upgrade und matchen
// diesen Middleware nicht). Pfad ohne Query, damit der ?token= Fallback
// nicht in den Logs landet. /healthz wird übersprungen, damit Monitoring-
// Polls die Logs nicht fluten.
app.use((req, _res, next) => {
  const path = req.url.split('?')[0];
  if (path !== '/healthz') {
    console.log(`${new Date().toISOString()} ${req.method} ${path}`);
  }
  next();
});

// Service Worker: dedizierte Route damit der `Service-Worker-Allowed`-Header
// gesetzt wird. Ohne diesen Header darf der SW nur den Sub-Pfad von seiner
// URL kontrollieren (/sw.js wäre leer) — mit '/' kontrolliert er den ganzen Hub.
app.get('/sw.js', (_req, res) => {
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(join(__dirname, 'public', 'sw.js'));
});

app.use(express.static(join(__dirname, 'public')));

// ── Secure middleware ────────────────────────────────────────────────────────
// Kombiniert zwei Auth-Layer:
//   1. Cloudflare Access JWT (nur bei Tunnel-Requests, erkannt an Cf-Ray-Header)
//      Wenn cfAccess.isEnabled() false ist (CF_ACCESS_* unset), wird
//      der JWT-Check übersprungen — Dev-Mode.
//   2. Bearer-Token aus Header/Query/WS-Subprotocol (immer, unabhängig von JWT).
//
// Beide Fehlermodi schreiben auth.fail-Events ins audit-log. Erster JWT
// einer neuen Access-Session schreibt auth.login einmalig.
// req.cchContext bekommt {user, ip, cfRay, userAgent} für Downstream.
//
// Akzeptiert drei Bearer-Token-Quellen:
//   1. `Authorization: Bearer <token>` (Standard-REST)
//   2. `?token=<token>` Query-Param (Fallback, vor allem Legacy)
//   3. `Sec-WebSocket-Protocol: bearer.<token>` (WebSocket-Upgrade — Browser
//      erlauben bei `new WebSocket(url, protocols)` keinen Authorization-
//      Header, also müssen wir den Token als Subprotocol übergeben)
function extractToken(req) {
  const header = req.headers['authorization']?.replace(/^Bearer\s+/i, '');
  if (header) return header;
  if (req.query.token) return req.query.token;
  const proto = req.headers['sec-websocket-protocol'];
  if (proto) {
    const sub = proto.split(',').map(s => s.trim()).find(p => p.startsWith('bearer.'));
    if (sub) return sub.slice(7);
  }
  return null;
}

async function secureMiddleware(req, res, next) {
  // Meta früh extrahieren — req.cchContext existiert noch nicht, also
  // ziehen wir die Rohwerte. Wird nach erfolgreicher Auth durch context
  // mit user angereichert.
  const rawMeta = {
    user: null,
    ip: req.headers['cf-connecting-ip'] || req.ip || null,
    cfRay: req.headers['cf-ray'] || null,
    userAgent: req.headers['user-agent'] || null,
  };
  const fromTunnel = !!rawMeta.cfRay;

  // 1. JWT-Check (nur bei Tunnel-Traffic UND wenn cfAccess enabled)
  let jwtUser = null;
  if (fromTunnel && cfAccess.isEnabled()) {
    try {
      const claim = await cfAccess.verifyJwtFromRequest(req);
      jwtUser = claim.email;
      // Fire-and-forget ist OK für Login: wenn der Prozess crashed direkt
      // nach JWT-verify aber vor dem appendFile, verlieren wir einen
      // Event — der nächste JWT-Request aus derselben Access-Session
      // feuert es erneut wenn der lastSeenIat-Map-Zustand weg ist.
      if (cfAccess.isNewLoginIat(claim.email, claim.iat)) {
        auditLog.record('auth.login', { ...rawMeta, user: claim.email });
      }
    } catch (e) {
      const code = e.code || 'unknown';
      // Security-Event: awaited damit bei Crash garantiert persistiert.
      await auditLog.record('auth.fail', { ...rawMeta, reason: `bad-jwt:${code}` });
      return res.status(401).json({ error: 'Unauthorized (JWT)' });
    }
  }

  // 2. Bearer-Check (immer, unabhängig von JWT)
  if (AUTH_TOKEN) {
    const token = extractToken(req);
    if (token !== AUTH_TOKEN) {
      // Service-Worker OTP-Pfad: POST /api/approvals/<id>?token=<otp> darf
      // ohne Bearer-Token durch — der Handler prüft das OTP selbst gegen
      // das pending-Approval-Objekt. Enge Pfad-Regex, kein Blast-Radius.
      if (req.method === 'POST' &&
          /^\/approvals\/[0-9a-f-]{36}$/.test(req.path) &&
          req.query.token) {
        req.cchContext = { ...rawMeta, user: jwtUser };
        return next();
      }
      await auditLog.record('auth.fail', {
        ...rawMeta,
        user: jwtUser,
        reason: token ? 'bad-bearer' : 'no-token',
      });
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  // Auth OK → Kontext setzen für Downstream-Handler
  req.cchContext = { ...rawMeta, user: jwtUser };
  next();
}
// VAPID-Public-Key ist öffentlich — kein Auth. Browser brauchen ihn vor dem
// pushManager.subscribe() Call, also vor jeglicher Token-Interaktion.
app.get('/api/push/vapid-public-key', (_req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY || '';
  if (!key) return res.status(503).json({ error: 'VAPID not configured' });
  res.json({ publicKey: key });
});

app.use('/api', secureMiddleware);

// Update-Check: zeigt aktuelle + neueste Version.
app.get('/api/version', (_req, res) => {
  res.json(updateChecker.getState());
});

// ── Rate-Limiting ────────────────────────────────────────────────────────────
// Zwei Buckets via createRateLimiter: Read (GET/HEAD) und Write (sonst).
// Hooks sind exempt weil Claude-Code bei heißen Sessions viele
// UserPromptSubmit-Events pro Minute feuern kann und legitime Events
// sonst gedroppt würden. /healthz liegt außerhalb von /api/* und ist
// schon dadurch ausgenommen.
//
// onExceeded-Callback feuert rate-limit.exceeded ins audit-log.
const rlOnExceeded = (req, info) => {
  auditLog.record('rate-limit.exceeded', {
    ...auditLog.extractRequestMeta(req),
    bucket: info.bucket,
    max: info.max,
    windowMs: info.windowMs,
  });
};
const readLimiter  = createRateLimiter({ bucket: 'read',  max: 300, windowMs: 60_000, onExceeded: rlOnExceeded });
const writeLimiter = createRateLimiter({ bucket: 'write', max:  60, windowMs: 60_000, onExceeded: rlOnExceeded });

app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/hooks/')) return next();
  if (req.method === 'GET' || req.method === 'HEAD') return readLimiter(req, res, next);
  return writeLimiter(req, res, next);
});

// Browser-Preview: Config (Feature an? + fixer Host + aktiver Port) + Port-Liste
// + Port-Auswahl. Hub-Domain-Calls — durch secureMiddleware (Auth) + Limiter gedeckt.
app.get('/api/preview/config', (_req, res) => {
  res.json({ enabled: PREVIEW_ENABLED, host: PREVIEW_ENABLED ? PREVIEW_HOST : null, activePort: activePreviewPort });
});
app.get('/api/preview/ports', (_req, res) => {
  res.json({ ports: listListeningPorts({ excludePort: PORT }) });
});
// Setzt den Port, auf den der fixe Preview-Host proxied. { port: <n> } oder
// { port: null } zum Leeren. SSRF-Guard: Port muss aktuell lauschen.
app.post('/api/preview/select', (req, res) => {
  if (!PREVIEW_ENABLED) return res.status(409).json({ error: 'preview disabled' });
  const raw = req.body && req.body.port;
  if (raw === null || raw === undefined || raw === '') {
    activePreviewPort = null;
    return res.json({ ok: true, port: null });
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    return res.status(400).json({ error: 'invalid port' });
  }
  if (!isPreviewPortListening(port)) {
    return res.status(409).json({ error: 'port not listening', port });
  }
  activePreviewPort = port;
  res.json({ ok: true, port });
});

// ── Validation ───────────────────────────────────────────────────────────────
// Erlaubte Zeichen im Session-Namen: Buchstaben, Zahlen, _, -, ., Leerzeichen.
// Explizit verboten: Quotes, Backslash, Shell-Metachars, Control-Chars.
const SESSION_NAME_RE = /^[\w\-. ]{1,64}$/;
const validSessionName = (n) => typeof n === 'string' && SESSION_NAME_RE.test(n);

// Browse auf den Home-Ordner eingrenzen — verhindert `?path=/etc/passwd`.
const HOME = homedir();

// Allow-List für /api/browse und POST /api/projects. Default: nur $HOME.
// Override via BROWSE_ROOTS-Env als `:`-getrennte Liste absoluter Pfade,
// `~` wird zu $HOME expandiert. Beispiel:
//   BROWSE_ROOTS=~/Projects:/Volumes/SSD/code
// Pfade werden beim Start einmal resolved — kein Hot-Reload. Leere oder
// nicht-existente Pfade im Env werden wortlos übersprungen, damit ein
// vertipptes Segment nicht die ganze Allow-List kippt.
const BROWSE_ROOTS = (() => {
  const raw = (process.env.BROWSE_ROOTS || '').trim();
  if (!raw) return [HOME];
  const roots = raw
    .split(':')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => (s === '~' || s.startsWith('~/')) ? join(HOME, s.slice(1)) : s)
    .map(s => resolve(s));
  return roots.length ? roots : [HOME];
})();
function isUnderAllowedRoot(p) {
  const r = resolve(p);
  return BROWSE_ROOTS.some(root => r === root || r.startsWith(root + sep));
}

// ── Helper: tmux list-sessions ───────────────────────────────────────────────
function getTmuxSessions() {
  try {
    const output = execFileSync(TMUX, [
      'list-sessions',
      '-F', '#{session_name}|#{session_created}|#{session_windows}|#{session_attached}|#{pane_current_path}',
    ], { encoding: 'utf-8', timeout: 5000 }).trim();
    if (!output) return [];
    return output.split('\n').map(line => {
      const [name, created, windows, attached, path] = line.split('|');
      return {
        name,
        created: parseInt(created) * 1000,
        windows: parseInt(windows),
        attached: parseInt(attached) > 0,
        path: path || '~',
      };
    });
  } catch {
    return [];
  }
}

// ── Helper: git-status pro Session-cwd mit TTL-Cache ─────────────────────────
// Gleiches Cache-TTL wie pane-preview (2s) — jeder Dashboard-Poll löst
// sonst einen execFile pro Session aus. Wenn der cwd kein git-Repo ist
// oder git fehlt, liefern wir null und die Card zeigt keinen Widget.
const gitStatusCache = new Map();
const GIT_STATUS_TTL_MS = 2000;

function getGitStatus(cwd) {
  if (!cwd) return null;
  const cached = gitStatusCache.get(cwd);
  if (cached && Date.now() - cached.ts < GIT_STATUS_TTL_MS) return cached.value;
  let value = null;
  try {
    const out = execFileSync('git', ['-C', cwd, 'status', '--porcelain=v2', '--branch', '-z'], {
      encoding: 'utf-8',
      timeout: 1500,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    value = parseGitStatus(out);
  } catch {
    value = null;
  }
  gitStatusCache.set(cwd, { value, ts: Date.now() });
  return value;
}

function parseGitStatus(raw) {
  // Thin adapter über parseStatusV2 aus lib/git-diff.js — kein doppelter Parser.
  const s = parseStatusV2(raw);
  if (!s) return null;
  return { branch: s.branch, dirty: s.files.length > 0, ahead: s.ahead, behind: s.behind };
}

// cwd einer Session auflösen: live via tmux pane_current_path, sonst
// known-sessions directory. null wenn nicht auflösbar.
function resolveSessionCwd(name) {
  try {
    const cwd = execFileSync(TMUX, ['display-message', '-p', '-t', name, '#{pane_current_path}'], {
      encoding: 'utf8', timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (cwd) return cwd;
  } catch {}
  const entry = knownSessions.list().find(e => e.name === name);
  return entry ? entry.directory : null;
}

// File-Quelle für die /api/projects/:id/files*-Routen: ein registriertes
// Projekt ODER eine Session (Pseudo-id `session:<name>`, cwd live aufgelöst).
// Dadurch funktioniert der Files-Picker für JEDE Session, nicht nur für
// solche mit angelegtem Projekt. Liefert { id, path } oder null.
async function resolveFileSource(id) {
  if (typeof id === 'string' && id.startsWith('session:')) {
    const name = id.slice('session:'.length);
    const cwd = resolveSessionCwd(name);
    return cwd ? { id, path: cwd } : null;
  }
  return getProject(id);
}

// ── Hub-Env für Claude-Hooks ─────────────────────────────────────────────────
// Injiziert beim tmux new-session Variablen, damit der Claude-Hook (in
// ~/.claude/settings.json) per curl an /api/hooks/:event POSTen kann.
// Fehlende Werte werden weggelassen — der Hook-curl fällt dann auf `|| true`.
// CC_HUB_SESSION wird im Claude-Child-Prozess beim tmux new-session gesetzt
// und bleibt auch nach einem späteren tmux rename-session auf dem Original-
// namen. Diese Map mappt die vom Hook gemeldete Env-ID auf den aktuell in
// tmux sichtbaren Namen — sonst würden Hook-Events ins Leere laufen.
const hookAlias = new Map();
function resolveHookSession(envName) {
  return hookAlias.get(envName) || envName;
}
function aliasOnRename(oldName, newName) {
  // Alle bestehenden Aliase, die auf oldName zeigten, nachziehen.
  for (const [k, v] of hookAlias.entries()) {
    if (v === oldName) hookAlias.set(k, newName);
  }
  // oldName selbst → newName.
  if (oldName !== newName) hookAlias.set(oldName, newName);
}

function hubEnvArgs(sessionName) {
  const args = [
    '-e', `CC_HUB_SESSION=${sessionName}`,
    '-e', `CC_HUB_URL=http://127.0.0.1:${PORT}`,
  ];
  if (AUTH_TOKEN) args.push('-e', `CC_HUB_TOKEN=${AUTH_TOKEN}`);
  return args;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Trust-Gate-Watchdog für Prompt-Spawns: Poll-Intervall + Fensterbreite. Der
// Prompt selbst kommt als argv-Argument an die CLI (kein Tippen mehr) — der
// Watchdog deckt nur noch claudes „Do you trust this folder?"-Gate ab, das in
// noch-nicht-vertrauten Verzeichnissen VOR der Prompt-Verarbeitung blockiert.
const TRUST_GATE_POLL_MS = Number(process.env.BRAINSTORM_TRUST_POLL_MS) || 1500;
const TRUST_GATE_ATTEMPTS = Number(process.env.BRAINSTORM_TRUST_ATTEMPTS) || 8;

// ── REST API ────────────────────────────────────────────────────────────────

// List sessions. Preview wird intern für Activity-Detection geholt, aber
// NICHT ans Frontend ausgeliefert — der 8-Zeilen-Preview-Block im UI ist
// entfernt. `?preview=0` behält seine Bedeutung (schaltet auch die
// Activity-Detection ab, weil dafür auch der capture-pane-Call entfällt).
app.get('/api/sessions', (req, res) => {
  const live = getTmuxSessions();
  const liveByName = new Map(live.map(s => [s.name, s]));
  const known = knownSessions.list();
  const knownByName = new Map(known.map(e => [e.name, e]));

  // 1) running + foreign aus tmux — foreign = läuft in tmux, aber weder
  //    mit cc-Prefix noch in known-sessions eingetragen.
  const running = [];
  const foreign = [];
  for (const s of live) {
    const isKnown = knownByName.has(s.name);
    const isCcPrefixed = s.name.startsWith(SESSION_PREFIX);
    if (isKnown || isCcPrefixed) {
      running.push({ ...s, status: 'running' });
    } else {
      foreign.push({ ...s, status: 'foreign' });
    }
  }

  // 2) dormant = in known-sessions, aber nicht in tmux live.
  //    Kein Preview/Activity — die Pane existiert nicht.
  const dormant = known
    .filter(e => !liveByName.has(e.name))
    .map(e => ({
      name: e.name,
      path: e.directory,
      command: e.command,
      created: e.createdAt ? Date.parse(e.createdAt) : null,
      lastSeenAt: e.lastSeenAt,
      windows: 0,
      attached: false,
      status: 'dormant',
    }));

  // Overview-Projekt-Badge: cwd → Projekt-Registry-Match (exakt oder
  // Unterverzeichnis). Registry einmal synchron lesen (nicht pro Session).
  const _projs = getProjectsSync();
  const projectOf = (cwd) => {
    if (!cwd) return null;
    const m = _projs.find(p => cwd === p.path || cwd.startsWith(p.path + '/'));
    return m ? { id: m.id, name: m.displayName } : null;
  };

  // Enrichment: Activity kommt ausschließlich aus dem Hook-State. Limits
  // und Costs kommen aus dem StatusLine-Hook. Sessions ohne frischen Hook
  // zeigen activity:`unknown` → Label "Aktiv" im Dashboard.
  const enrich = (s) => {
    const hookActivity = attention.getHookActivity(s.name);
    const sl = usageLimits.getSessionStatusline(s.name);
    const base = {
      ...s,
      activity: hookActivity || 'unknown',
      cost: sl ? {
        totalUsd: sl.costUsd,
        durationMs: sl.durationMs,
        linesAdded: sl.linesAdded,
        linesRemoved: sl.linesRemoved,
      } : null,
    };
    // attached-Flag bleibt in s.attached (UI-Anzeige), wird aber nicht mehr
    // zur Attention-Suppression verwendet — siehe Device-Presence in der Push-Schicht.
    // Context-Anzeige: Claudes eigener Statusline-Wert
    // (context_window.used_percentage) ist autoritativ und matcht exakt, was
    // unten in der Session steht. Den bevorzugen, solange er frisch ist; nur
    // wenn kein frischer Statusline-Wert vorliegt (z.B. dormant, alte Claude-
    // Version ohne context_window), auf die JSONL-Schätzung zurückfallen.
    if (sl && sl.contextPct != null) {
      base.contextPct = sl.contextPct;
      base.contextLimit = sl.contextSize ?? null;
      base.contextTokens = sl.contextSize != null
        ? Math.round(sl.contextSize * sl.contextPct / 100)
        : null;
      base.contextModel = sl.model ?? null;
    } else {
      try {
        const ctx = getCurrentContext(s.path);
        base.contextTokens = ctx.tokens;
        base.contextModel = ctx.model;
        base.contextLimit = ctx.limit;
        base.contextPct = ctx.pct;
      } catch {
        base.contextTokens = null;
        base.contextModel = null;
        base.contextLimit = null;
        base.contextPct = null;
      }
    }
    base.muted = knownSessions.isMuted(s.name);
    base.pinned = knownSessions.isPinned(s.name);
    base.git = getGitStatus(s.path);
    base.project = projectOf(s.path);
    // command für Running-Sessions aus known-sessions nachreichen (tmux
    // liefert es nicht). Dormant tragen es schon; foreign ggf. nicht → null.
    if (base.command == null) {
      const ke = knownByName.get(s.name);
      base.command = ke ? ke.command : null;
    }
    return base;
  };

  res.json([
    ...running.map(enrich),
    ...dormant.map(enrich),
    ...foreign.map(enrich),
  ]);
});

// Aggregierte Usage-Historie (Tages-Totals + Monatssumme). 60s-Cache, weil
// die JSONL-Dateien nur minütlich neue Einträge bekommen.
let usageCache = { ts: 0, data: null };
app.get('/api/usage/history', async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 90);
  const key = `days=${days}`;
  const now = Date.now();
  if (usageCache.data && usageCache.key === key && now - usageCache.ts < 60_000) {
    return res.json(usageCache.data);
  }
  try {
    const data = await getDailyUsageV2({ days });
    usageCache = { ts: now, key, data };
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Failed to compute usage', detail: e.message });
  }
});

// Account-weite Limit-History (moshi-hook usage). 30s-Cache.
let limitsCache = { ts: 0, data: null };
app.get('/api/usage/limits', async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 7, 1), 30);
  const now = Date.now();
  const key = `days=${days}`;
  if (limitsCache.data && limitsCache.key === key && now - limitsCache.ts < 30_000) {
    return res.json(limitsCache.data);
  }
  try {
    const usage = moshiHook.getUsage();
    if (usage) usageLimits.recordUsageSnapshot(usage);
    const data = await usageLimits.getLimitHistory({ days });
    // Antigravity läuft nicht über moshi-hook (kein Support) — separat aus den
    // CLI-Logs ableiten. Erscheint nur wenn aktuell quota-limitiert.
    const agy = getAntigravityUsage();
    if (agy) data.accounts = [...(data.accounts || []), agy];
    // Attach pace to every limit window before caching.
    for (const acc of (data.accounts || [])) {
      for (const w of (acc.windows || [])) {
        const mins = windowMinutes(w.label);
        const pace = (typeof w.usedPercentage === 'number' && w.resetsAt && mins)
          ? computePace({ usedPercent: w.usedPercentage, resetsAt: w.resetsAt, windowMinutes: mins })
          : null;
        // Floor: suppress pace too early in the window (expected < 3%).
        w.pace = (pace && pace.expectedPct >= 3) ? pace : null;
      }
    }
    limitsCache = { ts: now, key, data };
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Failed to read limit history', detail: e.message });
  }
});

// Aktuelle Kosten aller Sessions (aus StatusLine-State).
let costsCache = { ts: 0, data: null };
app.get('/api/usage/costs', (_req, res) => {
  const now = Date.now();
  if (costsCache.data && now - costsCache.ts < 10_000) {
    return res.json(costsCache.data);
  }
  const data = usageLimits.getAllSessionCosts();
  costsCache = { ts: now, data };
  res.json(data);
});

// Recency-rankte Arbeitsverzeichnisse aus moshi-hook cwd-list. 10s-Cache.
let recentDirsCache = { ts: 0, key: null, data: null };
app.get('/api/recent-dirs', (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 8, 1), 30);
  const now = Date.now();
  const key = `limit=${limit}`;
  if (recentDirsCache.data && recentDirsCache.key === key && now - recentDirsCache.ts < 10_000) {
    return res.json(recentDirsCache.data);
  }
  const dirs = moshiHook.getRecentDirs({ limit }) || [];
  const data = { dirs };
  recentDirsCache = { ts: now, key, data };
  res.json(data);
});

// ── Projekt-Verwaltung (Phase 1 Step 2b) ──────────────────────────────
// Quelle: ~/.claude-code-hub/projects.json + ROADMAP.md pro Projekt.
// Registry ist ein Long-Lived-Singleton in lib/projects.js. Writes gehen
// durch mutateRegistry (withFileLock + Clone+Swap), Mutationen an einzelnen
// ROADMAP.md-Dateien durch mutateRoadmap (withFileLock, fresh inside-lock).
//
// Discovery-on-read: GET /api/projects scannt bei Bedarf die konfigurierten
// Roots nach. Throttle via DISCOVERY_TTL_MS, damit Dashboard-Polling
// (alle 5s beim aktiven Tab) nicht jeden Mal die Disk anrasselt.
const DISCOVERY_TTL_MS = 30_000;
let lastDiscoveryAt = 0;
let discoveryInflight = null;
async function maybeRediscover() {
  if (Date.now() - lastDiscoveryAt < DISCOVERY_TTL_MS) return;
  if (discoveryInflight) return discoveryInflight; // dedupe
  discoveryInflight = discoverProjects(projectRoots)
    .then(async (r) => {
      lastDiscoveryAt = Date.now();
      if (r.added > 0) {
        console.log(`[projects] rediscovery: +${r.added}, total=${r.total}`);
        const reg = await loadRegistry();
        projectWatcher.syncWatchers(reg);
      }
      return r;
    })
    .catch(e => console.error('[projects] rediscovery failed:', e.message))
    .finally(() => { discoveryInflight = null; });
  return discoveryInflight;
}

app.get('/api/projects', async (_req, res) => {
  try {
    // Best-effort Re-Scan: Fehler blockieren den Read nicht.
    await maybeRediscover();
    const projects = await listProjects();
    res.json({ projects });
  } catch (e) {
    res.status(500).json({ error: 'Failed to list projects', detail: e.message });
  }
});

// Neues Projekt anlegen: schreibt ROADMAP.md mit Template und registriert.
// Body: { displayName: string, path: string }. Path-Allowlist: unter HOME.
app.post('/api/projects', async (req, res) => {
  const { displayName, path: projectPath } = req.body || {};
  if (typeof projectPath !== 'string' || !projectPath) {
    return res.status(400).json({ error: 'path required' });
  }
  // Pfad-Gate: Allow-List aus BROWSE_ROOTS (Default $HOME), konsistent
  // mit /api/browse. Hier bewusst kein `~`-Expand — Frontend liefert
  // absolute Pfade.
  const absPath = resolve(projectPath);
  if (!isUnderAllowedRoot(absPath)) {
    return res.status(403).json({ error: 'path outside allowed roots' });
  }
  try {
    const entry = await createProject({ displayName, path: absPath });
    // Watcher direkt anziehen, damit spätere Edits in diesem Projekt ohne
    // Verzögerung live synchronisiert werden.
    projectWatcher.syncWatchers(await loadRegistry());
    res.status(201).json(entry);
  } catch (e) {
    if (e.code === 'bad-body') {
      return res.status(400).json({ error: 'Bad request', detail: e.detail || e.message });
    }
    if (e.code === 'path-exists' || e.code === 'path-conflict') {
      return res.status(409).json({ error: e.detail || e.message });
    }
    console.error('[projects] create failed:', e);
    res.status(500).json({ error: 'Failed to create project', detail: e.message });
  }
});

// Volltext-Suche über Roadmap-Items aller Projekte. `q` ist case-insensitive,
// Frontend ruft debounced auf. Limit defaultet auf 50.
app.get('/api/projects/search', async (req, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const result = await searchItems(q, { limit });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Search failed', detail: e.message });
  }
});

app.get('/api/projects/:id', async (req, res) => {
  try {
    const project = await getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load project', detail: e.message });
  }
});

// Repo-Glance (Projekt-Hub): Status + letzte Commits. Beide read-only,
// fehlertolerant (null/[] bei Nicht-Repo). status via 2s-Cache (getGitStatus).
app.get('/api/projects/:id/git', async (req, res) => {
  try {
    const project = await resolveFileSource(req.params.id);
    if (!project) return res.status(404).json({ error: 'not-found' });
    res.json({
      status: getGitStatus(project.path),          // {branch,dirty,ahead,behind} | null
      commits: getRecentCommits(project.path, 5),  // [] bei Nicht-Repo/leerem Repo
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load git info', detail: e.message });
  }
});

// Release abschließen: Dev-Items → Released, Versions bumpen, Changelog-
// Eintrag erzeugen. Destruktiv (Dev wird geleert), Frontend confirmt.
app.post('/api/projects/:id/release', async (req, res) => {
  try {
    const fresh = await releaseProject(req.params.id, req.body || {});
    res.json(fresh);
  } catch (e) {
    const code = e.code;
    if (code === 'unknown-id' || code === 'missing-roadmap') {
      return res.status(404).json({ error: 'Project not found' });
    }
    if (code === 'bad-body') {
      return res.status(400).json({ error: 'Bad request', detail: e.detail || e.message });
    }
    if (code === 'section-missing') {
      return res.status(400).json({ error: 'ROADMAP.md structure incomplete', detail: e.detail || e.message });
    }
    if (code === 'section-order') {
      return res.status(400).json({ error: 'Unsupported section order', detail: 'Need Released → In Development → Changelog' });
    }
    console.error('[projects] release failed:', e);
    res.status(500).json({ error: 'Failed to finalize release', detail: e.message });
  }
});

app.patch('/api/projects/:id/items', async (req, res) => {
  try {
    const fresh = await patchProject(req.params.id, req.body || {});
    res.json(fresh);
  } catch (e) {
    const code = e.code;
    if (code === 'unknown-id' || code === 'missing-roadmap') {
      return res.status(404).json({ error: 'Project not found' });
    }
    if (code === 'stale') {
      return res.status(409).json({ error: 'Stale line offset', detail: 'Line does not contain a checkbox item anymore' });
    }
    if (code === 'section-not-found') {
      // 409 statt 400: die Section ist beim Write-Back verschwunden, während
      // der Client noch die alte Struktur anzeigte — das ist ein Konflikt-
      // Szenario wie `stale`, kein Bad-Request. Der Client triggert dann
      // einen Refresh statt nur einen Error-Toast.
      return res.status(409).json({ error: 'Section not found in ROADMAP.md' });
    }
    if (code === 'bad-action' || code === 'bad-body') {
      return res.status(400).json({ error: 'Bad request', detail: e.detail || e.message });
    }
    console.error('[projects] patch failed:', e);
    res.status(500).json({ error: 'Failed to patch project', detail: e.message });
  }
});

// ── Idea Pipeline: Board cards ──────────────────────────────────────────
// Mutationen sind durch den globalen writeLimiter (s.o.) abgedeckt.
app.get('/api/board/cards', (req, res) => {
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
  res.json({ cards: board.listCards({ projectId }) });
});

app.post('/api/board/cards', async (req, res) => {
  const { projectId, title, priority = null, origin = 'solo', stage = 'idea', theme = null, notes = null } = req.body || {};
  try {
    const card = await board.addCard({ projectId, title, priority, origin, stage, theme, notes });
    res.status(201).json(card);
  } catch (e) {
    res.status(400).json({ error: 'Bad request', detail: e.message });
  }
});

app.patch('/api/board/cards/:id', async (req, res) => {
  const { stage, order, ...rest } = req.body || {};
  try {
    let card;
    if (typeof stage === 'string') card = await board.moveCard(req.params.id, stage, order);
    if (Object.keys(rest).length) card = await board.updateCard(req.params.id, rest);
    if (!card) card = board.getCard(req.params.id);
    if (!card) return res.status(404).json({ error: 'Card not found' });
    res.json(card);
  } catch (e) {
    if (e.message === 'unknown-id') return res.status(404).json({ error: 'Card not found' });
    res.status(400).json({ error: 'Bad request', detail: e.message });
  }
});

app.delete('/api/board/cards/:id', async (req, res) => {
  try { await board.deleteCard(req.params.id); res.status(204).end(); }
  catch (e) {
    if (e.message === 'unknown-id') return res.status(404).json({ error: 'Card not found' });
    res.status(500).json({ error: 'Failed', detail: e.message });
  }
});

// Brainstorming-Session zu einer Karte spawnen (Phase 3): claude im Projekt,
// auf die Idee geprimt, sessionRef an die Karte. Idempotent (reuse lebende).
app.post('/api/board/cards/:id/brainstorm', async (req, res) => {
  try {
    const card = board.getCard(req.params.id);
    if (!card) return res.status(404).json({ error: 'Card not found' });
    // Nur die Existenz/den Pfad des Projekts prüfen — ein fehlendes Plan-Doc
    // (project.missing) ist KEIN Hinderungsgrund: Brainstorming braucht nur den
    // Projektordner (und legt den Spec ggf. erst an).
    const project = await getProject(card.projectId);
    if (!project || !project.path) return res.status(404).json({ error: 'Project not found' });

    // Idempotenz: lebende verlinkte Session → attach statt neu spawnen.
    const live = getTmuxSessions().map(s => s.name);
    const resolved = resolveBrainstormSpawn(card, live);
    if (resolved.reuse) return res.status(200).json({ session: resolved.session, reused: true });

    // Eindeutiger Session-Name aus dem Titel.
    const slug = slugifySessionName(card.title);
    if (!validSessionName(slug)) return res.status(400).json({ error: 'Cannot derive a valid session name from the idea title' });
    let namePart = slug, sessionName = SESSION_PREFIX + namePart, n = 2;
    while (getTmuxSessions().some(s => s.name === sessionName)) { namePart = `${slug}-${n++}`; sessionName = SESSION_PREFIX + namePart; }

    // Spawn (gemeinsamer Helper) + sofort verlinken. spawnTmuxSession wirft bei
    // Fehler; den Rückgabewert (Session-Objekt) braucht diese Route nicht.
    try {
      await spawnTmuxSession({ sessionName, dir: project.path, cmd: 'claude', promptText: buildBrainstormPriming(card.title, card.id), auditMeta: auditLog.extractRequestMeta(req) });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
    await board.updateCard(card.id, { sessionRef: sessionName });

    // Trust-Gate-Watchdog im Hintergrund (blockiert die HTTP-Antwort nicht);
    // der Prompt selbst ist schon als argv-Argument unterwegs.
    watchTrustGate(sessionName);

    res.status(201).json({ session: sessionName, reused: false });
  } catch (e) {
    res.status(500).json({ error: 'Failed to start brainstorm session', detail: e.message });
  }
});

// Autonome Umsetzungs-Session zu einer Karte spawnen (Phase 4): claude
// --dangerously-skip-permissions im Projekt, auf den Spec geprimt. Der Agent
// plant + setzt um, committet lokal auf idea/<slug> (kein Push) und advanced
// die Karte selbst nach review. brainstormDoc ist Pflicht. Idempotent über den
// deterministischen Namen cc-impl-<slug> (lebt sie schon → attach).
app.post('/api/board/cards/:id/implement', async (req, res) => {
  try {
    const card = board.getCard(req.params.id);
    if (!card) return res.status(404).json({ error: 'Card not found' });
    if (!card.brainstormDoc) {
      return res.status(400).json({ error: 'This card has no spec yet — finish the brainstorming step first' });
    }
    const project = await getProject(card.projectId);
    if (!project || !project.path) return res.status(404).json({ error: 'Project not found' });

    const namePart = implementSessionName(card.title);
    if (!validSessionName(namePart)) return res.status(400).json({ error: 'Cannot derive a valid session name from the idea title' });
    const sessionName = SESSION_PREFIX + namePart;

    // Die Karte beim Spawn nach `implement` advancen — aber nur vom Brainstorming-
    // Stand aus, damit ein bloßes Wieder-Öffnen der Session (Card schon in review)
    // sie nicht zurückzieht. Gilt für Detail-Button UND Drag UND Reuse-Pfad.
    const advanceToImplement = () =>
      card.stage === 'brainstorming' ? board.moveCard(card.id, 'implement') : Promise.resolve();

    // Idempotenz: lebt die deterministische Session schon → attach statt neu spawnen.
    if (getTmuxSessions().some(s => s.name === sessionName)) {
      await advanceToImplement();
      return res.status(200).json({ session: sessionName, reused: true });
    }
    try {
      await spawnTmuxSession({ sessionName, dir: project.path, cmd: 'claude --dangerously-skip-permissions', promptText: buildImplementPriming(card), auditMeta: auditLog.extractRequestMeta(req) });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
    await advanceToImplement();
    await board.updateCard(card.id, { sessionRef: sessionName });

    // Trust-Gate-Watchdog im Hintergrund (blockt die HTTP-Antwort nicht).
    watchTrustGate(sessionName);

    res.status(201).json({ session: sessionName, reused: false });
  } catch (e) {
    res.status(500).json({ error: 'Failed to start implementation session', detail: e.message });
  }
});

// Branch-Diff einer review-Karte (Phase 5): git diff <base>...idea/<slug>.
// Read-only. card.branch fehlt → 400; kein Repo → 200 {isRepo:false}.
app.get('/api/board/cards/:id/branch-diff', async (req, res) => {
  try {
    const card = board.getCard(req.params.id);
    if (!card) return res.status(404).json({ error: 'Card not found' });
    if (!card.branch) return res.status(400).json({ error: 'Card has no branch yet' });
    const project = await getProject(card.projectId);
    if (!project || !project.path) return res.status(404).json({ error: 'Project not found' });
    const base = detectBaseBranch(project.path);
    res.json(getBranchDiff(project.path, base, card.branch));
  } catch (e) {
    res.status(500).json({ error: 'Failed to compute branch diff', detail: e.message });
  }
});

// Ideen-Generierungs-Session zu einem Projekt spawnen (Phase 3-B): claude im
// Projekt, auf divergente Ideen-Generierung geprimt. Idempotent über einen
// deterministischen Session-Namen (cc-ideas-<projektslug>) — keine Karte/sessionRef.
app.post('/api/projects/:id/ideagen', async (req, res) => {
  try {
    const project = await getProject(req.params.id);
    if (!project || !project.path) return res.status(404).json({ error: 'Project not found' });
    // project.missing:true ist OK — Ideen-Gen braucht nur den Projektordner, kein Plan-Doc.

    const namePart = ideaGenSessionName(project.displayName, project.id);
    if (!validSessionName(namePart)) {
      return res.status(400).json({ error: 'Cannot derive a valid session name for this project' });
    }
    const sessionName = SESSION_PREFIX + namePart;
    // Idempotenz: lebt die deterministische Session schon → attach statt neu spawnen.
    if (getTmuxSessions().some(s => s.name === sessionName)) {
      return res.status(200).json({ session: sessionName, reused: true });
    }
    try {
      await spawnTmuxSession({ sessionName, dir: project.path, cmd: 'claude', promptText: buildIdeaGenPriming(project.id, project.displayName), auditMeta: auditLog.extractRequestMeta(req) });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
    // Trust-Gate-Watchdog im Hintergrund (blockiert die HTTP-Antwort nicht).
    watchTrustGate(sessionName);
    res.status(201).json({ session: sessionName, reused: false });
  } catch (e) {
    res.status(500).json({ error: 'Failed to start idea generation session', detail: e.message });
  }
});

// Pin/Unpin: generischer PATCH auf das Projekt (Body { pinned: boolean }).
app.patch('/api/projects/:id', async (req, res) => {
  const { pinned } = req.body || {};
  if (typeof pinned !== 'boolean') return res.status(400).json({ error: 'pinned must be a boolean' });
  try {
    await setProjectPinned(req.params.id, pinned);
    const fresh = await getProject(req.params.id);
    res.json(fresh);
  } catch (e) {
    if (e.code === 'unknown-id') return res.status(404).json({ error: 'Project not found' });
    console.error('[projects] pin failed:', e);
    res.status(500).json({ error: 'Failed to update project', detail: e.message });
  }
});

// Forget: deregistriert das Projekt aus der Registry (löscht KEINE Dateien).
app.delete('/api/projects/:id', async (req, res) => {
  try {
    await removeProject(req.params.id);
    projectWatcher.syncWatchers(await loadRegistry());
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'unknown-id') return res.status(404).json({ error: 'Project not found' });
    console.error('[projects] forget failed:', e);
    res.status(500).json({ error: 'Failed to remove project', detail: e.message });
  }
});

// ── File Browser REST Endpoints ─────────────────────────────────────────────
// Alle Routen unter /api/projects/:id/files* sind durch den globalen
// secureMiddleware-Block auf /api/* automatisch geschützt.

function handleFileError(res, err) {
  if (err instanceof FileError) {
    const status = {
      forbidden: 403,
      'not-found': 404,
      'not-a-dir': 400,
      'not-a-file': 400,
      'bad-name': 400,
      oversize: 413,
      unsupported: 415,
      exists: 409,
      'trash-failed': 500,
    }[err.code] || 500;
    return res.status(status).json({ error: err.code, message: err.message, meta: err.meta });
  }
  console.error('[files] unexpected:', err);
  return res.status(500).json({ error: 'internal' });
}

app.get('/api/projects/:id/files', async (req, res) => {
  try {
    const project = await resolveFileSource(req.params.id);
    if (!project) return res.status(404).json({ error: 'not-found' });
    const all = req.query.all === '1';
    const result = filesListDir(project.path, String(req.query.path || ''), { all });
    res.json(result);
  } catch (e) { handleFileError(res, e); }
});

app.get('/api/projects/:id/files/content', async (req, res) => {
  try {
    const project = await resolveFileSource(req.params.id);
    if (!project) return res.status(404).json({ error: 'not-found' });
    const result = await filesReadFile(project.path, String(req.query.path || ''));
    res.setHeader('Content-Type', result.mime);
    if (result.kind === 'text') {
      res.setHeader('X-File-Lang', result.detectedLang);
    }
    res.setHeader('X-File-Size', String(result.size));
    res.send(result.buffer);
  } catch (e) { handleFileError(res, e); }
});

app.post('/api/projects/:id/files/mkdir', async (req, res) => {
  try {
    const project = await resolveFileSource(req.params.id);
    if (!project) return res.status(404).json({ error: 'not-found' });
    const { path: parent, name } = req.body || {};
    const result = await filesMkdir(project.path, String(parent || ''), String(name || ''));
    res.json(result);
  } catch (e) { handleFileError(res, e); }
});

app.post('/api/projects/:id/files/new', async (req, res) => {
  try {
    const project = await resolveFileSource(req.params.id);
    if (!project) return res.status(404).json({ error: 'not-found' });
    const { path: parent, name } = req.body || {};
    const result = await filesCreateEmptyFile(project.path, String(parent || ''), String(name || ''));
    res.json(result);
  } catch (e) { handleFileError(res, e); }
});

app.patch('/api/projects/:id/files', async (req, res) => {
  try {
    const project = await resolveFileSource(req.params.id);
    if (!project) return res.status(404).json({ error: 'not-found' });
    const { op, from, to } = req.body || {};
    if (!['rename', 'move', 'copy'].includes(op)) return res.status(400).json({ error: 'bad-op' });
    const result = op === 'copy'
      ? await filesCopy(project.path, String(from), String(to))
      : await filesRenameOrMove(project.path, String(from), String(to));
    res.json(result);
  } catch (e) { handleFileError(res, e); }
});

app.delete('/api/projects/:id/files', async (req, res) => {
  try {
    const project = await resolveFileSource(req.params.id);
    if (!project) return res.status(404).json({ error: 'not-found' });
    const paths = Array.isArray(req.body?.paths) ? req.body.paths.map(String) : [];
    if (paths.length === 0) return res.status(400).json({ error: 'no-paths' });
    const result = await filesDeleteToTrash(project.path, paths);
    res.json(result);
  } catch (e) { handleFileError(res, e); }
});

app.get('/api/projects/:id/files/download', async (req, res) => {
  try {
    const project = await resolveFileSource(req.params.id);
    if (!project) return res.status(404).json({ error: 'not-found' });
    const rel = typeof req.query.path === 'string' ? req.query.path : '';
    filesStreamToResponse(project.path, rel, res);
  } catch (e) { handleFileError(res, e); }
});

app.get('/api/projects/:id/files/git', async (req, res) => {
  try {
    const project = await resolveFileSource(req.params.id);
    if (!project) return res.status(404).json({ error: 'not-found' });
    // null wenn kein Repo → Frontend zeigt einfach keine Marker.
    res.json({ files: gitStatusMap(project.path) || {} });
  } catch (e) { handleFileError(res, e); }
});

// ── Upload Endpoints ─────────────────────────────────────────────────────────
// Globaler writeLimiter (60 req/60s per IP) deckt POST /api/* bereits ab.

const UPLOAD_HARD_CAP = 100 * 1024 * 1024;

function handleUpload(req, res, resolveTargetDir) {
  const busboy = Busboy({
    headers: req.headers,
    limits: { fileSize: UPLOAD_HARD_CAP, files: 50 },
  });
  let responded = false;
  const finish = (status, payload) => {
    if (responded) return;
    responded = true;
    res.status(status).json(payload);
  };
  const results = [];
  let pending = 0;
  let busboyDone = false;
  const maybeFinish = () => {
    if (busboyDone && pending === 0 && !responded) finish(200, { uploaded: results });
  };

  busboy.on('file', async (_name, stream, info) => {
    pending++;
    let targetDir;
    try { targetDir = await resolveTargetDir(); }
    catch (e) {
      stream.resume();
      pending--;
      return finish(400, { error: 'target', message: e.message });
    }
    const onConflict = String(req.query.onConflict || 'rename');
    try {
      const result = await filesWriteStream(targetDir.root, targetDir.rel, info.filename, stream, { onConflict });
      // suppress our own fs.watch event
      const abs = join(targetDir.root, result.path);
      fwNoteSelfWrite(abs);
      results.push(result);
    } catch (e) {
      stream.resume();
      if (e instanceof FileError && e.code === 'exists') {
        return finish(409, { error: 'exists', meta: e.meta });
      }
      if (e instanceof FileError && e.code === 'oversize') {
        return finish(413, { error: 'oversize', meta: e.meta });
      }
      if (e instanceof FileError && e.code === 'forbidden') {
        return finish(403, { error: 'forbidden', message: e.message });
      }
      return finish(500, { error: 'write-failed', message: e.message });
    }
    pending--;
    maybeFinish();
  });
  busboy.on('finish', () => { busboyDone = true; maybeFinish(); });
  busboy.on('error', (e) => finish(500, { error: 'busboy', message: e.message }));
  req.pipe(busboy);
}

app.post('/api/projects/:id/files/upload', (req, res) => {
  handleUpload(req, res, async () => {
    const project = await resolveFileSource(req.params.id);
    if (!project) throw new Error('project-not-found');
    return { root: project.path, rel: String(req.query.path || '') };
  });
});

app.post('/api/sessions/:name/upload', (req, res) => {
  handleUpload(req, res, async () => {
    const name = req.params.name;
    let cwd;
    try {
      cwd = execFileSync(TMUX, ['display-message', '-p', '-t', name, '#{pane_current_path}'], { encoding: 'utf8' }).trim();
    } catch {
      cwd = null;
    }
    if (!cwd) throw new Error('cwd-unavailable');
    return { root: cwd, rel: '' };
  });
});

// Browse directories (for tree picker in UI). Path-Allowlist aus
// BROWSE_ROOTS (Default $HOME), siehe isUnderAllowedRoot oben.
app.get('/api/browse', (req, res) => {
  let p = req.query.path || process.env.DEFAULT_PROJECT_DIR || '~';
  if (p === '~' || p.startsWith('~/')) p = join(HOME, p.slice(1));
  p = resolve(p);
  if (!isUnderAllowedRoot(p)) {
    return res.status(403).json({ error: 'Access denied: path outside allowed roots', path: p });
  }
  const showHidden = req.query.hidden === '1';
  try {
    const entries = readdirSync(p, { withFileTypes: true })
      .filter(e => e.isDirectory() && (showHidden || !e.name.startsWith('.')))
      .map(e => ({ name: e.name, path: join(p, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
    res.json({ path: p, home: HOME, entries });
  } catch (err) {
    res.status(400).json({ error: err.message, path: p });
  }
});

// Create a new directory under the configured BROWSE_ROOTS. Mirrors /api/browse's
// path-guard. Body: { path: "<absolute>" }. The path may be sent with a leading
// "~" — we expand to $HOME just like /api/browse.
app.post('/api/browse/mkdir', (req, res) => {
  let { path: p } = req.body;
  if (typeof p !== 'string' || p.length === 0) {
    return res.status(400).json({ error: 'path required' });
  }
  if (p === '~' || p.startsWith('~/')) p = join(HOME, p.slice(1));
  p = resolve(p);
  try {
    const created = browseMkdir(p, BROWSE_ROOTS);
    return res.status(201).json({ path: created });
  } catch (err) {
    if (!(err instanceof BrowseMkdirError)) {
      console.error('[browse/mkdir] unexpected error:', err);
      return res.status(500).json({ error: err.message, path: p });
    }
    if (err.code === 'invalid_name') return res.status(400).json({ error: err.message, path: p });
    if (err.code === 'forbidden')    return res.status(403).json({ error: err.message, path: p });
    if (err.code === 'exists')       return res.status(409).json({ error: err.message, path: p });
    console.error('[browse/mkdir] unhandled BrowseMkdirError code:', err.code, err.message);
    return res.status(500).json({ error: err.message, path: p });
  }
});

// Gemeinsamer tmux-Spawn (geteilt von POST /api/sessions und den Board-Spawns).
// Erwartet den FERTIGEN (geprefixten) sessionName; Caller validieren Name +
// 409-Existenz. Wirft bei new-session-Fehler oder Sofort-Exit.
//
// promptText (optional): initialer Prompt für die CLI. Transport via tmux -e
// CCH_PRIME_PROMPT=<text> (argv-Array → kein Shell-Parsing des Inhalts); das
// Shell-Command hängt nur die Referenz "$CCH_PRIME_PROMPT" an, die die Shell
// zu EINEM Argument expandiert. known-sessions + Audit-Log speichern bewusst
// das nackte cmd — ein Dormant-Respawn läuft ohne den (dann stale) Prompt.
async function spawnTmuxSession({ sessionName, dir, cmd, promptText, auditMeta = {} }) {
  const envArgs = hubEnvArgs(sessionName);
  let shellCmd = cmd;
  if (promptText) {
    envArgs.push('-e', `CCH_PRIME_PROMPT=${promptText}`);
    shellCmd = promptedSpawnCommand(cmd);
  }
  execFileSync(TMUX, ['new-session', '-d', '-s', sessionName, ...envArgs, '-c', dir, shellCmd], {
    encoding: 'utf-8', timeout: 5000,
  });
  for (let i = 0; i < 20; i++) {
    await sleep(40);
    const created = getTmuxSessions().find(s => s.name === sessionName);
    if (created) {
      try {
        await knownSessions.add({ name: sessionName, directory: dir, command: cmd });
      } catch (e) {
        console.error('[known-sessions] add failed:', e);
      }
      ensureMouseMode();
      ensureClipboardMode();
      auditLog.record('session.create', { ...auditMeta, session: sessionName, directory: dir, command: cmd });
      return created;
    }
  }
  throw new Error(`Session "${sessionName}" wurde gestartet, aber sofort wieder beendet. Wahrscheinlich ist "${cmd}" nicht im PATH oder das Kommando beendet sich direkt.`);
}

// capture-pane (Plain-Text) einer Session; fehlertolerant (Session weg → '').
function capturePane(sessionName) {
  try {
    return execFileSync(TMUX, ['capture-pane', '-t', sessionName, '-p'], { encoding: 'utf-8', timeout: 5000 });
  } catch { return ''; }
}

// Trust-Gate-Watchdog für Prompt-Spawns (Brainstorming/Implement/Ideen-Gen).
// Der Prompt selbst kommt als argv-Argument an die CLI (siehe spawnTmuxSession)
// — hier wird nur noch claudes „Do you trust this folder?"-Gate abgedeckt, das
// in noch-nicht-vertrauten Verzeichnissen VOR der Prompt-Verarbeitung blockiert:
// erkennen → Enter (Default „Yes, I trust this folder"), danach verarbeitet die
// CLI den argv-Prompt normal. Fire-and-forget, bounded Fenster (~12 s); in
// bereits vertrauten Projektordnern feuert kein einziges send-keys.
function watchTrustGate(sessionName) {
  (async () => {
    try {
      for (let i = 0; i < TRUST_GATE_ATTEMPTS; i++) {
        await sleep(TRUST_GATE_POLL_MS);
        const pane = capturePane(sessionName);
        if (!pane) return;   // Session weg → nichts zu tun.
        if (looksLikeTrustPrompt(pane)) {
          execFileSync(TMUX, ['send-keys', '-t', sessionName, 'Enter'], { encoding: 'utf-8', timeout: 5000 });
        }
      }
    } catch (e) {
      // Session weg / send-keys-Fehler → aufgeben (nicht fatal, Session bleibt nutzbar).
      console.error('[trust-gate] watchdog failed:', e.message);
    }
  })();
}

// Create new session. Session-Name muss Validator bestehen. tmux wird als
// argv aufgerufen, kein Shell-Parsing → keine Quote-Injection möglich.
app.post('/api/sessions', async (req, res) => {
  const { name, directory, command } = req.body;
  if (!validSessionName(name)) {
    return res.status(400).json({
      error: 'Invalid session name: only letters, digits, dash, dot, underscore, spaces; 1-64 chars',
    });
  }
  const sessionName = SESSION_PREFIX + name;
  const dir = directory || process.env.DEFAULT_PROJECT_DIR || HOME;
  const cmd = command || 'claude';

  if (getTmuxSessions().some(s => s.name === sessionName)) {
    return res.status(409).json({ error: 'Session with this name already exists' });
  }

  try {
    const created = await spawnTmuxSession({ sessionName, dir, cmd, auditMeta: auditLog.extractRequestMeta(req) });
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Beendet eine Session (tmux kill + State-Cleanup). Geteilt von der DELETE-
// Route und dem Phase-5-Finish. reqMeta = auditLog.extractRequestMeta(req).
// Wirft, wenn kill-session scheitert (Caller mappt auf 500).
function destroySession(name, reqMeta = {}) {
  execFileSync(TMUX, ['kill-session', '-t', name], { encoding: 'utf-8', timeout: 5000 });
  attention.forget(name);
  usageLimits.forget(name);
  attachTracker.forget(name);
  approvals.forget(name);
  // Alias-Einträge aufräumen, die auf diese Session zeigten.
  for (const [k, v] of hookAlias.entries()) {
    if (v === name || k === name) hookAlias.delete(k);
  }
  auditLog.record('session.delete', { ...reqMeta, session: name });
}

// Kill session
app.delete('/api/sessions/:name', (req, res) => {
  const { name } = req.params;
  if (!SESSION_NAME_RE.test(name)) {
    return res.status(400).json({ error: 'Invalid session name' });
  }
  try {
    destroySession(name, auditLog.extractRequestMeta(req));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rename session
app.patch('/api/sessions/:name', async (req, res) => {
  const { name } = req.params;
  const { newName } = req.body;
  if (!SESSION_NAME_RE.test(name)) {
    return res.status(400).json({ error: 'Invalid source session name' });
  }
  if (typeof newName !== 'string' || !SESSION_NAME_RE.test(newName.replace(/^cc-/, ''))) {
    return res.status(400).json({ error: 'Invalid new session name' });
  }
  const fullNewName = newName.startsWith(SESSION_PREFIX) ? newName : SESSION_PREFIX + newName;
  try {
    execFileSync(TMUX, ['rename-session', '-t', name, fullNewName], { encoding: 'utf-8', timeout: 5000 });
    attention.rename(name, fullNewName);
    usageLimits.rename(name, fullNewName);
    attachTracker.rename(name, fullNewName);
    approvals.rename(name, fullNewName);
    aliasOnRename(name, fullNewName);
    // known-sessions mitziehen, damit Restore nach Rename den neuen Namen findet.
    try { await knownSessions.rename(name, fullNewName); } catch (e) { console.error('[known-sessions] rename failed:', e); }
    auditLog.record('session.rename', {
      ...auditLog.extractRequestMeta(req),
      oldName: name,
      newName,
    });
    res.json({ success: true, name: fullNewName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Git-Diff der Session: vollständige Hunks aller geänderten Dateien.
app.get('/api/sessions/:name/diff', (req, res) => {
  const name = req.params.name;
  if (!validSessionName(name)) return res.status(400).json({ error: 'Invalid session name' });
  const cwd = resolveSessionCwd(name);
  if (!cwd) return res.status(404).json({ error: 'Session cwd not found' });
  try {
    res.json(getDiff(cwd));
  } catch (e) {
    res.status(500).json({ error: 'diff failed', message: String(e && e.message || e) });
  }
});

// GET /api/sessions/:name/git/log?limit&before&skip — lineare Commit-History.
// Muster wie /diff: validName→400, kein cwd→404, fehlertolerant 200 mit leer.
app.get('/api/sessions/:name/git/log', (req, res) => {
  const name = req.params.name;
  if (!validSessionName(name)) return res.status(400).json({ error: 'Invalid session name' });
  const cwd = resolveSessionCwd(name);
  if (!cwd) return res.status(404).json({ error: 'Session cwd not found' });
  const limit = Math.max(1, Math.min(parseInt(req.query.limit) || 50, 200));
  const skip = parseInt(req.query.skip) || 0;
  const before = typeof req.query.before === 'string' ? req.query.before : undefined;
  try {
    res.json(getLog(cwd, { limit, skip, before }));
  } catch (e) {
    res.status(500).json({ error: 'log failed', message: String(e && e.message || e) });
  }
});

// GET /api/sessions/:name/git/branches — local + remote (read-only).
app.get('/api/sessions/:name/git/branches', (req, res) => {
  const name = req.params.name;
  if (!validSessionName(name)) return res.status(400).json({ error: 'Invalid session name' });
  const cwd = resolveSessionCwd(name);
  if (!cwd) return res.status(404).json({ error: 'Session cwd not found' });
  try {
    res.json(getBranches(cwd));
  } catch (e) {
    res.status(500).json({ error: 'branches failed', message: String(e && e.message || e) });
  }
});

// GET /api/sessions/:name/git/commit/:sha — Header + per-file Diffs eines Commits.
app.get('/api/sessions/:name/git/commit/:sha', (req, res) => {
  const name = req.params.name;
  const sha = req.params.sha;
  if (!validSessionName(name)) return res.status(400).json({ error: 'Invalid session name' });
  if (!/^[0-9a-f]{4,40}$/.test(sha)) return res.status(400).json({ error: 'Invalid sha' });
  const cwd = resolveSessionCwd(name);
  if (!cwd) return res.status(404).json({ error: 'Session cwd not found' });
  try {
    const commit = showCommit(cwd, sha);
    if (!commit) return res.status(404).json({ error: 'Commit not found' });
    res.json(commit);
  } catch (e) {
    res.status(500).json({ error: 'commit failed', message: String(e && e.message || e) });
  }
});

// GET /api/sessions/:name/scrollback?lines=N — tmux-History fürs Seeden eines
// frischen xterm. Bearer-Auth via Middleware. Session-Existenz wie im Terminal-Handler.
app.get('/api/sessions/:name/scrollback', (req, res) => {
  const name = req.params.name;
  if (!validSessionName(name)) return res.status(400).json({ error: 'Invalid session name' });
  if (!getTmuxSessions().some(s => s.name === name)) {
    return res.status(404).json({ error: 'Session not found' });
  }
  const lines = Math.max(1, Math.min(parseInt(req.query.lines) || 2000, 10000));
  res.json({ data: captureScrollback(name, { lines, tmux: TMUX }) });
});

// Single-PNG body for the image-paste flow. 8 MB → express.raw answers 413
// on overflow (entity.too.large). type:'image/png' so other bodies don't match.
const imageBody = express.raw({ type: 'image/png', limit: '8mb' });

// POST /api/sessions/:name/image — speichert ein einzelnes PNG in
// <cwd>/.cch-images/ und liefert den cwd-relativen Pfad für die @-Mention.
// Body = rohes image/png (≤8 MB). writeLimiter (global) deckt das Rate-Limit ab.
app.post('/api/sessions/:name/image', imageBody, (req, res) => {
  const name = req.params.name;
  if (!validSessionName(name)) return res.status(400).json({ error: 'Invalid session name' });
  const cwd = resolveSessionCwd(name);
  if (!cwd) return res.status(404).json({ error: 'Session cwd not found' });
  const buf = req.body;
  if (!buf || !buf.length) return res.status(400).json({ error: 'Empty image body' });
  try {
    const { rel } = saveSessionImage(cwd, buf);
    res.json({ rel });
  } catch (e) {
    if (e instanceof FileError && e.code === 'forbidden') {
      return res.status(403).json({ error: 'forbidden' });
    }
    res.status(500).json({ error: 'image save failed', message: String((e && e.message) || e) });
  }
});

// express.raw → 413 bei Overflow. Mappe den PayloadTooLargeError auf unsere JSON-Form.
app.use('/api/sessions/:name/image', (err, req, res, next) => {
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({ error: 'Image too large' });
  }
  next(err);
});

// ── Voice-Input: lokale whisper.cpp-Transkription ──
// Body = roher audio/wav (≤10 MB). type:'audio/wav' damit andere Bodies nicht matchen.
const voiceBody = express.raw({ type: 'audio/wav', limit: '10mb' });

// Feature-Gate fürs Frontend (Button nur sichtbar wenn enabled).
app.get('/api/voice/config', (_req, res) => {
  res.json({ enabled: voice.isEnabled() });
});

// Audio → Text. Session-agnostisch (Transkription berührt keine Session).
app.post('/api/voice/transcribe', voiceBody, async (req, res) => {
  if (!voice.isEnabled()) return res.status(503).json({ error: 'voice disabled' });
  const buf = req.body;
  if (!buf || !buf.length) return res.status(400).json({ error: 'Empty audio body' });
  try {
    const { text } = await voice.transcribe(buf, {});
    res.json({ text });
  } catch (e) {
    if (e && e.code === 'BUSY') return res.status(429).json({ error: 'transcription busy' });
    if (e && e.code === 'DISABLED') return res.status(503).json({ error: 'voice disabled' });
    res.status(500).json({ error: 'transcription failed', message: String((e && e.message) || e) });
  }
});

// express.raw → 413 bei Overflow → unsere JSON-Form.
app.use('/api/voice/transcribe', (err, req, res, next) => {
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({ error: 'Audio too large' });
  }
  next(err);
});

// Restore a dormant session: re-create in tmux with same cwd/command.
// Source of truth ist known-sessions.json — tmux weiß von dormant nichts.
app.post('/api/sessions/:name/restore', async (req, res) => {
  const { name } = req.params;
  if (!SESSION_NAME_RE.test(name)) {
    return res.status(400).json({ error: 'Invalid session name' });
  }
  const entry = knownSessions.find(name);
  if (!entry) {
    return res.status(404).json({ error: 'Session not found in known-sessions' });
  }
  if (getTmuxSessions().some(s => s.name === name)) {
    return res.status(409).json({ error: 'Session with this name is already running' });
  }
  try {
    execFileSync(TMUX, ['new-session', '-d', '-s', name, ...hubEnvArgs(name), '-c', entry.directory, entry.command], {
      encoding: 'utf-8', timeout: 5000,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
  for (let i = 0; i < 20; i++) {
    await sleep(40);
    const created = getTmuxSessions().find(s => s.name === name);
    if (created) {
      try {
        await knownSessions.add({ name, directory: entry.directory, command: entry.command });
      } catch (e) {
        console.error('[known-sessions] restore persist failed:', e);
      }
      return res.status(201).json({ ...created, status: 'running' });
    }
  }
  res.status(500).json({
    error: `Session "${name}" wurde gestartet, aber sofort wieder beendet. Wahrscheinlich ist "${entry.command}" nicht mehr im PATH.`,
  });
});

// Adopt a foreign tmux session: register it in known-sessions under its
// EXISTING name (kein Rename). Damit bleibt der Name stabil, den ein Fremd-
// Client (z.B. Moshi) benutzt. Command ist bei fremder Session unbekannt —
// 'claude' als Default, konsistent mit der Best-Effort-Adoption beim Start.
app.post('/api/sessions/:name/adopt', async (req, res) => {
  const { name } = req.params;
  if (typeof name !== 'string' || !validSessionName(name)) {
    return res.status(400).json({ error: 'Invalid session name: letters/digits/dash/dot/underscore/spaces, 1-64 chars' });
  }
  const live = getTmuxSessions();
  const source = live.find(s => s.name === name);
  if (!source) {
    return res.status(404).json({ error: 'Source session not found' });
  }
  try {
    await knownSessions.add({ name, directory: source.path, command: 'claude' });
  } catch (e) {
    console.error('[known-sessions] adopt persist failed:', e);
    return res.status(500).json({ error: 'Failed to persist adopted session' });
  }
  res.status(200).json({ success: true, name });
});

// Forget a known-session entry (remove from JSON, tmux unaffected).
// Nur sinnvoll für dormant entries — running lässt sich auch entfernen,
// wird aber beim nächsten /api/sessions wieder als cc-prefixed running
// aufgelistet (ohne known-Eintrag).
app.delete('/api/sessions/:name/known', async (req, res) => {
  const { name } = req.params;
  if (!SESSION_NAME_RE.test(name)) {
    return res.status(400).json({ error: 'Invalid session name' });
  }
  const removed = await knownSessions.remove(name);
  if (!removed) return res.status(404).json({ error: 'Not in known-sessions' });
  res.json({ success: true });
});

// ── WebSocket: Projekt-Events ────────────────────────────────────────────────
// Fan-out für fs.watch-Events aus lib/project-watcher.js. Clients abonnieren
// den Endpoint wenn sie den Projekte-Tab oder eine Detail-View offen haben;
// der Server broadcastet JEDES Projekt-Event an alle verbundenen Clients, die
// selbst filtern anhand der aktuell angezeigten Projekt-ID.
//
// Pattern: zentrale Subscriber-Set, einen einzelnen Watcher-Listener, keine
// per-Client-Registry-Pfade. Skaliert für den Single-User-Hub gut genug.
const projectEventClients = new Set();
projectWatcher.subscribe((event) => {
  const payload = JSON.stringify(event);
  for (const ws of projectEventClients) {
    if (ws.readyState === 1) {
      try { ws.send(payload); } catch {}
    }
  }
});

app.ws('/api/projects/events', (ws, req) => {
  if (AUTH_TOKEN && extractToken(req) !== AUTH_TOKEN) {
    ws.close(4001, 'Unauthorized');
    return;
  }
  projectEventClients.add(ws);
  try { ws.send(JSON.stringify({ type: 'hello' })); } catch {}
  ws.on('close', () => projectEventClients.delete(ws));
  ws.on('error', () => projectEventClients.delete(ws));
});

// ── Web Push: Broadcast bei session-attention ────────────────────────────────
// Sendet native Push-Notifications an alle registrierten Subscriptions wenn
// eine Session nach Stop/Notification unattached und nicht muted ist.
// 410 Gone = Subscription abgelaufen → automatisch löschen.
// Frischer tmux-Probe: Ist diese Session aktuell von irgendeinem Client
// attached? Argv-Array, kein Shell-Interpolation. Fehler/keine Session → false.
function tmuxSessionAttached(name) {
  if (!name) return false;
  try {
    const out = execFileSync(TMUX, ['display-message', '-p', '-t', name, '#{session_attached}'], {
      encoding: 'utf-8', timeout: 2000, stdio: 'pipe',
    }).trim();
    return parseInt(out, 10) > 0;
  } catch {
    return false;
  }
}

async function sendPushForAttention(event) {
  const subs = pushSubs.allSubs();
  if (!subs.length) return;
  // Fremd-Client (z.B. Moshi) attached? Dann pusht der Hub nicht — der User
  // schaut bereits über ein anderes Terminal zu. tmux meldet attached, aber
  // der Hub hält keinen eigenen Attach für diese Session.
  if (attachTracker.shouldSuppressForForeignClient(
        tmuxSessionAttached(event.name),
        attachTracker.hubAttachedCount(event.name))) {
    console.log(`[push] skipped (foreign client attached): session=${event.name}`);
    return;
  }
  const displayName = (event.name || '').replace(/^cc-/, '');
  const activityLabels = { idle: 'Bereit', waiting: 'Braucht Input', working: 'Arbeitet' };
  const actLabel = activityLabels[event.activity] || 'Aktiv';
  const payload = JSON.stringify({
    title: `${displayName} — ${actLabel}`,
    body:  `Session "${displayName}" hat Output und wartet auf dich.`,
    name:  event.name,
    activity: event.activity,
  });
  const opts = { TTL: 60, urgency: 'normal' };
  const now = Date.now();

  await Promise.allSettled(subs.map(async (sub) => {
    const host = (() => {
      try { return new URL(sub.endpoint).host; } catch { return 'unknown'; }
    })();
    const ageH = sub.createdAt ? ((now - sub.createdAt) / 3_600_000).toFixed(1) : '?';
    const tag = `${host} dev=${sub.deviceId} age=${ageH}h`;

    if (pushSubs.isBroken(sub)) {
      console.log(`[push] skipped (broken): ${tag}`);
      return;
    }
    if (isDeviceFocused(sub.deviceId, event.name)) {
      console.log(`[push] skipped (device focused): ${tag} session=${event.name}`);
      return;
    }

    try {
      await webpush.sendNotification(sub, payload, opts);
      console.log(`[push] delivered: ${tag} session=${event.name}`);
      await pushSubs.resetFailure(sub.endpoint).catch(() => {});
    } catch (err) {
      const status = err.statusCode ?? 0;
      let reason = null;
      try {
        const body = typeof err.body === 'string' ? err.body : '';
        const m = body.match(/"reason"\s*:\s*"([^"]+)"/);
        if (m) reason = m[1];
      } catch {}

      if (status === 410 || status === 404) {
        await pushSubs.removeSub(sub.endpoint).catch(() => {});
        console.log(`[push] gone, removed: ${tag} status=${status}`);
        return;
      }
      if (status === 401) {
        await pushSubs.removeSub(sub.endpoint).catch(() => {});
        console.log(`[push] unauthorized, removed: ${tag} status=401`);
        return;
      }
      if (status === 403) {
        await pushSubs.incrementFailure(sub.endpoint, { statusCode: 403, reason }).catch(() => {});
        console.warn(`[push] 403 ${reason || 'Forbidden'} (not removing): ${tag}`);
        return;
      }
      await pushSubs.incrementFailure(sub.endpoint, { statusCode: status, reason }).catch(() => {});
      console.warn(`[push] send failed: ${tag} status=${status} reason=${reason || '-'} msg=${err.message}`);
    }
  }));
}

// Web-Push für eine ausstehende Freigabe — mit Allow/Deny-Action-Buttons.
async function sendApprovalPush({ id, name, tool, preview, otp }) {
  const subs = pushSubs.allSubs();
  if (!subs.length) return;
  const displayName = (name || '').replace(/^cc-/, '');
  const payload = JSON.stringify({
    type: 'approval',
    title: `${displayName}: Freigabe für ${tool}`,
    body: preview ? `${tool}: ${preview}` : `Claude will ${tool} ausführen.`,
    name, approvalId: id, otp,
  });
  const opts = { TTL: 120, urgency: 'high' };
  await Promise.allSettled(subs.map(async (sub) => {
    if (pushSubs.isBroken(sub)) return;
    try {
      await webpush.sendNotification(sub, payload, opts);
      await pushSubs.resetFailure(sub.endpoint).catch(() => {});
    } catch (err) {
      const status = err.statusCode ?? 0;
      if (status === 410 || status === 404 || status === 401) {
        await pushSubs.removeSub(sub.endpoint).catch(() => {});
      } else {
        await pushSubs.incrementFailure(sub.endpoint, { statusCode: status }).catch(() => {});
      }
    }
  }));
}

// ── WebSocket: Notifications ─────────────────────────────────────────────────
// Attention-Events (session-attention) aus lib/attention.js an alle
// verbundenen Clients fan-outen. Eigener Channel statt Reuse von
// /api/projects/events, damit die beiden Domänen unabhängig bleiben.
// Per-Device-Presence. Key: deviceId (aus localStorage des Clients).
// Wert: { session: aktuell sichtbare Session oder null, visible, lastSeenAt }.
// Wird über den Notifications-WebSocket gepflegt (Client sendet JSON-Frames).
const PRESENCE_STALE_MS = 60_000;  // iOS PWA im Hintergrund throttled aggressiv — großzügig.
const presence = new Map();

function updatePresence(deviceId, { session, visible }) {
  if (!deviceId) return;
  presence.set(deviceId, {
    session: session ?? null,
    visible: !!visible,
    lastSeenAt: Date.now(),
  });
}

function dropPresence(deviceId) {
  if (deviceId) presence.delete(deviceId);
}

// true wenn dieses Gerät gerade EXAKT diese Session im Vordergrund hat
// und die Presence-Info frisch ist. False sonst (inkl. stale/unbekannt).
function isDeviceFocused(deviceId, sessionName) {
  if (!deviceId || !sessionName) return false;
  const p = presence.get(deviceId);
  if (!p) return false;
  if (Date.now() - p.lastSeenAt > PRESENCE_STALE_MS) return false;
  return p.visible && p.session === sessionName;
}

const notificationClients = new Set();

// Fan-out eines Events an alle Notifications-WS-Clients (Dashboard).
function broadcastNotification(event) {
  const payload = JSON.stringify(event);
  for (const ws of notificationClients) {
    if (ws.readyState === 1) {
      try { ws.send(payload); } catch {}
    }
  }
}

attention.subscribe((event) => {
  broadcastNotification(event);
  // Web-Push: nur bei echten Attention-Events (nicht bei activity-only Updates).
  if (event.type === 'session-attention') {
    sendPushForAttention(event).catch((e) => console.error('[push] broadcast error:', e));
  }
});

app.ws('/api/notifications/events', (ws, req) => {
  if (AUTH_TOKEN && extractToken(req) !== AUTH_TOKEN) {
    ws.close(4001, 'Unauthorized');
    return;
  }
  notificationClients.add(ws);
  let wsDeviceId = null;
  try { ws.send(JSON.stringify({ type: 'hello' })); } catch {}

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || msg.type !== 'presence') return;
    if (typeof msg.deviceId !== 'string' || msg.deviceId.length === 0 || msg.deviceId.length > 128) return;
    wsDeviceId = msg.deviceId;
    const session = typeof msg.session === 'string' ? msg.session : null;
    updatePresence(msg.deviceId, { session, visible: !!msg.visible });
  });

  ws.on('close', () => {
    notificationClients.delete(ws);
    dropPresence(wsDeviceId);
  });
  ws.on('error', () => {
    notificationClients.delete(ws);
    dropPresence(wsDeviceId);
  });
});

// Debug: Snapshot der aktuellen Presence-Map loggen. Auth-geschützt.
app.get('/api/push/presence', (_req, res) => {
  const out = [];
  for (const [deviceId, p] of presence.entries()) {
    out.push({ deviceId, ...p, ageMs: Date.now() - p.lastSeenAt });
  }
  res.json({ presence: out });
});

// ── Web Push API ─────────────────────────────────────────────────────────────

// Subscription speichern. Body: { subscription: PushSubscriptionJSON, deviceId: string }
app.post('/api/push/subscribe', async (req, res) => {
  const sub = req.body?.subscription;
  const deviceId = req.body?.deviceId;
  if (!sub || !sub.endpoint) {
    return res.status(400).json({ error: 'Missing subscription' });
  }
  if (!deviceId || typeof deviceId !== 'string' || deviceId.length > 128) {
    return res.status(400).json({ error: 'Missing or invalid deviceId' });
  }
  try {
    await pushSubs.saveSub({ ...sub, deviceId });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Subscription entfernen. Body: { endpoint: string }
app.delete('/api/push/subscribe', async (req, res) => {
  const endpoint = req.body?.endpoint;
  if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });
  const removed = await pushSubs.removeSub(endpoint);
  res.json({ ok: true, removed });
});

// Smoke-Test: an alle registrierten Subscriptions eine Dummy-Notification senden.
// Primäre Nutzung: UI-Button "Push-Test" + Debugging nach VAPID/Library-Changes.
app.post('/api/push/test', async (_req, res) => {
  const subs = pushSubs.allSubs();
  if (!subs.length) {
    return res.json({ ok: true, sent: 0, note: 'no subscriptions' });
  }
  await sendPushForAttention({
    type: 'session-attention',
    name: 'cc-test',
    activity: 'waiting',
    at: Date.now(),
  });
  res.json({ ok: true, sent: subs.length });
});

// Mute/Unmute einer Session für Notifications. Body: { muted: bool }.
// Muted-Flag persistiert in known-sessions.json; Fremd-Sessions ohne
// known-Eintrag werden abgelehnt (404), weil wir nichts zu persistieren
// haben und bewusst keine Auto-Adoption triggern wollen.
app.post('/api/sessions/:name/mute', async (req, res) => {
  const { name } = req.params;
  if (!SESSION_NAME_RE.test(name)) {
    return res.status(400).json({ error: 'Invalid session name' });
  }
  const muted = !!(req.body && req.body.muted);
  const ok = await knownSessions.setMuted(name, muted);
  if (!ok) return res.status(404).json({ error: 'Session not in known-sessions' });
  res.json({ success: true, name, muted });
});

// Pin/Unpin einer Session. Body: { pinned: bool }. Fremd-Sessions ohne
// known-Eintrag werden mit 404 abgelehnt (keine Auto-Adoption).
app.post('/api/sessions/:name/pin', async (req, res) => {
  const { name } = req.params;
  if (!SESSION_NAME_RE.test(name)) {
    return res.status(400).json({ error: 'Invalid session name' });
  }
  const pinned = !!(req.body && req.body.pinned);
  const ok = await knownSessions.setPinned(name, pinned);
  if (!ok) return res.status(404).json({ error: 'Session not in known-sessions' });
  res.json({ success: true, name, pinned });
});

// ── Tool-Approvals ───────────────────────────────────────────────────────────
// Config-Routen ZUERST, damit Express nicht 'config' als :id matched.
app.get('/api/approvals/config', (_req, res) => res.json({ enabled: remoteApprovalEnabled }));
app.post('/api/approvals/config', express.json(), async (req, res) => {
  remoteApprovalEnabled = !!(req.body && req.body.enabled);
  try { await settings.patch({ remoteApproval: remoteApprovalEnabled }); } catch {}
  res.json({ enabled: remoteApprovalEnabled });
});

// ── Settings (server-persisted prefs + read-only status/feature panel) ────────
app.get('/api/settings', (_req, res) => {
  res.json({
    settings: settings.get(),
    status: {
      version: pkgJson.version || null,
      uptimeSeconds: Math.floor((Date.now() - START_TIME) / 1000),
      sessions: getTmuxSessions().length,
      activePtys: activePtys.size,
    },
    features: {
      voice: { enabled: voice.isEnabled(), lang: voice.langDefault() },
      preview: { enabled: PREVIEW_ENABLED, host: PREVIEW_ENABLED ? PREVIEW_HOST : null },
      cfAccess: { enabled: cfAccess.isEnabled() },
      push: { configured: !!process.env.VAPID_PUBLIC_KEY },
      projectRoots: (process.env.PROJECT_ROOTS || join(HOME, 'Projects')).split(',').map(s => s.trim()).filter(Boolean),
      browseRoots: BROWSE_ROOTS,
      defaultProjectDir: process.env.DEFAULT_PROJECT_DIR || '~',
    },
  });
});

app.patch('/api/settings', express.json(), async (req, res) => {
  const body = req.body || {};
  const patch = {};
  if (body.tmuxMouse === 'on' || body.tmuxMouse === 'off') patch.tmuxMouse = body.tmuxMouse;
  if (typeof body.remoteApproval === 'boolean') patch.remoteApproval = body.remoteApproval;
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'no valid settings in body' });
  let merged;
  try { merged = await settings.patch(patch); } catch { return res.status(500).json({ error: 'persist failed' }); }
  if ('tmuxMouse' in patch) { tmuxMouseMode = merged.tmuxMouse; ensureMouseMode(); }
  if ('remoteApproval' in patch) { remoteApprovalEnabled = merged.remoteApproval; }
  res.json({ settings: merged });
});

// ── Server control (restart / logs / force update-check) ──────────────────────
const LAUNCHD_LABEL = process.env.LAUNCHAGENT_ID || 'com.claude-code-hub';

app.post('/api/server/restart', (req, res) => {
  const target = serverControl.buildLaunchdTarget(process.getuid(), LAUNCHD_LABEL);
  const managed = serverControl.isLaunchdManaged(target, (args) =>
    execFileSync('launchctl', args, { encoding: 'utf-8', timeout: 3000, stdio: 'pipe' }));
  if (!managed) {
    return res.status(409).json({ error: 'not-managed', target,
      hint: 'Server is not managed by launchd — restart it manually.' });
  }
  auditLog.record('server.restart', { ...auditLog.extractRequestMeta(req), target });
  res.json({ ok: true, restarting: true, target });
  // Restart AFTER the response flushes. kickstart -k kills + relaunches us.
  setTimeout(() => {
    try { execFileSync('launchctl', ['kickstart', '-k', target], { timeout: 3000, stdio: 'pipe' }); }
    catch (e) { console.error('[server.restart] kickstart failed:', e.message); }
  }, 300);
});

app.get('/api/server/logs', async (req, res) => {
  const stream = req.query.stream === 'stderr' ? 'stderr' : 'stdout';
  let lines = parseInt(req.query.lines, 10);
  if (!Number.isFinite(lines)) lines = 200;
  lines = Math.min(1000, Math.max(1, lines));
  try {
    const data = await serverControl.tailFile(join(__dirname, 'logs', `${stream}.log`), lines);
    res.json({ stream, lines, data });
  } catch {
    res.status(500).json({ error: 'log read failed' });
  }
});

app.post('/api/version/check', async (_req, res) => {
  await updateChecker.check();
  res.json(updateChecker.getState());
});

// Entscheidung vom Dashboard (Bearer) ODER vom Service-Worker (?token=<otp>).
app.post('/api/approvals/:id', express.json(), (req, res) => {
  const { id } = req.params;
  const p = approvals.get(id);
  const token = req.query.token;
  if (token && (!p || token !== p.otp)) return res.status(403).json({ error: 'bad-token' });
  const decision = (req.body && req.body.decision) === 'deny' ? 'deny' : 'allow';
  const ok = approvals.resolve(id, decision);
  if (!ok) return res.status(404).json({ error: 'not-found-or-resolved' });
  res.json({ ok: true, decision });
});

// ── Claude-Code Hooks ────────────────────────────────────────────────────────
// Claude feuert in ~/.claude/settings.json konfigurierte Hooks für Events
// wie Stop/Notification/UserPromptSubmit. Jedes Hook-Script POSTet hier
// hin mit X-CC-Hub-Session (aus tmux-env CC_HUB_SESSION). Ergebnis: <100ms
// State-Update ohne Regex-Parsing. Auth läuft über die /api-Middleware.
const HOOK_EVENTS = new Set([
  'UserPromptSubmit', 'Stop', 'SubagentStop', 'Notification',
  'SessionStart', 'SessionEnd',
]);
// Remote-Freigabe global an/aus. Default aus .env (REMOTE_APPROVAL, default 'on').
// In-memory, kein Datei-Persist (Neustart → .env-Default, wie activePreviewPort).
const REMOTE_APPROVAL_DEFAULT = (process.env.REMOTE_APPROVAL ?? 'on').toLowerCase() !== 'off';
let remoteApprovalEnabled = REMOTE_APPROVAL_DEFAULT;   // overridden by settings.load() at boot
// Eigener Body-Parser für Hook-Route: Claude's Hook-Stdin-JSON ist
// gelegentlich syntaktisch kaputt (z.B. `"line":}`), was express.json()
// mit 400 abbricht — unser Handler würde nie laufen und der State-Update
// wäre verloren. Wir nehmen Raw-Bytes, versuchen optimistisch zu parsen,
// und fallen bei Fehlern auf ein leeres Objekt zurück. Payload wird eh
// nicht ausgewertet, nur durchgereicht.
const hookBody = express.raw({ type: '*/*', limit: '1mb' });

// StatusLine-Hook: empfängt Rate-Limits, Kosten und Context-Window-Daten
// von Claude Code. Muss VOR dem generischen :event-Handler stehen, damit
// Express nicht `:event = "statusline"` matcht.
app.post('/api/hooks/statusline', hookBody, (req, res) => {
  const envName = req.get('X-CC-Hub-Session');
  if (!envName) return res.status(400).json({ error: 'Missing X-CC-Hub-Session' });
  let data = {};
  if (Buffer.isBuffer(req.body) && req.body.length > 0) {
    try { data = JSON.parse(req.body.toString('utf8')); } catch { /* tolerant */ }
  }
  const sessionName = resolveHookSession(envName);
  usageLimits.recordStatusline(sessionName, {
    pct5h: data.rate_limits?.five_hour?.used_percentage ?? null,
    pct7d: data.rate_limits?.seven_day?.used_percentage ?? null,
    resets5h: data.rate_limits?.five_hour?.resets_at ?? null,
    resets7d: data.rate_limits?.seven_day?.resets_at ?? null,
    costUsd: data.cost?.total_cost_usd ?? null,
    durationMs: data.cost?.total_duration_ms ?? null,
    apiDurationMs: data.cost?.total_api_duration_ms ?? null,
    linesAdded: data.cost?.total_lines_added ?? null,
    linesRemoved: data.cost?.total_lines_removed ?? null,
    model: data.model?.display_name ?? null,
    contextPct: data.context_window?.used_percentage ?? null,
    contextSize: data.context_window?.context_window_size ?? null,
  });
  res.json({ ok: true, name: sessionName });
});

// PreToolUse: Activity melden + ggf. die Allow/Deny-Entscheidung ans Dashboard
// routen (Long-Poll). Antwort = hookSpecificOutput-JSON (allow/deny) oder leer
// (defer → normaler Permission-Flow).
app.post('/api/hooks/pre-tool-use', hookBody, (req, res) => {
  const envName = req.get('X-CC-Hub-Session');
  if (!envName || !SESSION_NAME_RE.test(envName)) {
    return res.status(400).json({ error: 'Missing or invalid X-CC-Hub-Session' });
  }
  const name = resolveHookSession(envName);

  let payload = {};
  if (Buffer.isBuffer(req.body) && req.body.length > 0) {
    try { payload = JSON.parse(req.body.toString('utf8')); } catch { /* tolerant */ }
  }
  const tool = typeof payload.tool_name === 'string' ? payload.tool_name : '';
  const mode = typeof payload.permission_mode === 'string' ? payload.permission_mode : 'default';
  const toolInput = payload.tool_input && typeof payload.tool_input === 'object' ? payload.tool_input : {};
  const cwd = typeof payload.cwd === 'string' ? payload.cwd : '';

  if (tool) attention.reportToolStart(name, tool);

  const route = approvals.shouldRoute({
    mode,
    hubAttached: attachTracker.hubAttachedCount(name),
    tmuxAttached: tmuxSessionAttached(name),
    tool,
    enabled: remoteApprovalEnabled,
  });

  if (!route) return res.status(200).end(); // defer (leerer Body)

  const id = approvals.create({ session: name, tool, toolInput, cwd }, (decision) => {
    if (res.headersSent) return;
    if (decision === 'allow' || decision === 'deny') {
      res.json({ hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: decision,
        permissionDecisionReason: decision === 'allow'
          ? 'Approved via Claude Code Hub' : 'Denied via Claude Code Hub',
      }});
    } else {
      res.status(200).end(); // defer
    }
    broadcastNotification({ type: 'tool-approval-resolved', id, name });
  });

  // req.on('close') fires after body consumption in modern Node.js (v18+) — not on
  // actual TCP disconnect. Use res.on('close') which fires when the response stream
  // is destroyed without completing (writableEnded=false), indicating client disconnect.
  res.on('close', () => {
    if (!res.writableEnded) approvals.resolve(id, 'defer');
  });

  const preview = approvalPreview(tool, toolInput);
  broadcastNotification({ type: 'tool-approval-request', id, name, tool, preview, at: Date.now() });
  sendApprovalPush({ id, name, tool, preview, otp: approvals.get(id)?.otp });
});

// Kurz-Preview des Tool-Inputs für Notification/Card.
function approvalPreview(tool, input) {
  if (!input || typeof input !== 'object') return '';
  const s = (v) => String(v ?? '').slice(0, 200);
  if (tool === 'Bash') return s(input.command);
  if (tool === 'Edit' || tool === 'Write') return s(input.file_path);
  if (tool === 'WebFetch') return s(input.url);
  if (tool === 'WebSearch') return s(input.query);
  if (tool === 'Task') return s(input.description || input.prompt);
  try { return s(JSON.stringify(input)); } catch { return ''; }
}

app.post('/api/hooks/:event', hookBody, (req, res) => {
  const { event } = req.params;
  const envName = req.get('X-CC-Hub-Session');
  if (!envName || !SESSION_NAME_RE.test(envName)) {
    return res.status(400).json({ error: 'Missing or invalid X-CC-Hub-Session' });
  }
  if (event === 'PostToolUse') {
    if (envName && SESSION_NAME_RE.test(envName)) {
      attention.reportToolEnd(resolveHookSession(envName));
    }
    return res.json({ ok: true });
  }
  if (!HOOK_EVENTS.has(event)) return res.status(204).end();
  let payload = {};
  if (Buffer.isBuffer(req.body) && req.body.length > 0) {
    try { payload = JSON.parse(req.body.toString('utf8')); } catch { /* tolerant */ }
  }
  const sessionName = resolveHookSession(envName);
  attention.reportHookEvent(sessionName, event, payload);
  res.json({ ok: true, name: sessionName, event });
});

// ── WebSocket terminal ──────────────────────────────────────────────────────
// Tracking aller aktiven PTYs für Graceful Shutdown.
const activePtys = new Set();
// Nur Terminal-WS (NICHT die Files-Events-WS) — für den Heartbeat unten.
const terminalSockets = new Set();

app.ws('/api/terminal/:name', (ws, req) => {
  // Auth ist bereits durch die HTTP-Middleware geprüft worden (authMiddleware
  // akzeptiert Sec-WebSocket-Protocol). Defensiv nochmal checken, falls die
  // Middleware später umgebaut wird.
  if (AUTH_TOKEN && extractToken(req) !== AUTH_TOKEN) {
    ws.close(4001, 'Unauthorized');
    return;
  }

  const sessionName = req.params.name;

  // Vor dem Spawn prüfen: existiert die Session?
  if (!getTmuxSessions().some(s => s.name === sessionName)) {
    try { ws.send(JSON.stringify({ type: 'error', message: `Session "${sessionName}" nicht gefunden` })); } catch {}
    ws.close(4004, 'Session not found');
    return;
  }

  const cols = parseInt(req.query.cols) || 120;
  const rows = parseInt(req.query.rows) || 40;

  // Mouse-Mode idempotent vor jedem Attach sicherstellen. Scroll-Wheel
  // in xterm.js funktioniert nur, wenn tmux Mouse-Events forwarded — und
  // die globale Option überlebt keinen tmux-Server-Neustart, keine Reboots
  // und keine Pre-Hook-Legacy-Sessions, die vor dem Hub-Update entstanden.
  ensureMouseMode();

  let pty;
  try {
    // `-u` zwingt den tmux-Client in den UTF-8-Modus unabhängig vom Locale.
    // Zusätzlich LANG/LC_CTYPE im env, damit Child-Prozesse (claude & Co.)
    // ebenfalls eine UTF-8-Locale sehen.
    pty = spawn(TMUX, ['-u', 'attach-session', '-t', sessionName], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: process.env.HOME,
      encoding: null,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        LANG: process.env.LANG || 'en_US.UTF-8',
        LC_CTYPE: process.env.LC_CTYPE || 'en_US.UTF-8',
      },
    });
  } catch (err) {
    try { ws.send(JSON.stringify({ type: 'error', message: `Failed to attach: ${err.message}` })); } catch {}
    ws.close();
    return;
  }

  activePtys.add(pty);
  terminalSockets.add(ws);
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  attachTracker.noteAttach(sessionName);

  // ── Audit-Log: session.attach + session.detach ────────────────
  // sessionMeta einmal extrahieren und über die WS-Lifetime cachen,
  // damit die async cleanup-Handler keinen req-Closure-Zugriff brauchen.
  // detachRecorded dedupliziert den Dual-Trigger (pty.onExit feuert
  // meist direkt den ws.close, der dann auch recordDetach rufen will).
  const sessionMeta = auditLog.extractRequestMeta(req);
  const attachedAt = Date.now();
  let detachRecorded = false;
  const recordDetach = () => {
    if (detachRecorded) return;
    detachRecorded = true;
    attachTracker.noteDetach(sessionName);
    auditLog.record('session.detach', {
      ...sessionMeta,
      session: sessionName,
      durationMs: Date.now() - attachedAt,
    });
  };
  auditLog.record('session.attach', { ...sessionMeta, session: sessionName });

  pty.onData(data => {
    if (ws.readyState === 1) {
      try { ws.send(data, { binary: true }); } catch {}
    }
  });

  pty.onExit(() => {
    activePtys.delete(pty);
    recordDetach();
    try { ws.close(); } catch {}
  });

  ws.on('message', msg => {
    try {
      const parsed = JSON.parse(msg);
      if (parsed.type === 'ping') { try { ws.send(JSON.stringify({ type: 'pong' })); } catch {} return; }
      if (parsed.type === 'resize') pty.resize(parsed.cols, parsed.rows);
      else if (parsed.type === 'input') pty.write(parsed.data);
    } catch {
      pty.write(msg);
    }
  });

  ws.on('close', () => {
    terminalSockets.delete(ws);
    recordDetach();
    activePtys.delete(pty);
    try { pty.kill(); } catch {}
  });
});

// Server→Client-Heartbeat: tote Terminal-Sockets terminieren → PTY wird frei.
// Browser antworten automatisch auf PING-Frames; bleibt der Pong aus, ist der
// Link tot. 30s-Intervall (großzügig, keine Falsch-Positive bei kurzem Lag).
const WS_HEARTBEAT_MS = 30_000;
const wsHeartbeatTimer = setInterval(() => {
  for (const ws of terminalSockets) {
    if (ws.isAlive === false) {
      try { ws.terminate(); } catch {}
      terminalSockets.delete(ws);
      continue;
    }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  }
}, WS_HEARTBEAT_MS);
wsHeartbeatTimer.unref();

// ── WebSocket file-events ─────────────────────────────────────────────────────
// Client sendet { subscribe: projectId } / { unsubscribe: projectId }.
// Server broadcastet FSEvent-Objekte für die abonnierten Projekte.
app.ws('/api/files/events', (ws, req) => {
  if (AUTH_TOKEN && extractToken(req) !== AUTH_TOKEN) {
    try { ws.close(4001, 'Unauthorized'); } catch {}
    return;
  }
  const subs = new Map(); // projectId → handler
  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (msg.subscribe) {
      const project = await resolveFileSource(String(msg.subscribe));
      if (!project) return;
      if (subs.has(project.id)) return;
      const handler = (event) => {
        try { ws.send(JSON.stringify(event)); } catch {}
      };
      fwSubscribe(project.id, project.path, handler);
      subs.set(project.id, handler);
    } else if (msg.unsubscribe) {
      const pid = String(msg.unsubscribe);
      const handler = subs.get(pid);
      if (handler) {
        fwUnsubscribe(pid, handler);
        subs.delete(pid);
      }
    } else if (msg.subscribeSession) {
      const name = String(msg.subscribeSession);
      const pid = 'session:' + name;
      if (subs.has(pid)) return;
      const cwd = resolveSessionCwd(name);
      if (!cwd) return;
      const handler = (event) => { try { ws.send(JSON.stringify(event)); } catch {} };
      fwSubscribe(pid, cwd, handler);
      subs.set(pid, handler);
    } else if (msg.unsubscribeSession) {
      const pid = 'session:' + String(msg.unsubscribeSession);
      const handler = subs.get(pid);
      if (handler) { fwUnsubscribe(pid, handler); subs.delete(pid); }
    }
  });
  ws.on('close', () => {
    for (const [pid, handler] of subs) fwUnsubscribe(pid, handler);
    subs.clear();
  });
});

// ── Fallback to index.html (SPA routing) ─────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

// Update-Check: einmal beim Start (non-blocking), danach alle 12h.
// .unref() verhindert dass das Interval den Prozess beim Shutdown am Leben hält.
setImmediate(() => updateChecker.check());
setInterval(() => updateChecker.check(), 12 * 60 * 60 * 1000).unref();

// ── Start + Graceful Shutdown ───────────────────────────────────────────────
const server = app.listen(PORT, async () => {
  console.log(`\n  ⚡ Claude Code Hub running at http://localhost:${PORT}\n`);
  try {
    await knownSessions.load();
    console.log(`  ▸ known-sessions: ${knownSessions.list().length} entries loaded`);
    await board.load();
    console.log(`  ▸ board: ${board.listCards().length} cards loaded`);
    // Idea-Pipeline Phase-1 Cutover: NUR claude-code-hub migrieren (Dogfood).
    // Idempotent (skip bei vorhandener CHANGELOG.md); Fehler dürfen den Start nicht killen.
    try {
      const _projs = await listProjects();
      const _hub = _projs.find(p => /(^|\/)claude-code-hub$/.test(p.path)) || _projs.find(p => p.path === process.cwd());
      if (_hub) {
        const _n = await board.migrateBacklog([{ id: _hub.id, path: _hub.path }]);
        if (_n) console.log(`  ▸ board: migrated ${_n} backlog item(s) → cards; ROADMAP.md → CHANGELOG.md`);
      }
    } catch (e) { console.warn('[board] migration skipped:', e.message); }
    await settings.load({ tmuxMouse: TMUX_MOUSE_DEFAULT, remoteApproval: REMOTE_APPROVAL_DEFAULT });
    const _s = settings.get();
    tmuxMouseMode = _s.tmuxMouse;
    ensureMouseMode();
    remoteApprovalEnabled = _s.remoteApproval;
    console.log(`  ▸ settings: tmuxMouse=${tmuxMouseMode} remoteApproval=${remoteApprovalEnabled}`);
    // Best-effort Adoption: alle aktuell laufenden cc-* Sessions, die wir
    // noch nicht kennen, ins File eintragen. Der Fall tritt nach Updates
    // auf älteren Hub-Installationen auf oder wenn der User die JSON-Datei
    // manuell gelöscht hat.
    //
    // Zwei bewusste Lossy-Punkte:
    //   1. `command: 'claude'` ist geraten — tmux gibt den ursprünglichen
    //      argv nicht her. Konsistent mit dem /adopt-Endpoint (Task 4).
    //      Falls der User die Session mit einem anderen Command gestartet
    //      hatte, muss er die Karte nach einem Restore ggf. neu anlegen.
    //   2. `directory: s.path` kommt aus `#{pane_current_path}`, nicht
    //      aus dem ursprünglichen `-c`. Nach `cd` im Shell ist der Wert
    //      gedriftet. Für Restore besser als gar nichts.
    //
    // knownSessions.add serialisiert intern (saveQueue), daher safe
    // gegenüber parallelen POST /api/sessions während des Startups.
    const live = getTmuxSessions();
    const knownNames = new Set(knownSessions.list().map(e => e.name));
    for (const s of live) {
      if (s.name.startsWith(SESSION_PREFIX) && !knownNames.has(s.name)) {
        await knownSessions.add({ name: s.name, directory: s.path, command: 'claude' });
      }
    }
  } catch (err) {
    console.error('[known-sessions] load failed:', err);
  }

  // Attention-Engine: Mute-Checker registrieren. Zustand wird
  // ausschließlich aus ~/.claude/settings.json-Hooks gespeist, kein
  // eigener Poll-Loop mehr.
  attention.setMuteChecker((name) => knownSessions.isMuted(name));
  console.log('  ▸ attention-engine: hook-only');

  // Web Push: VAPID-Keys laden (ggf. generieren) + Subscriptions laden.
  try {
    await loadVapid();
    console.log('  ▸ web-push: VAPID-Keys geladen');
  } catch (e) {
    console.error('[vapid] load failed:', e.message);
  }
  try {
    await pushSubs.loadSubs();
    console.log(`  ▸ web-push: ${pushSubs.allSubs().length} Subscription(s) geladen`);
  } catch (e) {
    console.error('[push-subs] load failed:', e.message);
  }
});

// Browser-Preview: HMR-WS-Upgrade vor express-ws abfangen. attachUpgrade greift
// die express-ws-Listener ab und delegiert Nicht-Preview-Upgrades zurück, sodass
// der fixe Preview-Host exklusiv über proxyWs (zum aktiven Port) läuft und der
// Hub-WS (/api/terminal, /api/files/events) unverändert bedient wird.
// Siehe lib/preview-proxy.test.js (Koexistenz-Test).
if (PREVIEW_ENABLED) {
  attachUpgrade(server, { previewHost: PREVIEW_HOST, getPort: previewPortReady });
  console.log(`  ▸ browser-preview: proxy aktiv für ${PREVIEW_HOST} (Port serverseitig gewählt)`);
}

// Leiser 5-min-Poll: hält die account-weite Limit-History auch ohne offene
// Usage-Ansicht aktuell. moshi-hook fehlt → getUsage()=null → no-op.
const USAGE_POLL_MS = 5 * 60_000;
const usagePollTimer = setInterval(() => {
  const usage = moshiHook.getUsage();
  if (usage) usageLimits.recordUsageSnapshot(usage);
}, USAGE_POLL_MS);
usagePollTimer.unref();

// Heartbeat: alle 60s lastSeenAt für laufende bekannte Sessions updaten.
// Das gibt uns in der UI einen belastbaren "zuletzt gesehen"-Wert für
// dormant Cards, sobald die Session wegbricht.
const HEARTBEAT_INTERVAL_MS = 60_000;
const heartbeatTimer = setInterval(async () => {
  try {
    const liveNames = getTmuxSessions().map(s => s.name);
    const known = new Set(knownSessions.list().map(e => e.name));
    const toTouch = liveNames.filter(n => known.has(n));
    if (toTouch.length) await knownSessions.touchMany(toTouch);
  } catch (e) {
    console.error('[heartbeat]', e);
  }
}, HEARTBEAT_INTERVAL_MS);
heartbeatTimer.unref();

function shutdown(signal) {
  console.log(`\n  ${signal} received — killing ${activePtys.size} active PTY(s) and shutting down`);
  clearInterval(heartbeatTimer);
  clearInterval(wsHeartbeatTimer);
  clearInterval(usagePollTimer);
  for (const p of activePtys) { try { p.kill(); } catch {} }
  projectWatcher.closeAll();
  fwCloseAll();
  attention.stop();
  server.close(() => process.exit(0));
  // Force-Exit falls server.close() hängt.
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Projekt-Discovery einmalig beim Startup. Scan-Roots sind konfigurierbar
// via PROJECT_ROOTS (comma-separated), Default: ~/Projects.
// Nach Discovery werden die fs.watch-Watcher angezogen.
const projectRoots = (process.env.PROJECT_ROOTS || join(HOME, 'Projects'))
  .split(',').map(s => s.trim()).filter(Boolean)
  .map(p => (p === '~' || p.startsWith('~/')) ? join(HOME, p.slice(1)) : p);
discoverProjects(projectRoots)
  .then(async (r) => {
    console.log(`[projects] discovery: +${r.added}, total=${r.total}`);
    const reg = await loadRegistry();
    projectWatcher.syncWatchers(reg);
    console.log(`[projects] watchers: ${projectWatcher._debugState().watching.length} active`);
  })
  .catch(e => console.error('[projects] discovery failed:', e.message));
