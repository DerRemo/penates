// Attention-Engine für Penates — Hook-only.
//
// Claude Code feuert ~/.claude/settings.json Hooks (Stop / Notification /
// UserPromptSubmit / SubagentStop / SessionStart / SessionEnd) an den Hub-
// Endpoint /api/hooks/:event. Dieses Modul hält pro Session den daraus
// abgeleiteten Zustand, broadcastet Badge- und Notification-Events an die
// WS-Consumer, und beantwortet `getHookActivity(name)` für den Session-
// List-Endpoint.
//
// Kein Poll-Loop, kein Regex-Parser mehr. Sessions ohne Hook-Config
// (z.B. fremde tmux-Sessions oder pre-Upgrade-Sessions) erscheinen im
// Dashboard als activity:`unknown` → Label "Aktiv".
//
// Event-Pfade:
//
//  - `session-activity` — reiner State-Update, feuert bei JEDEM Hook das
//    den Activity-Wert ändert. Frontend patcht darauf die Badge inline,
//    unabhängig von attached/muted. Dashboard spiegelt damit auch
//    Sessions wider die gerade jemand aktiv im Terminal benutzt.
//
//  - `session-attention` — Notification-wert: feuert bei Stop oder
//    Notification, nicht muted, außerhalb Cool-Down. Die Frage "schaut der
//    User gerade zu?" wird per Device-Presence in der Push-Delivery-Schicht
//    entschieden — nicht hier. Triggert Sound/Flash/Unread im Frontend.
//
// Cool-Down (HOOK_COOLDOWN_MS) gilt nur für `session-attention`, nicht für
// `session-activity` — Badges sollen immer sofort stimmen.
//
// HOOK_FRESH_MS: getHookActivity liefert nur State zurück, der jünger als
// diese Schwelle ist. Läuft der Hook-Kanal aus (Claude-Crash o.ä.), fällt
// das Session-List-Endpoint auf `unknown` zurück statt einen veralteten
// Wert zu zeigen. Sobald ein neuer Hook kommt, ist alles wieder frisch.

const HOOK_COOLDOWN_MS = 10_000;
const HOOK_FRESH_MS    = 60_000;

// Per-Session State:
//   { activity, attached, lastHookAt, lastNotifiedAt, tool }
const states = new Map();

// Subscriber-Callbacks für alle Broadcasts.
const listeners = new Set();

// Mute-Checker: Callback vom Server, liefert per Session-Name true/false.
let muteChecker = () => false;

function broadcast(event) {
  for (const fn of listeners) {
    try { fn(event); } catch (e) { console.error('[attention] listener:', e); }
  }
}

// Event → Activity-Mapping. `idle` entspricht dem "Bereit"-Zustand im
// bestehenden Frontend-Vokabular, `waiting` ist "Braucht Input".
const HOOK_EVENT_ACTIVITY = {
  UserPromptSubmit: 'working',
  Stop: 'idle',
  SubagentStop: 'idle',
  Notification: 'waiting',
};

// Hauptpfad: Claude meldet per HTTP-POST seinen Zustand.
//   - UserPromptSubmit → working, session-activity.
//   - Stop/SubagentStop → idle, session-activity + ggf. session-attention.
//   - Notification → waiting, session-activity + ggf. session-attention.
//   - SessionStart → State-Init, kein Broadcast.
//   - SessionEnd → forget.
//
// `attached` kann vom Caller optional mitgegeben werden (z.B. über einen
// Lookup im Hook-Endpoint), default false. Default-false ist konservativ
// notification-freundlich: unbekannt-attached → lieber benachrichtigen.
export function reportHookEvent(name, event, _payload = {}, now = Date.now()) {
  if (event === 'SessionEnd') {
    broadcast({ type: 'session-ended', name, at: now });
    states.delete(name);
    return;
  }

  let prev = states.get(name);
  if (!prev) {
    prev = {
      activity: 'unknown',
      attached: false,
      lastHookAt: now,
      lastNotifiedAt: -Infinity,
    };
    states.set(name, prev);
  }

  if (event === 'SessionStart') {
    prev.lastHookAt = now;
    return;
  }

  const activity = HOOK_EVENT_ACTIVITY[event];
  if (!activity) return;

  prev.activity = activity;
  prev.tool = null;
  prev.lastHookAt = now;

  // Reiner State-Update für Badge-Patch. Feuert immer.
  broadcast({ type: 'session-activity', name, activity, at: now });

  // Notification-Pfad: nur Stop/Notification sind Alarm-würdig.
  // Suppression nach "User schaut zu" lebt jetzt in der Push-Delivery-Schicht
  // (per Device-Presence). Hier feuern wir unabhängig davon.
  if (event === 'UserPromptSubmit') return;
  if (muteChecker(name)) return;
  if (now - prev.lastNotifiedAt < HOOK_COOLDOWN_MS) return;

  prev.lastNotifiedAt = now;
  broadcast({ type: 'session-attention', name, activity, at: now });
}

// Granulare Tool-Activity (Spec 1.1): PreToolUse → reportToolStart, PostToolUse
// → reportToolEnd. Reiner session-activity-Broadcast (kein attention/Push),
// modus-unabhängig — das Dashboard zeigt "läuft: <tool>".
export function reportToolStart(name, tool, now = Date.now()) {
  let prev = states.get(name);
  if (!prev) {
    prev = { activity: 'working', attached: false, lastHookAt: now, lastNotifiedAt: -Infinity };
    states.set(name, prev);
  }
  prev.activity = 'working';
  prev.tool = tool;
  prev.lastHookAt = now;
  broadcast({ type: 'session-activity', name, activity: 'working', tool, at: now });
}

export function reportToolEnd(name, now = Date.now()) {
  const prev = states.get(name);
  if (!prev) return;
  prev.tool = null;
  prev.lastHookAt = now;
  broadcast({ type: 'session-activity', name, activity: prev.activity || 'working', at: now });
}

// Aktuelles Tool einer Session (oder null), für Session-List-Enrichment.
export function getHookTool(name, now = Date.now()) {
  const s = states.get(name);
  if (!s || !s.tool) return null;
  if (now - s.lastHookAt >= HOOK_FRESH_MS) return null;
  return s.tool;
}

// Setzt per-Session den bekannten attached-Flag. Wird vom Session-List-
// Endpoint aufgerufen, damit der Hook-Broadcast wissen kann, ob der User
// gerade zuschaut. Ohne diesen Call bleibt der Default bei false.
export function setAttached(name, attached) {
  const prev = states.get(name);
  if (!prev) return;
  prev.attached = !!attached;
}

// Liefert die aktuelle activity einer Session, wenn sie jünger als
// HOOK_FRESH_MS ist. Sonst null — Caller zeigt `unknown` an.
export function getHookActivity(name, now = Date.now()) {
  const s = states.get(name);
  if (!s) return null;
  if (now - s.lastHookAt >= HOOK_FRESH_MS) return null;
  return s.activity;
}

// Rename: State-Eintrag auf neuen Namen umschlüsseln.
export function rename(oldName, newName) {
  if (oldName === newName) return;
  const s = states.get(oldName);
  if (!s) return;
  states.delete(oldName);
  states.set(newName, s);
}

// Session aus dem State entfernen (Kill, Tod, SessionEnd).
export function forget(name) {
  if (!states.delete(name)) return;
  broadcast({ type: 'session-ended', name, at: Date.now() });
}

// Registrierung des Mute-Checkers beim Server-Start.
export function setMuteChecker(fn) {
  muteChecker = typeof fn === 'function' ? fn : () => false;
}

export function subscribe(fn) {
  listeners.add(fn);
}

export function unsubscribe(fn) {
  listeners.delete(fn);
}

// Stop + Reset für Tests und Shutdown.
export function stop() {
  states.clear();
  listeners.clear();
  muteChecker = () => false;
}

// Debug-Hook für Tests.
export function _debugState() {
  return {
    sessions: Array.from(states.entries()).map(([name, s]) => ({ name, ...s })),
    listenerCount: listeners.size,
  };
}
