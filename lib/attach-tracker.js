// lib/attach-tracker.js
// Verfolgt, welche Sessions GERADE vom Hub selbst attached sind (per WebSocket-
// Terminal). Zweck: unterscheiden, ob ein tmux-`attached`-Flag vom Hub kommt
// oder von einem Fremd-Client (z.B. Moshi per SSH/Mosh). Meldet tmux eine
// Session als attached, hält der Hub aber keinen eigenen Attach, schaut ein
// Fremd-Client zu → Hub-Push für diese Session unterdrücken (keine Doppel-
// Notification aufs Handy).

const hubAttached = new Map(); // sessionName -> count (mehrere Tabs möglich)

export function noteAttach(name) {
  if (!name) return;
  hubAttached.set(name, (hubAttached.get(name) || 0) + 1);
}

export function noteDetach(name) {
  if (!name) return;
  const n = (hubAttached.get(name) || 0) - 1;
  if (n <= 0) hubAttached.delete(name);
  else hubAttached.set(name, n);
}

export function hubAttachedCount(name) {
  return hubAttached.get(name) || 0;
}

// Reine Entscheidungslogik (ohne tmux-Zugriff, daher unit-testbar): ein
// Fremd-Client ist attached, wenn tmux die Session als attached meldet, der
// Hub aber keinen eigenen Attach hält.
export function shouldSuppressForForeignClient(tmuxAttached, hubCount) {
  return !!tmuxAttached && (hubCount || 0) === 0;
}

// Testhilfe: State zurücksetzen.
export function _reset() {
  hubAttached.clear();
}
