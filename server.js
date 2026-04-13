import express from 'express';
import expressWs from 'express-ws';
import { spawn } from 'node-pty';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join, resolve, sep } from 'path';
import { readdirSync } from 'fs';
import { homedir } from 'os';
import dotenv from 'dotenv';
import { getCurrentContext, getDailyUsage } from './lib/usage.js';
import * as knownSessions from './lib/known-sessions.js';
import { discoverProjects, listProjects, getProject, patchProject } from './lib/projects.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 3333;
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
const SESSION_PREFIX = process.env.SESSION_PREFIX || 'cc-';
const TMUX = process.env.TMUX_PATH || '/opt/homebrew/bin/tmux';

// LaunchAgent startet uns mit minimalem PATH (/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin).
// `claude` liegt in ~/.local/bin und wäre sonst für tmux-Child-Prozesse unauffindbar →
// neu erstellte Sessions würden sofort mit Exit 127 sterben.
const EXTRA_PATHS = [join(homedir(), '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin'];
process.env.PATH = [...new Set([...EXTRA_PATHS, ...(process.env.PATH || '').split(':')])].filter(Boolean).join(':');

// Mouse-Mode global in tmux aktivieren, sodass Wheel-Events im xterm.js-Client
// als Scroll-Back funktionieren. Ohne das sieht der attached Client keine
// Scroll-Events und die Terminal-View scheint eingefroren, sobald Output länger
// als die Pane-Höhe wird. Silently ignorieren wenn noch kein tmux-Server läuft.
try {
  execFileSync(TMUX, ['set-option', '-g', 'mouse', 'on'], {
    encoding: 'utf-8', timeout: 2000, stdio: 'pipe',
  });
} catch { /* tmux-Server evtl. noch nicht da — dann greift es beim ersten set */ }

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

app.use(express.json());

// Request-Logger: nur HTTP, keine WS (die kommen über upgrade und matchen
// diesen Middleware nicht). Pfad ohne Query, damit der ?token= Fallback
// nicht in den Logs landet.
app.use((req, _res, next) => {
  const path = req.url.split('?')[0];
  console.log(`${new Date().toISOString()} ${req.method} ${path}`);
  next();
});

app.use(express.static(join(__dirname, 'public')));

// ── Auth middleware ──────────────────────────────────────────────────────────
// Akzeptiert drei Quellen:
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
function authMiddleware(req, res, next) {
  if (!AUTH_TOKEN) return next();
  const token = extractToken(req);
  if (token === AUTH_TOKEN) return next();
  res.status(401).json({ error: 'Unauthorized' });
}
app.use('/api', authMiddleware);

// ── Validation ───────────────────────────────────────────────────────────────
// Erlaubte Zeichen im Session-Namen: Buchstaben, Zahlen, _, -, ., Leerzeichen.
// Explizit verboten: Quotes, Backslash, Shell-Metachars, Control-Chars.
const SESSION_NAME_RE = /^[\w\-. ]{1,64}$/;
const validSessionName = (n) => typeof n === 'string' && SESSION_NAME_RE.test(n);

// Browse auf den Home-Ordner eingrenzen — verhindert `?path=/etc/passwd`.
const HOME = homedir();
function isUnderHome(p) {
  const r = resolve(p);
  return r === HOME || r.startsWith(HOME + sep);
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

// ── Helper: pane preview mit kleinem TTL-Cache ───────────────────────────────
// Ohne Cache macht jedes Dashboard-Polling N+1 execFile-Calls. Bei 5 s Polling
// und mehreren Sessions summiert sich das schnell. 2 s Cache ist ein sinnvoller
// Tradeoff zwischen Frische und Load.
const previewCache = new Map();
const PREVIEW_TTL_MS = 2000;

function getSessionPreview(sessionName, lines = 8) {
  const cached = previewCache.get(sessionName);
  if (cached && Date.now() - cached.ts < PREVIEW_TTL_MS) return cached.value;
  try {
    const output = execFileSync(TMUX, [
      'capture-pane', '-t', sessionName, '-p', '-S', `-${lines}`,
    ], { encoding: 'utf-8', timeout: 3000 }).trim();
    previewCache.set(sessionName, { value: output, ts: Date.now() });
    return output;
  } catch {
    return '';
  }
}

function invalidatePreview(name) {
  previewCache.delete(name);
}

// ── Usage-Limit-Parsing ──────────────────────────────────────────────────────
// Extrahiert den 5h-Nutzungsanteil aus der Claude Code Status-Line.
// Format in der letzten Terminalzeile: "5h ####- 77%"
// Gibt null zurück wenn das Pattern nicht gefunden wird (Session ohne Claude
// oder Pane noch nicht sichtbar).
function parseUsagePct5h(preview) {
  if (!preview) return null;
  const m = /5h\s+[#\-]+\s+(\d+)%/.exec(preview);
  return m ? parseInt(m[1], 10) : null;
}

// ── Activity-Detection ───────────────────────────────────────────────────────
// Parse das letzte Pane-Content und leite daraus Claudes Zustand ab.
// Bewusst konservativ: im Zweifel `unknown`, lieber als false positive.
// Wird später vom Notifications-Feature als Signal-Quelle verwendet.
function detectActivity(preview) {
  if (!preview) return 'unknown';
  // Working: "esc to interrupt"-Hinweis oder aktiver Spinner mit Zeit-Counter
  if (/\besc to interrupt\b/i.test(preview)) return 'working';
  if (/[✻✢⏿⏳][^\n]*\(\d+[ms]/.test(preview)) return 'working';
  // Waiting: nummerierter Menü-Cursor oder Konfirm-Prompt
  if (/❯\s+\d+\./.test(preview)) return 'waiting';
  if (/\bDo you want to\b/i.test(preview)) return 'waiting';
  if (/\bPress Enter to\b/i.test(preview)) return 'waiting';
  // Ready: Claude-Input-Footer sichtbar ("⏵⏵ bypass/accept permissions")
  if (/⏵⏵\s+(bypass|accept)/i.test(preview)) return 'idle';
  return 'unknown';
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── REST API ────────────────────────────────────────────────────────────────

// List sessions. Preview wird intern für Activity-Detection geholt, aber
// NICHT ans Frontend ausgeliefert — der 8-Zeilen-Preview-Block im UI ist
// entfernt. `?preview=0` behält seine Bedeutung (schaltet auch die
// Activity-Detection ab, weil dafür auch der capture-pane-Call entfällt).
app.get('/api/sessions', (req, res) => {
  const live = getTmuxSessions();
  const withActivity = req.query.preview !== '0';
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

  // Enrichment: Activity + Context nur für running/foreign (dormant hat
  // keine Pane). Context-Lookup ist ebenfalls fürs Dormant-cwd sinnvoll,
  // damit der User beim Restore einen Hinweis auf den zuletzt bekannten
  // Token-Stand hat — getCurrentContext liest aus den JSONL-Logs, nicht
  // aus der Pane.
  const enrich = (s) => {
    let preview = null;
    if (withActivity && s.status !== 'dormant') {
      preview = getSessionPreview(s.name);
    }
    const base = preview !== null
      ? { ...s, activity: detectActivity(preview), usagePct5h: parseUsagePct5h(preview) }
      : { ...s, usagePct5h: null };
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
    const data = await getDailyUsage({ days });
    usageCache = { ts: now, key, data };
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Failed to compute usage', detail: e.message });
  }
});

// ── Projekt-Verwaltung (Phase 1 Step 1, read-only) ─────────────────────
// Quelle: ~/.claude-code-hub/projects.json + ROADMAP.md pro Projekt.
// Mutations (POST/PATCH) und File-Watcher kommen in Step 2.
app.get('/api/projects', async (_req, res) => {
  try {
    const projects = await listProjects();
    res.json({ projects });
  } catch (e) {
    res.status(500).json({ error: 'Failed to list projects', detail: e.message });
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
      return res.status(400).json({ error: 'Section not found in ROADMAP.md' });
    }
    if (code === 'bad-action' || code === 'bad-body') {
      return res.status(400).json({ error: 'Bad request', detail: e.detail || e.message });
    }
    console.error('[projects] patch failed:', e);
    res.status(500).json({ error: 'Failed to patch project', detail: e.message });
  }
});

// Browse directories (for tree picker in UI). Path-Allowlist: nur unter Home.
app.get('/api/browse', (req, res) => {
  let p = req.query.path || process.env.DEFAULT_PROJECT_DIR || '~';
  if (p === '~' || p.startsWith('~/')) p = join(HOME, p.slice(1));
  p = resolve(p);
  if (!isUnderHome(p)) {
    return res.status(403).json({ error: 'Access denied: path outside home directory', path: p });
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
    // tmux nimmt den Command als einzelnes letztes argv und reicht es per
    // `/bin/sh -c` weiter — dadurch funktionieren Commands mit Spaces wie
    // `claude --dangerously-skip-permissions` ohne dass wir selbst eine
    // Shell anwerfen.
    execFileSync(TMUX, ['new-session', '-d', '-s', sessionName, '-c', dir, cmd], {
      encoding: 'utf-8', timeout: 5000,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  // Poll statt setTimeout(500): schnell wenn die Session sofort da ist,
  // geduldig wenn der Kern-Boot mal länger braucht.
  for (let i = 0; i < 20; i++) {
    await sleep(40);
    const created = getTmuxSessions().find(s => s.name === sessionName);
    if (created) {
      // Erst nach bestätigtem Session-Start persistieren — sonst stünden
      // Einträge für tot-geborene Sessions in der JSON (Exit-127-Fälle aus
      // der Error-Message unten). Fehler beim Write sollen den 201 nicht
      // blockieren: der User hat eine lebende Session, Recovery-Tracking
      // ist ein Bonus.
      try {
        await knownSessions.add({ name: sessionName, directory: dir, command: cmd });
      } catch (e) {
        console.error('[known-sessions] add failed:', e);
      }
      return res.status(201).json({ ...created, preview: getSessionPreview(sessionName) });
    }
  }
  res.status(500).json({
    error: `Session "${sessionName}" wurde gestartet, aber sofort wieder beendet. Wahrscheinlich ist "${cmd}" nicht im PATH oder das Kommando beendet sich direkt.`,
  });
});

// Kill session
app.delete('/api/sessions/:name', (req, res) => {
  const { name } = req.params;
  if (!SESSION_NAME_RE.test(name)) {
    return res.status(400).json({ error: 'Invalid session name' });
  }
  try {
    execFileSync(TMUX, ['kill-session', '-t', name], { encoding: 'utf-8', timeout: 5000 });
    invalidatePreview(name);
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
    invalidatePreview(name);
    // known-sessions mitziehen, damit Restore nach Rename den neuen Namen findet.
    try { await knownSessions.rename(name, fullNewName); } catch (e) { console.error('[known-sessions] rename failed:', e); }
    res.json({ success: true, name: fullNewName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
    execFileSync(TMUX, ['new-session', '-d', '-s', name, '-c', entry.directory, entry.command], {
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

// Adopt a foreign tmux session: rename to cc-<newName>, persist to known.
// Command ist bei fremder Session unbekannt — 'claude' als Default, konsistent
// mit der Best-Effort-Adoption beim Server-Start.
app.post('/api/sessions/:name/adopt', async (req, res) => {
  const { name } = req.params;
  const { newName } = req.body;
  if (typeof name !== 'string' || !name) {
    return res.status(400).json({ error: 'Invalid source session name' });
  }
  if (typeof newName !== 'string' || !validSessionName(newName)) {
    return res.status(400).json({ error: 'Invalid new session name: letters/digits/dash/dot/underscore/spaces, 1-64 chars' });
  }
  const fullNewName = SESSION_PREFIX + newName;
  const live = getTmuxSessions();
  const source = live.find(s => s.name === name);
  if (!source) {
    return res.status(404).json({ error: 'Source session not found' });
  }
  if (live.some(s => s.name === fullNewName)) {
    return res.status(409).json({ error: 'Target session name already in use' });
  }
  try {
    execFileSync(TMUX, ['rename-session', '-t', name, fullNewName], { encoding: 'utf-8', timeout: 5000 });
    invalidatePreview(name);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
  try {
    await knownSessions.add({ name: fullNewName, directory: source.path, command: 'claude' });
  } catch (e) {
    console.error('[known-sessions] adopt persist failed:', e);
  }
  res.status(200).json({ success: true, name: fullNewName });
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

// ── WebSocket terminal ──────────────────────────────────────────────────────
// Tracking aller aktiven PTYs für Graceful Shutdown.
const activePtys = new Set();

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

  pty.onData(data => {
    if (ws.readyState === 1) {
      try { ws.send(data, { binary: true }); } catch {}
    }
  });

  pty.onExit(() => {
    activePtys.delete(pty);
    try { ws.close(); } catch {}
  });

  ws.on('message', msg => {
    try {
      const parsed = JSON.parse(msg);
      if (parsed.type === 'resize') pty.resize(parsed.cols, parsed.rows);
      else if (parsed.type === 'input') pty.write(parsed.data);
    } catch {
      pty.write(msg);
    }
  });

  ws.on('close', () => {
    activePtys.delete(pty);
    try { pty.kill(); } catch {}
  });
});

// ── Fallback to index.html (SPA routing) ─────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

// ── Start + Graceful Shutdown ───────────────────────────────────────────────
const server = app.listen(PORT, async () => {
  console.log(`\n  ⚡ Claude Code Hub running at http://localhost:${PORT}\n`);
  try {
    await knownSessions.load();
    console.log(`  ▸ known-sessions: ${knownSessions.list().length} entries loaded`);
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
});

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
  for (const p of activePtys) { try { p.kill(); } catch {} }
  server.close(() => process.exit(0));
  // Force-Exit falls server.close() hängt.
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Projekt-Discovery einmalig beim Startup. Scan-Roots sind konfigurierbar
// via PROJECT_ROOTS (comma-separated), Default: ~/Projects.
const projectRoots = (process.env.PROJECT_ROOTS || join(HOME, 'Projects'))
  .split(',').map(s => s.trim()).filter(Boolean)
  .map(p => (p === '~' || p.startsWith('~/')) ? join(HOME, p.slice(1)) : p);
discoverProjects(projectRoots)
  .then(r => console.log(`[projects] discovery: +${r.added}, total=${r.total}`))
  .catch(e => console.error('[projects] discovery failed:', e.message));
