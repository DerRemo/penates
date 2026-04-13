# tmux Session Recovery & Adoption — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistieren bekannter Hub-Sessions in `~/.claude-code-hub/sessions.json`, damit verlorene (Reboot/Kill) Sessions manuell wiederhergestellt und fremde tmux-Sessions adoptiert werden können.

**Architecture:** Neues Persistence-Modul `lib/known-sessions.js` (atomic JSON-write, In-Memory-State). `server.js` wird um Status-Berechnung in `/api/sessions` und drei neue Endpoints (`restore`, `adopt`, `DELETE known`) erweitert. Frontend rendert die Sessions in drei Sections (Aktiv / Ruhend / Fremd) im bestehenden `#sessions-grid`.

**Tech Stack:** Node.js ES Modules, Express, node:fs/promises, existing xterm.js single-file frontend. Kein neues Build-Tooling, kein neues Test-Framework.

**Spec:** `docs/superpowers/specs/2026-04-13-tmux-session-recovery-design.md`

**Testing-Hinweis:** Das Repo hat kein Test-Framework. Jede Task enthält stattdessen einen **Manual Verify**-Schritt mit konkretem Shell-Kommando + erwartetem Output. Für die Persistence-Schicht gibt's zusätzlich ein throwaway Node-REPL-Snippet.

**Git-Hinweis:** Das Projekt ist aktuell **kein Git-Repository** (`git rev-parse --is-inside-work-tree` → fatal). Die Commit-Schritte bleiben als Marker im Plan — wenn der Engineer beim Arbeiten feststellt, dass kein `.git` existiert, überspringt er die Commit-Schritte und macht weiter. Kein Plan-Blocker.

---

## File Structure

**Create:**
- `lib/known-sessions.js` — Persistence-Modul (load/save/add/remove/rename/touch/list + Status-Helper)

**Modify:**
- `server.js` — Import des neuen Moduls, Status-Enrichment in `/api/sessions`, Write-Hooks bei Create/Kill/Rename, neue Endpoints, 60s-Heartbeat-Interval
- `public/index.html` — `renderSessions()` renders drei Sections, neue CSS für `dormant`/`foreign`-Cards, Adopt-Modal, neue API-Client-Funktionen
- `todo.md` — Roadmap-Eintrag

**Data:**
- `~/.claude-code-hub/sessions.json` — zur Laufzeit angelegt, nicht im Repo

---

## Task 1: Persistence Module — Grundgerüst

**Files:**
- Create: `lib/known-sessions.js`

- [ ] **Step 1: Schreibe `lib/known-sessions.js`**

```javascript
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
import { dirname, join } from 'path';
import { homedir } from 'os';

const STORE_DIR = join(homedir(), '.claude-code-hub');
const STORE_PATH = join(STORE_DIR, 'sessions.json');

let state = { knownSessions: [] };
let loaded = false;

export async function load() {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf-8');
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
      const backup = `${STORE_PATH}.corrupt-${Date.now()}`;
      try { await fs.rename(STORE_PATH, backup); } catch {}
      console.warn(`[known-sessions] sessions.json korrupt, umbenannt nach ${backup}`);
      state = { knownSessions: [] };
    } else {
      throw err;
    }
  }
  loaded = true;
}

async function save() {
  await fs.mkdir(STORE_DIR, { recursive: true });
  const tmp = `${STORE_PATH}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf-8');
  await fs.rename(tmp, STORE_PATH);
}

function assertLoaded() {
  if (!loaded) throw new Error('known-sessions: call load() before use');
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
  } else {
    state.knownSessions.push({ name, directory, command, createdAt: now, lastSeenAt: now });
  }
  await save();
}

export async function remove(name) {
  assertLoaded();
  const before = state.knownSessions.length;
  state.knownSessions = state.knownSessions.filter(e => e.name !== name);
  if (state.knownSessions.length !== before) await save();
  return before !== state.knownSessions.length;
}

export async function rename(oldName, newName) {
  assertLoaded();
  const entry = state.knownSessions.find(e => e.name === oldName);
  if (!entry) return false;
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

// Pfad für Tests/Debug.
export const _internal = { STORE_PATH };
```

- [ ] **Step 2: Manual Verify — Persistence-Roundtrip**

Run: `cd /Users/rocky/Projects/claude-code-hub && node -e "import('./lib/known-sessions.js').then(async m => { await m.load(); await m.add({name:'cc-test',directory:'/tmp',command:'echo'}); console.log('LIST:', m.list()); await m.rename('cc-test','cc-renamed'); console.log('AFTER RENAME:', m.list()); await m.remove('cc-renamed'); console.log('AFTER REMOVE:', m.list()); })"`

Expected:
```
LIST: [ { name: 'cc-test', directory: '/tmp', command: 'echo', createdAt: '...', lastSeenAt: '...' } ]
AFTER RENAME: [ { name: 'cc-renamed', ... } ]
AFTER REMOVE: []
```

Und prüfe: `cat ~/.claude-code-hub/sessions.json` → `{ "knownSessions": [] }`.

- [ ] **Step 3: Manual Verify — Korrupte Datei wird umbenannt**

Run:
```bash
echo "not json" > ~/.claude-code-hub/sessions.json
node -e "import('./lib/known-sessions.js').then(async m => { await m.load(); console.log('STATE:', m.list()); })"
ls ~/.claude-code-hub/
```

Expected: STDERR zeigt `[known-sessions] sessions.json korrupt, umbenannt nach …`, `STATE: []`, und `ls` zeigt zusätzlich eine `sessions.json.corrupt-<ts>`-Datei. Danach noch: `rm ~/.claude-code-hub/sessions.json.corrupt-*` zum Aufräumen.

- [ ] **Step 4: Commit**

```bash
git add lib/known-sessions.js
git commit -m "feat(sessions): add persistent known-sessions store"
```

(Falls kein Git-Repo: Step überspringen und in Task 2 weitermachen.)

---

## Task 2: Server — Laden beim Start + Write-Hooks bei Create

**Files:**
- Modify: `server.js` (Imports ~Zeile 10; Startup; `POST /api/sessions` ~Zeile 247-286)

- [ ] **Step 1: Import hinzufügen**

In `server.js` nach der `getCurrentContext`-Zeile (Zeile 10) einfügen:

```javascript
import * as knownSessions from './lib/known-sessions.js';
```

- [ ] **Step 2: Beim Server-Start laden**

Ersetze den aktuellen `server.listen`-Block (Zeile 407-409):

```javascript
const server = app.listen(PORT, () => {
  console.log(`\n  ⚡ Claude Code Hub running at http://localhost:${PORT}\n`);
});
```

durch:

```javascript
const server = app.listen(PORT, async () => {
  console.log(`\n  ⚡ Claude Code Hub running at http://localhost:${PORT}\n`);
  try {
    await knownSessions.load();
    console.log(`  ▸ known-sessions: ${knownSessions.list().length} entries loaded`);
    // Best-effort Adoption: alle aktuell laufenden cc-* Sessions, die wir
    // noch nicht kennen, ins File eintragen. Der Fall tritt nach Updates
    // auf älteren Hub-Installationen auf oder wenn der User die JSON-Datei
    // manuell gelöscht hat.
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
```

- [ ] **Step 3: Create-Endpoint erweitert, um in known-sessions zu schreiben**

Im `POST /api/sessions`-Handler (die Stelle nach dem erfolgreichen `getTmuxSessions().find` im Poll-Loop, vor dem `return res.status(201)`):

Ersetze den Block:

```javascript
  for (let i = 0; i < 20; i++) {
    await sleep(40);
    const created = getTmuxSessions().find(s => s.name === sessionName);
    if (created) {
      return res.status(201).json({ ...created, preview: getSessionPreview(sessionName) });
    }
  }
```

durch:

```javascript
  for (let i = 0; i < 20; i++) {
    await sleep(40);
    const created = getTmuxSessions().find(s => s.name === sessionName);
    if (created) {
      try {
        await knownSessions.add({ name: sessionName, directory: dir, command: cmd });
      } catch (e) {
        console.error('[known-sessions] add failed:', e);
      }
      return res.status(201).json({ ...created, preview: getSessionPreview(sessionName) });
    }
  }
```

- [ ] **Step 4: Manual Verify — Neue Session landet in sessions.json**

Run:
```bash
# Hub-Prozess stoppen falls LaunchAgent läuft:
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.derremo.claude-code-hub.plist 2>/dev/null
# Frische sessions.json:
rm -f ~/.claude-code-hub/sessions.json
# Server starten:
cd /Users/rocky/Projects/claude-code-hub && npm start &
SERVER_PID=$!
sleep 1
# Session anlegen:
TOKEN=$(grep AUTH_TOKEN .env | cut -d= -f2 | tr -d '"')
curl -s -X POST http://localhost:3333/api/sessions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"recovery-test","directory":"/tmp","command":"bash"}'
echo
cat ~/.claude-code-hub/sessions.json
# Cleanup:
curl -s -X DELETE "http://localhost:3333/api/sessions/cc-recovery-test" -H "Authorization: Bearer $TOKEN"
kill $SERVER_PID
```

Expected: `sessions.json` enthält einen `cc-recovery-test`-Eintrag mit `directory:"/tmp"`, `command:"bash"`, zwei ISO-Timestamps.

- [ ] **Step 5: Commit**

```bash
git add server.js
git commit -m "feat(server): load known-sessions on start, persist new sessions"
```

---

## Task 3: Server — Status-Enrichment in `/api/sessions`

**Files:**
- Modify: `server.js` (`GET /api/sessions` ~Zeile 180-204)

- [ ] **Step 1: Status-Feld berechnen**

Ersetze den kompletten `app.get('/api/sessions', ...)`-Handler durch:

```javascript
app.get('/api/sessions', (req, res) => {
  const live = getTmuxSessions();
  const withActivity = req.query.preview !== '0';
  const liveByName = new Map(live.map(s => [s.name, s]));
  const known = knownSessions.list();
  const knownByName = new Map(known.map(e => [e.name, e]));

  // 1) running + foreign aus tmux
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

  // 2) dormant = known UND nicht in live
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

  // Enrichment: Activity + Context nur für running/foreign (dormant hat keine Pane)
  const enrich = (s) => {
    const base = withActivity && s.status !== 'dormant'
      ? { ...s, activity: detectActivity(getSessionPreview(s.name)) }
      : { ...s };
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
```

- [ ] **Step 2: Manual Verify — alle drei Status erscheinen**

Run:
```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.derremo.claude-code-hub.plist 2>/dev/null
cd /Users/rocky/Projects/claude-code-hub && npm start &
SERVER_PID=$!
sleep 1
TOKEN=$(grep AUTH_TOKEN .env | cut -d= -f2 | tr -d '"')
# Running anlegen:
curl -s -X POST http://localhost:3333/api/sessions -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"name":"status-running","directory":"/tmp","command":"bash"}' > /dev/null
# Foreign tmux-Session manuell anlegen:
/opt/homebrew/bin/tmux new-session -d -s status-foreign -c /tmp 'bash'
# Dormant simulieren: Eintrag schreiben, ohne tmux-Session:
node -e "import('./lib/known-sessions.js').then(async m => { await m.load(); await m.add({name:'cc-status-dormant',directory:'/tmp',command:'bash'}); })"
# Abfrage:
curl -s http://localhost:3333/api/sessions -H "Authorization: Bearer $TOKEN" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);for(const s of j)console.log(s.status.padEnd(8),s.name);})"
# Cleanup:
curl -s -X DELETE "http://localhost:3333/api/sessions/cc-status-running" -H "Authorization: Bearer $TOKEN"
/opt/homebrew/bin/tmux kill-session -t status-foreign
rm ~/.claude-code-hub/sessions.json
kill $SERVER_PID
```

Expected:
```
running  cc-status-running
dormant  cc-status-dormant
foreign  status-foreign
```

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat(server): add status field (running/dormant/foreign) to /api/sessions"
```

---

## Task 4: Server — Restore / Adopt / Forget Endpoints

**Files:**
- Modify: `server.js` (neue Handler nach Zeile 321, vor dem WebSocket-Block)

- [ ] **Step 1: Rename-Handler erweitern, um known-sessions nachzuziehen**

Ersetze den `app.patch('/api/sessions/:name', ...)`-Handler durch:

```javascript
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
    try { await knownSessions.rename(name, fullNewName); } catch (e) { console.error('[known-sessions] rename failed:', e); }
    res.json({ success: true, name: fullNewName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 2: Restore-Endpoint**

Nach dem PATCH-Handler einfügen:

```javascript
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
      try { await knownSessions.add({ name, directory: entry.directory, command: entry.command }); } catch {}
      return res.status(201).json({ ...created, status: 'running' });
    }
  }
  res.status(500).json({
    error: `Session "${name}" wurde gestartet, aber sofort wieder beendet. Wahrscheinlich ist "${entry.command}" nicht mehr im PATH.`,
  });
});

// Adopt a foreign tmux session: rename to cc-<newName>, persist to known.
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
    // Command ist bei fremder Session unbekannt — wir nehmen 'claude' als
    // Default. User kann die Session danach umbenennen, Command bleibt
    // beim Restore relevant, bis dahin hat er Zeit, Korrekturen zu machen.
    await knownSessions.add({ name: fullNewName, directory: source.path, command: 'claude' });
  } catch (e) {
    console.error('[known-sessions] adopt persist failed:', e);
  }
  res.status(200).json({ success: true, name: fullNewName });
});

// Forget a known-session entry (remove from JSON, tmux unaffected).
app.delete('/api/sessions/:name/known', async (req, res) => {
  const { name } = req.params;
  if (!SESSION_NAME_RE.test(name)) {
    return res.status(400).json({ error: 'Invalid session name' });
  }
  const removed = await knownSessions.remove(name);
  if (!removed) return res.status(404).json({ error: 'Not in known-sessions' });
  res.json({ success: true });
});
```

- [ ] **Step 3: Manual Verify — Restore-Flow**

Run:
```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.derremo.claude-code-hub.plist 2>/dev/null
cd /Users/rocky/Projects/claude-code-hub && npm start &
SERVER_PID=$!
sleep 1
TOKEN=$(grep AUTH_TOKEN .env | cut -d= -f2 | tr -d '"')
# Create + Kill:
curl -s -X POST http://localhost:3333/api/sessions -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"name":"restore-me","directory":"/tmp","command":"bash"}' > /dev/null
curl -s -X DELETE "http://localhost:3333/api/sessions/cc-restore-me" -H "Authorization: Bearer $TOKEN" > /dev/null
# Status should be dormant:
curl -s http://localhost:3333/api/sessions -H "Authorization: Bearer $TOKEN" | grep -o '"name":"cc-restore-me"[^}]*' | head -1
# Restore:
curl -s -X POST http://localhost:3333/api/sessions/cc-restore-me/restore -H "Authorization: Bearer $TOKEN"
echo
# tmux check:
/opt/homebrew/bin/tmux list-sessions
# Cleanup:
curl -s -X DELETE "http://localhost:3333/api/sessions/cc-restore-me" -H "Authorization: Bearer $TOKEN" > /dev/null
curl -s -X DELETE "http://localhost:3333/api/sessions/cc-restore-me/known" -H "Authorization: Bearer $TOKEN"
echo
kill $SERVER_PID
```

Expected: Zuerst `"status":"dormant"` in der Liste. Dann `201` beim Restore mit `"status":"running"`. `tmux list-sessions` zeigt `cc-restore-me`. Zum Schluss `{"success":true}` beim Forget.

- [ ] **Step 4: Manual Verify — Adopt-Flow**

Run:
```bash
cd /Users/rocky/Projects/claude-code-hub && npm start &
SERVER_PID=$!
sleep 1
TOKEN=$(grep AUTH_TOKEN .env | cut -d= -f2 | tr -d '"')
/opt/homebrew/bin/tmux new-session -d -s myforeign -c /tmp 'bash'
curl -s http://localhost:3333/api/sessions -H "Authorization: Bearer $TOKEN" | grep -o '"name":"myforeign"[^}]*' | head -1
curl -s -X POST http://localhost:3333/api/sessions/myforeign/adopt -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"newName":"imported"}'
echo
/opt/homebrew/bin/tmux list-sessions
# Cleanup:
curl -s -X DELETE "http://localhost:3333/api/sessions/cc-imported" -H "Authorization: Bearer $TOKEN" > /dev/null
curl -s -X DELETE "http://localhost:3333/api/sessions/cc-imported/known" -H "Authorization: Bearer $TOKEN" > /dev/null
kill $SERVER_PID
```

Expected: Liste zeigt `"status":"foreign"` für `myforeign`. Adopt liefert `{"success":true,"name":"cc-imported"}`. `tmux list-sessions` zeigt `cc-imported` statt `myforeign`.

- [ ] **Step 5: Manual Verify — Kill lässt known-Eintrag stehen**

Run:
```bash
cd /Users/rocky/Projects/claude-code-hub && npm start &
SERVER_PID=$!
sleep 1
TOKEN=$(grep AUTH_TOKEN .env | cut -d= -f2 | tr -d '"')
curl -s -X POST http://localhost:3333/api/sessions -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"name":"persistkill","directory":"/tmp","command":"bash"}' > /dev/null
curl -s -X DELETE "http://localhost:3333/api/sessions/cc-persistkill" -H "Authorization: Bearer $TOKEN" > /dev/null
cat ~/.claude-code-hub/sessions.json
curl -s -X DELETE "http://localhost:3333/api/sessions/cc-persistkill/known" -H "Authorization: Bearer $TOKEN" > /dev/null
kill $SERVER_PID
```

Expected: `sessions.json` enthält nach dem Kill weiterhin `cc-persistkill`. Erst nach `DELETE /known` ist er weg.

- [ ] **Step 6: Commit**

```bash
git add server.js
git commit -m "feat(server): add restore/adopt/forget endpoints for session recovery"
```

---

## Task 5: Server — 60s Heartbeat für `lastSeenAt`

**Files:**
- Modify: `server.js` (nach dem Startup-Block)

- [ ] **Step 1: Heartbeat-Interval**

Nach dem `server.listen(...)`-Block (also nach dem Startup-Callback) einfügen:

```javascript
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
```

- [ ] **Step 2: Shutdown clearen**

In der `shutdown(signal)`-Funktion ganz oben (direkt nach der Console-Log-Zeile) hinzufügen:

```javascript
  clearInterval(heartbeatTimer);
```

- [ ] **Step 3: Manual Verify**

Run:
```bash
cd /Users/rocky/Projects/claude-code-hub && npm start &
SERVER_PID=$!
sleep 1
TOKEN=$(grep AUTH_TOKEN .env | cut -d= -f2 | tr -d '"')
curl -s -X POST http://localhost:3333/api/sessions -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"name":"heartbeat-test","directory":"/tmp","command":"bash"}' > /dev/null
T1=$(node -e "console.log(JSON.parse(require('fs').readFileSync(require('os').homedir()+'/.claude-code-hub/sessions.json')).knownSessions.find(e=>e.name==='cc-heartbeat-test').lastSeenAt)")
echo "T1=$T1 — warte 65s..."
sleep 65
T2=$(node -e "console.log(JSON.parse(require('fs').readFileSync(require('os').homedir()+'/.claude-code-hub/sessions.json')).knownSessions.find(e=>e.name==='cc-heartbeat-test').lastSeenAt)")
echo "T2=$T2"
[ "$T1" != "$T2" ] && echo "✅ lastSeenAt updated" || echo "❌ NOT updated"
curl -s -X DELETE "http://localhost:3333/api/sessions/cc-heartbeat-test" -H "Authorization: Bearer $TOKEN" > /dev/null
curl -s -X DELETE "http://localhost:3333/api/sessions/cc-heartbeat-test/known" -H "Authorization: Bearer $TOKEN" > /dev/null
kill $SERVER_PID
```

Expected: `T1` und `T2` unterschiedlich, `✅ lastSeenAt updated`.

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat(server): 60s heartbeat touches lastSeenAt for running sessions"
```

---

## Task 6: Frontend — Grundgerüst für drei Sections

**Files:**
- Modify: `public/index.html` (`renderSessions()` ~Zeile 2226, CSS ~Zeile 700, neue API-Helper ~Zeile 2644)

- [ ] **Step 1: CSS für Section-Header, Dormant- und Foreign-Cards**

Nach der bestehenden `.session-card[data-attached="true"]`-Regel (~Zeile 1535) einfügen:

```css
    /* Recovery / Adoption UI ---------------------------------------------- */

    /* Section-Header zwischen Sessions-Gruppen. Klein, Monospace, Teal, mit
       dünner Trennlinie rechts daneben. Sections werden nur gerendert wenn
       sie mindestens ein Element enthalten. */
    .sessions-section-header {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 8px 0 4px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--accent, #2dd4bf);
      opacity: 0.85;
    }
    .sessions-section-header::after {
      content: '';
      flex: 1;
      height: 1px;
      background: linear-gradient(to right, rgba(45, 212, 191, 0.35), transparent);
    }
    .sessions-section-header .count {
      color: rgba(255, 255, 255, 0.45);
      font-weight: 400;
    }

    /* Dormant: ausgegraute Card, Restore-CTA. Kein Hover-Lift, kein
       Attach-Click auf der Card selbst. */
    .session-card[data-status="dormant"] {
      opacity: 0.72;
      cursor: default;
    }
    .session-card[data-status="dormant"]:hover {
      transform: none;
    }
    .session-card[data-status="dormant"]::before {
      opacity: 0.3;
    }
    .session-card[data-status="dormant"] .session-status {
      background: rgba(255, 255, 255, 0.06);
      color: rgba(255, 255, 255, 0.55);
    }
    .session-card[data-status="dormant"] .dormant-stub {
      padding: 8px 0 12px;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.55);
      font-family: 'JetBrains Mono', monospace;
      line-height: 1.5;
    }
    .session-card[data-status="dormant"] .dormant-stub .path {
      color: rgba(255, 255, 255, 0.7);
      word-break: break-all;
    }

    /* Foreign: Teal-Dashed-Border + tmux-Badge. Attach bleibt erlaubt. */
    .session-card[data-status="foreign"] {
      border-style: dashed;
      border-color: rgba(45, 212, 191, 0.5);
    }
    .session-card[data-status="foreign"] .foreign-badge {
      font-family: 'JetBrains Mono', monospace;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--accent, #2dd4bf);
      border: 1px solid rgba(45, 212, 191, 0.4);
      border-radius: 3px;
      padding: 1px 5px;
    }
```

- [ ] **Step 2: `renderSessions()` in drei Gruppen aufteilen**

Ersetze den Block ab `grid.innerHTML = filtered.map(s => {` bis zum Ende der `renderSessions()`-Funktion (Zeile 2280-2344) durch:

```javascript
      // Gruppiere nach Status — stabile Reihenfolge innerhalb jeder Gruppe.
      const byStatus = { running: [], dormant: [], foreign: [] };
      for (const s of filtered) {
        const key = s.status || 'running';
        if (byStatus[key]) byStatus[key].push(s);
      }

      const activityMap = {
        working: { cls: 'working', label: 'Arbeitet',       title: 'Claude arbeitet gerade (ESC im Terminal zum Abbrechen)' },
        waiting: { cls: 'waiting', label: 'Braucht Input',  title: 'Claude wartet auf deinen Input' },
        idle:    { cls: 'ready',   label: 'Bereit',         title: 'Claude ist bereit für den nächsten Auftrag' },
        unknown: { cls: 'unknown', label: 'Aktiv',          title: 'Session läuft, Zustand nicht erkennbar' },
      };

      const renderRunningCard = (s) => {
        const displayName = s.name.replace(/^cc-/, '');
        const age = formatAge(s.created);
        const safeName = escapeHtml(s.name);
        const act = activityMap[s.activity] || activityMap.unknown;
        const label = s.activity === 'unknown' && !s.attached ? 'Leerlauf' : act.label;
        return `
          <div class="session-card" data-status="running" data-name="${safeName}" data-attached="${s.attached}">
            <div class="session-card-header">
              <div class="session-name">
                <span class="icon">&gt;_</span>
                ${escapeHtml(displayName)}
                <span class="session-project-badge" data-project="${escapeHtml(s.projectId || '')}">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                  <span class="session-project-name">${escapeHtml(s.projectName || '')}</span>
                </span>
              </div>
              <div class="session-status ${act.cls}" title="${escapeHtml(act.title)}">${label}</div>
            </div>
            <div class="session-meta">
              <div class="session-meta-item">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                ${age}
              </div>
              <div class="session-meta-item" title="${formatContextTooltip(s)}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v6c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 11v6c0 1.66 4 3 9 3s9-1.34 9-3v-6"/></svg>
                ${formatContextPct(s.contextPct)}
              </div>
            </div>
            <div class="session-actions" data-stop-propagation>
              <button class="btn btn-ghost btn-sm" data-action="connect">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                Verbinden
              </button>
              <button class="btn btn-danger btn-sm" data-action="kill">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M18 6L6 18M6 6l12 12"/></svg>
                Beenden
              </button>
            </div>
          </div>
        `;
      };

      const renderDormantCard = (s) => {
        const displayName = s.name.replace(/^cc-/, '');
        const safeName = escapeHtml(s.name);
        const lastSeen = formatRelativeTime(s.lastSeenAt);
        return `
          <div class="session-card" data-status="dormant" data-name="${safeName}">
            <div class="session-card-header">
              <div class="session-name">
                <span class="icon">&gt;_</span>
                ${escapeHtml(displayName)}
              </div>
              <div class="session-status" title="Session ist nicht in tmux aktiv, kann wiederhergestellt werden">Ruhend</div>
            </div>
            <div class="dormant-stub">
              <div class="path">${escapeHtml(s.path || '')}</div>
              <div>$ ${escapeHtml(s.command || 'claude')}</div>
              <div>Zuletzt gesehen: ${escapeHtml(lastSeen)}</div>
            </div>
            <div class="session-actions" data-stop-propagation>
              <button class="btn btn-primary btn-sm" data-action="restore">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Wiederherstellen
              </button>
              <button class="btn btn-ghost btn-sm" data-action="forget" title="Aus der Liste entfernen">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                Vergessen
              </button>
            </div>
          </div>
        `;
      };

      const renderForeignCard = (s) => {
        const displayName = s.name;
        const safeName = escapeHtml(s.name);
        const age = formatAge(s.created);
        return `
          <div class="session-card" data-status="foreign" data-name="${safeName}">
            <div class="session-card-header">
              <div class="session-name">
                <span class="icon">&gt;_</span>
                ${escapeHtml(displayName)}
              </div>
              <span class="foreign-badge">tmux</span>
            </div>
            <div class="session-meta">
              <div class="session-meta-item">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                ${age}
              </div>
            </div>
            <div class="session-actions" data-stop-propagation>
              <button class="btn btn-primary btn-sm" data-action="adopt">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 5v14M5 12h14"/></svg>
                Adoptieren
              </button>
              <button class="btn btn-ghost btn-sm" data-action="connect">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                Verbinden
              </button>
            </div>
          </div>
        `;
      };

      const section = (label, items, renderer) => {
        if (!items.length) return '';
        const header = `<div class="sessions-section-header">${label}<span class="count">${items.length}</span></div>`;
        return header + items.map(renderer).join('');
      };

      grid.innerHTML =
        section('Aktiv', byStatus.running, renderRunningCard) +
        section('Ruhend', byStatus.dormant, renderDormantCard) +
        section('Fremd', byStatus.foreign, renderForeignCard);

      // Event-Delegation — Card-Click (nur für running) + alle Action-Buttons
      grid.querySelectorAll('.session-card').forEach(card => {
        const name = card.dataset.name;
        const status = card.dataset.status;
        if (status === 'running') {
          card.addEventListener('click', (e) => {
            if (e.target.closest('[data-stop-propagation]')) return;
            connectToSession(name);
          });
          card.querySelector('[data-action="connect"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            connectToSession(name);
          });
          card.querySelector('[data-action="kill"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            killSession(name);
          });
        } else if (status === 'dormant') {
          card.querySelector('[data-action="restore"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            restoreSession(name);
          });
          card.querySelector('[data-action="forget"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            forgetSession(name);
          });
        } else if (status === 'foreign') {
          card.querySelector('[data-action="adopt"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            openAdoptModal(name);
          });
          card.querySelector('[data-action="connect"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            connectToSession(name);
          });
        }
      });
    }
```

- [ ] **Step 3: `formatRelativeTime()`-Helper**

Suche `function formatAge(` (~Zeile 2100 Region — die genaue Location findest du per Grep). Direkt danach einfügen:

```javascript
    // Relative Zeit aus ISO-String für "zuletzt gesehen" in dormant Cards.
    function formatRelativeTime(iso) {
      if (!iso) return 'unbekannt';
      const then = Date.parse(iso);
      if (isNaN(then)) return 'unbekannt';
      const diff = Math.floor((Date.now() - then) / 1000);
      if (diff < 60) return 'gerade eben';
      if (diff < 3600) return `vor ${Math.floor(diff / 60)} min`;
      if (diff < 86400) return `vor ${Math.floor(diff / 3600)} h`;
      if (diff < 604800) return `vor ${Math.floor(diff / 86400)} Tagen`;
      return `vor ${Math.floor(diff / 604800)} Wochen`;
    }
```

- [ ] **Step 4: API-Client-Funktionen**

Suche die `killSession`-Funktion (~Zeile 2646). Direkt davor einfügen:

```javascript
    // ── Recovery / Adoption ──────────────────────────────────────
    async function restoreSession(name) {
      const displayName = name.replace(/^cc-/, '');
      try {
        const res = await fetch(`/api/sessions/${encodeURIComponent(name)}/restore`, {
          method: 'POST',
          headers: apiHeaders(),
        });
        if (res.status === 409) {
          showToast('Eine Session mit diesem Namen läuft bereits', 'error');
          return;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          showToast(body.error || 'Wiederherstellen fehlgeschlagen', 'error');
          return;
        }
        showToast(`Session "${displayName}" wiederhergestellt`, 'success');
        refreshSessions();
      } catch {
        showToast('Verbindungsfehler beim Wiederherstellen', 'error');
      }
    }

    async function forgetSession(name) {
      const displayName = name.replace(/^cc-/, '');
      if (!confirm(`Eintrag "${displayName}" aus der Liste entfernen?\n\nDie Session wird nicht gekillt (sie läuft ja nicht mehr). Restore ist danach nicht mehr möglich.`)) return;
      try {
        const res = await fetch(`/api/sessions/${encodeURIComponent(name)}/known`, {
          method: 'DELETE',
          headers: apiHeaders(),
        });
        if (!res.ok) throw new Error();
        showToast(`"${displayName}" vergessen`, 'success');
        refreshSessions();
      } catch {
        showToast('Fehler beim Vergessen', 'error');
      }
    }

    async function adoptSession(sourceName, newName) {
      try {
        const res = await fetch(`/api/sessions/${encodeURIComponent(sourceName)}/adopt`, {
          method: 'POST',
          headers: apiHeaders(),
          body: JSON.stringify({ newName }),
        });
        if (res.status === 409) {
          showToast('Ziel-Name bereits in Benutzung', 'error');
          return false;
        }
        if (res.status === 400) {
          const body = await res.json().catch(() => ({}));
          showToast(body.error || 'Ungültiger Name', 'error');
          return false;
        }
        if (!res.ok) throw new Error();
        showToast(`"${sourceName}" adoptiert als "cc-${newName}"`, 'success');
        refreshSessions();
        return true;
      } catch {
        showToast('Fehler beim Adoptieren', 'error');
        return false;
      }
    }
```

- [ ] **Step 5: Manual Verify — Frontend rendert alle drei Sections**

Run:
```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.derremo.claude-code-hub.plist 2>/dev/null
cd /Users/rocky/Projects/claude-code-hub && npm start &
SERVER_PID=$!
sleep 1
TOKEN=$(grep AUTH_TOKEN .env | cut -d= -f2 | tr -d '"')
# Drei Sessions in verschiedenen Zuständen:
curl -s -X POST http://localhost:3333/api/sessions -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"name":"ui-running","directory":"/tmp","command":"bash"}' > /dev/null
curl -s -X POST http://localhost:3333/api/sessions -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"name":"ui-dormant","directory":"/tmp","command":"bash"}' > /dev/null
curl -s -X DELETE "http://localhost:3333/api/sessions/cc-ui-dormant" -H "Authorization: Bearer $TOKEN" > /dev/null
/opt/homebrew/bin/tmux new-session -d -s ui-foreign -c /tmp 'bash'
echo "→ Öffne http://localhost:3333 im Browser und prüfe manuell:"
echo "   - Section 'AKTIV' mit cc-ui-running"
echo "   - Section 'RUHEND' mit cc-ui-dormant (ausgegraut, Wiederherstellen-Button)"
echo "   - Section 'FREMD' mit ui-foreign (Teal-Dashed-Border, tmux-Badge, Adoptieren-Button)"
echo ""
echo "Drücke Enter wenn du visuell verifiziert hast..."
read
# Cleanup:
curl -s -X DELETE "http://localhost:3333/api/sessions/cc-ui-running" -H "Authorization: Bearer $TOKEN" > /dev/null
curl -s -X DELETE "http://localhost:3333/api/sessions/cc-ui-running/known" -H "Authorization: Bearer $TOKEN" > /dev/null
curl -s -X DELETE "http://localhost:3333/api/sessions/cc-ui-dormant/known" -H "Authorization: Bearer $TOKEN" > /dev/null
/opt/homebrew/bin/tmux kill-session -t ui-foreign 2>/dev/null
kill $SERVER_PID
```

Expected: Alle drei Sections sichtbar mit korrekter Darstellung. Wiederherstellen klickbar, Adoptieren öffnet Modal (Task 7), Vergessen zeigt confirm-Dialog.

- [ ] **Step 6: Commit**

```bash
git add public/index.html
git commit -m "feat(ui): render sessions in active/dormant/foreign sections"
```

---

## Task 7: Frontend — Adopt-Modal

**Files:**
- Modify: `public/index.html` (neues Modal im DOM, neue CSS, `openAdoptModal`-Funktion)

- [ ] **Step 1: Modal-HTML einfügen**

Suche im `<body>` nach dem `new-session-modal`-Element (`<div id="new-session-modal"`). Direkt danach (als Sibling) einfügen:

```html
    <!-- Adopt-Modal: kleines Modal zum Umbenennen einer fremden tmux-Session -->
    <div id="adopt-modal" class="modal-overlay">
      <div class="modal adopt-modal">
        <div class="modal-header">
          <h2>Session adoptieren</h2>
          <button class="modal-close" onclick="closeAdoptModal()">✕</button>
        </div>
        <div class="modal-body">
          <p class="adopt-intro">
            Die fremde tmux-Session <code id="adopt-source-name"></code> wird auf
            <code>cc-&lt;name&gt;</code> umbenannt und ab sofort vom Hub verwaltet.
          </p>
          <label for="adopt-new-name">Neuer Name (ohne cc-Prefix)</label>
          <input id="adopt-new-name" type="text" class="input" autocomplete="off" />
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeAdoptModal()">Abbrechen</button>
          <button class="btn btn-primary" onclick="submitAdopt()">Adoptieren</button>
        </div>
      </div>
    </div>
```

- [ ] **Step 2: CSS für Modal-Intro**

Nach der bestehenden `.modal-body`-Regel (suche per Grep — es gibt mehrere), einfügen:

```css
    .adopt-modal .adopt-intro {
      margin: 0 0 16px;
      color: rgba(255, 255, 255, 0.7);
      line-height: 1.55;
      font-size: 14px;
    }
    .adopt-modal .adopt-intro code {
      background: rgba(45, 212, 191, 0.1);
      border: 1px solid rgba(45, 212, 191, 0.3);
      border-radius: 3px;
      padding: 1px 6px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--accent, #2dd4bf);
    }
    .adopt-modal label {
      display: block;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: rgba(255, 255, 255, 0.5);
      margin-bottom: 6px;
    }
```

- [ ] **Step 3: Open/Close/Submit-Funktionen**

Direkt nach der `adoptSession(sourceName, newName)`-Funktion (aus Task 6 Step 4) einfügen:

```javascript
    let currentAdoptSource = null;

    function openAdoptModal(sourceName) {
      currentAdoptSource = sourceName;
      document.getElementById('adopt-source-name').textContent = sourceName;
      const input = document.getElementById('adopt-new-name');
      // Default: source-Name gesäubert (nur erlaubte Zeichen, ohne cc-Prefix)
      const clean = sourceName.replace(/^cc-/, '').replace(/[^\w\-. ]/g, '-').slice(0, 64);
      input.value = clean;
      document.getElementById('adopt-modal').classList.add('open');
      setTimeout(() => { input.focus(); input.select(); }, 100);
    }

    function closeAdoptModal() {
      document.getElementById('adopt-modal').classList.remove('open');
      currentAdoptSource = null;
    }

    async function submitAdopt() {
      if (!currentAdoptSource) return;
      const newName = document.getElementById('adopt-new-name').value.trim();
      if (!newName) {
        showToast('Bitte gib einen Namen ein', 'error');
        return;
      }
      const ok = await adoptSession(currentAdoptSource, newName);
      if (ok) closeAdoptModal();
    }

    // Expose für onclick-Handler im Modal-Markup
    window.closeAdoptModal = closeAdoptModal;
    window.submitAdopt = submitAdopt;
```

- [ ] **Step 4: Manual Verify — Adopt-Modal im Browser**

Run (mit laufendem Server, wie in Task 6 Step 5):
```bash
/opt/homebrew/bin/tmux new-session -d -s adopt-test -c /tmp 'bash'
# Browser öffnen, "FREMD"-Section → Adoptieren klicken
# Modal sollte aufgehen mit Input "adopt-test" vorbelegt
# Auf "imported" ändern, Adoptieren klicken
# Session sollte jetzt in Section "AKTIV" als "cc-imported" erscheinen
# Cleanup:
```

Expected: Modal funktioniert, Rename vollzieht sich, Card wandert in „AKTIV". Bei identischem Ziel-Name Toast „Ziel-Name bereits in Benutzung".

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -m "feat(ui): adopt modal for foreign tmux sessions"
```

---

## Task 8: Empty-State-Handling bei leerem AKTIV + vollen Dormant/Foreign

**Files:**
- Modify: `public/index.html` (Empty-State-Block in `renderSessions` ~Zeile 2242-2268)

- [ ] **Step 1: Empty-State nur anzeigen, wenn wirklich alles leer**

Suche in `renderSessions()` den Block `if (filtered.length === 0) { ... }`. Ersetze den Check durch:

```javascript
      // Empty-State nur, wenn wirklich 0 Cards in allen 3 Kategorien.
      // Wenn z.B. nur Ruhende existieren, sollen die normal gerendert werden.
      if (filtered.length === 0) {
        grid.innerHTML = '';
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.style.gridColumn = '1 / -1';
        if (sessions.length > 0 && q) {
          empty.innerHTML = `
            <div class="empty-state-icon">⌕</div>
            <h3>Keine Treffer</h3>
            <p>Kein Session-Name matcht "${escapeHtml(q)}".</p>
          `;
        } else {
          empty.innerHTML = `
            <div class="empty-state-icon">&gt;_</div>
            <h3>Keine aktiven Sessions</h3>
            <p>Starte eine neue Claude Code Session um loszulegen.</p>
            <button class="btn btn-primary" data-action="new-session">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M12 5v14M5 12h14"/></svg>
              Neue Session
            </button>
          `;
        }
        grid.appendChild(empty);
        const newBtn = empty.querySelector('[data-action="new-session"]');
        if (newBtn) newBtn.addEventListener('click', openNewSessionModal);
        return;
      }
```

(Diese Logik ist bereits korrekt — `filtered.length === 0` bedeutet 0 Cards egal welcher Status. Der Empty-State triggert also nur noch, wenn es wirklich nichts zu zeigen gibt. Keine Änderung nötig, aber dieser Task-Step dokumentiert das Verhalten und ist der Check, dass man nichts übersehen hat.)

- [ ] **Step 2: Manual Verify — Mit nur dormanten Sessions**

Run:
```bash
# Frischer Zustand: alle tmux-Sessions beenden, nur dormant-Eintrag
/opt/homebrew/bin/tmux kill-server 2>/dev/null
cd /Users/rocky/Projects/claude-code-hub
node -e "import('./lib/known-sessions.js').then(async m => { await m.load(); await m.add({name:'cc-only-dormant',directory:'/tmp',command:'bash'}); })"
npm start &
SERVER_PID=$!
sleep 1
echo "→ Browser öffnen: http://localhost:3333"
echo "   Erwartung: nur Section RUHEND sichtbar, kein Empty-State."
read
rm ~/.claude-code-hub/sessions.json
kill $SERVER_PID
```

Expected: Section-Header „RUHEND" mit der einen Card, kein globaler Empty-State sichtbar.

- [ ] **Step 3: Commit** (falls Änderungen)

```bash
git add public/index.html
git commit -m "test: verify empty-state behavior with only dormant/foreign sessions"
```

(Wahrscheinlich nichts zu committen — Task 8 ist ein Verification-Pass.)

---

## Task 9: Design-Polish mit frontend-design-Skill

**Files:**
- Modify: `public/index.html` (CSS-Feintuning)

- [ ] **Step 1: frontend-design-Skill einsetzen**

Invoke `frontend-design:frontend-design` mit folgendem Briefing:

> „In `public/index.html` sind drei neue Session-Card-Varianten hinzugekommen (`data-status="dormant"` und `data-status="foreign"`) plus Section-Header (`.sessions-section-header`). Siehe Task 6 des Plans für die initiale CSS-Implementation. Bitte verfeinere die visuelle Umsetzung — **ohne die HTML-Struktur zu ändern**:
>
> 1. Section-Header: Typography, Spacing, Trenn-Linie, Count-Badge-Styling
> 2. Dormant-Card: Opacity-Level, Stub-Typography, Restore-Button als primäres CTA visuell hervorheben
> 3. Foreign-Card: Dashed-Border-Style + Hover-State, tmux-Badge-Position und -Größe, Adopt-Button-Hierarchie
> 4. Transitions/Hover-States konsistent mit den bestehenden aktiven Cards
>
> Design-System: Dark Theme, Teal-Akzent #2dd4bf, JetBrains Mono für Code, DM Sans für UI. Orientier dich an den bestehenden `.session-card`-Regeln in der Datei. Kein Build-Step, reines inline-CSS."

- [ ] **Step 2: Manual Verify — Visuell im Browser**

Same Setup wie Task 6 Step 5. Prüfe Desktop + Mobile (iPhone-Viewport in DevTools).

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "style: polish recovery/adoption UI"
```

---

## Task 10: Regression-Suite + Docs-Update

**Files:**
- Modify: `todo.md`

- [ ] **Step 1: Playwright-Regression ad-hoc**

Falls die Mobile-Regression-Suite (`/tmp/pw-test/suite.mjs` laut `todo.md`) noch existiert, um einen Check erweitern; sonst minimale Ad-hoc-Suite bauen:

```javascript
// /tmp/pw-test/recovery.mjs
import { chromium } from 'playwright';
const TOKEN = process.env.HUB_TOKEN;
const b = await chromium.launch();
const ctx = await b.newContext();
await ctx.addInitScript(t => localStorage.setItem('cchub_token', t), TOKEN);
const p = await ctx.newPage();
await p.goto('http://localhost:3333');
await p.waitForSelector('.sessions-section-header', { timeout: 5000 });
const sections = await p.$$eval('.sessions-section-header', els => els.map(e => e.textContent));
console.log('Sections:', sections);
if (!sections.length) throw new Error('No sections rendered');
await b.close();
```

Run:
```bash
cd /Users/rocky/Projects/claude-code-hub
# Setup mit 3 States wie in Task 6 Step 5
# ...
HUB_TOKEN=$(grep AUTH_TOKEN .env | cut -d= -f2 | tr -d '"') node /tmp/pw-test/recovery.mjs
```

Expected: `Sections: [ 'Aktiv...', 'Ruhend...', 'Fremd...' ]`.

- [ ] **Step 2: todo.md aktualisieren**

Öffne `todo.md` und ergänze unter dem bestehenden P0-Block einen neuen Eintrag (oder verschiebe unter „erledigt"/„P1" je nach aktueller Roadmap-Position):

```markdown
- [x] **Session-Recovery & Adoption** — 2026-04-13
  - `~/.claude-code-hub/sessions.json` persistiert Name/cwd/Command/Timestamps
    aller jemals vom Hub erstellten oder adoptierten Sessions. Atomare Writes,
    Laden beim Server-Start, 60s-Heartbeat updated `lastSeenAt`.
  - `/api/sessions` liefert `status`-Feld: `running` / `dormant` / `foreign`.
  - Drei neue Endpoints: `POST /api/sessions/:name/restore`,
    `POST /api/sessions/:name/adopt` (mit `newName`), `DELETE /api/sessions/:name/known`.
  - UI: Sessions-Tab rendert drei Sections (AKTIV / RUHEND / FREMD). Ruhende Cards
    mit Restore-CTA und „Vergessen"-Icon; fremde Cards mit Dashed-Border,
    `tmux`-Badge und Adopt-Modal.
  - Kill lässt den Known-Eintrag stehen — „komplett weg" erfordert zusätzlich
    `DELETE /known` (oder Klick auf „Vergessen" in der UI).
  - `cc-*`-Sessions, die beim Start nicht in `knownSessions` stehen, werden
    best-effort mit `command: "claude"` nachgetragen.
```

- [ ] **Step 3: LaunchAgent neu starten**

```bash
launchctl kickstart -k gui/$(id -u)/com.derremo.claude-code-hub
```

Danach manueller Smoke-Test: `https://code.derremo.xyz` (oder `http://localhost:3333`) laden, Session erstellen, killen, in Ruhend sehen, wiederherstellen.

- [ ] **Step 4: Final Commit**

```bash
git add todo.md
git commit -m "docs(todo): mark session-recovery & adoption as done"
```

---

## Self-Review (vom Autor, vor Handoff)

**Spec coverage:**

| Spec-Section | Task |
|---|---|
| Datenmodell `sessions.json` | Task 1 |
| Atomare Writes | Task 1 Step 1 |
| Lese beim Start + best-effort Adoption | Task 2 Step 2 |
| Status-Berechnung | Task 3 |
| POST `/restore` | Task 4 Step 2 |
| POST `/adopt` | Task 4 Step 2 |
| DELETE `/known` | Task 4 Step 2 |
| Kill lässt known-Eintrag stehen | Implizit — DELETE-Handler wurde NICHT verändert, `known`-Cleanup separat. Verifiziert in Task 4 Step 5. |
| Rename zieht known-Eintrag nach | Task 4 Step 1 |
| 60s-Heartbeat `lastSeenAt` | Task 5 |
| UI: drei Sections | Task 6 |
| UI: Dormant-Card Geometrie + CTA | Task 6 Step 1-2 |
| UI: Foreign-Card Dashed + Adopt-Modal | Task 6 + Task 7 |
| Empty-State bei leerem AKTIV mit vollen anderen | Task 8 |
| Visueller Polish | Task 9 |
| Korrupte sessions.json → Backup | Task 1 Step 3 |
| todo.md-Eintrag | Task 10 Step 2 |

Vollständig abgedeckt.

**Placeholder-Scan:** keine TBD/TODO-Marker. Alle Code-Blöcke sind konkret.

**Typ-Konsistenz:**
- `add({name, directory, command})` — konsistent in Task 1, 2, 4
- `find(name)` → `entry` — konsistent in Task 4 Step 2
- `remove(name)` → boolean — konsistent in Task 4 Step 2
- `touchMany(names[])` — nur in Task 1 + Task 5
- Frontend: `restoreSession`, `forgetSession`, `adoptSession`, `openAdoptModal` — konsistent zwischen Definition (Task 6 Step 4 / Task 7 Step 3) und Aufruf (Task 6 Step 2).
- Status-Strings `running`/`dormant`/`foreign` — konsistent Server (Task 3) ↔ Frontend (Task 6).

Keine Inkonsistenzen gefunden.
