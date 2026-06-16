// lib/session-restore.js
// Reine Planungsfunktion für den Boot-Auto-Restore (tmux-continuum nativ).
// Kein FS, kein tmux, kein Date.now() → voll deterministisch testbar.
//
// Der Aufrufer (server.js Boot-Block) reicht knownSessions.list() + die Namen
// der aktuell laufenden tmux-Sessions + das continue-Setting; das Ergebnis ist
// die sequenziell abzuarbeitende Respawn-Liste. Die Spawn-Seiteneffekte (tmux,
// known-sessions.add) bleiben in server.js — hier nur die Entscheidung WAS
// respawnt wird und MIT WELCHEM Command.

import { continueCommand } from '../public/clis.js';

// Recency-Fenster für den Auto-Restore: dormant Sessions, die länger als das
// nicht mehr live waren (lastSeenAt), werden beim Boot NICHT mehr auto-restauriert
// (bleiben aber dormant fürs manuelle Restore). Verhindert das Hochfahren von
// Karteileichen, deren CLI längst natürlich beendet wurde.
export const RESTORE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// known: Array von { name, directory, command, manuallyStopped? } (= knownSessions.list()).
// liveNames: string[] der laufenden tmux-Sessions.
// continueEnabled: bool — --continue vs. Frischstart.
// → [{ name, directory, command }] in Eingabereihenfolge.
export function planAutoRestore({ known = [], liveNames = [], continueEnabled = true, now = Date.now(), maxAgeMs = RESTORE_MAX_AGE_MS } = {}) {
  const live = new Set(liveNames);
  const plan = [];
  for (const entry of known) {
    if (live.has(entry.name)) continue;          // live → kein Respawn (Hub-Restart-No-Op)
    if (entry.manuallyStopped === true) continue; // bewusst gekillt → nicht auto-restaurieren
    // Recency-Gate: nur überspringen, wenn lastSeenAt vorhanden, parsebar UND zu alt.
    // Fehlende/kaputte lastSeenAt → restaurieren (kein Surprise-Drop von Alt-Einträgen).
    const ts = Date.parse(entry.lastSeenAt);
    if (Number.isFinite(ts) && now - ts > maxAgeMs) continue;
    const command = continueEnabled
      ? (continueCommand(entry.command) ?? entry.command)
      : entry.command;
    plan.push({ name: entry.name, directory: entry.directory, command });
  }
  return plan;
}
