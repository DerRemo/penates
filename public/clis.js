// Einzige Quelle der Wahrheit für die vom Hub unterstützten Coding-CLIs.
// Browser-import (Picker + Card-Icon) UND node:test-import. Reines Daten-/
// Funktionsmodul, kein DOM. Flags verifiziert Stand 2026-05 (siehe Spec).
// `command` bleibt Source of Truth — der CLI-Typ wird daraus abgeleitet.

export const CLIS = [
  {
    id: 'claude', label: 'Claude', binary: 'claude', color: '#d97757',
    variants: [
      { label: 'Standard', command: 'claude' },
      { label: 'Dangerous (skip permissions)', command: 'claude --dangerously-skip-permissions' },
    ],
  },
  {
    id: 'codex', label: 'Codex', binary: 'codex', color: '#10a37f',
    variants: [
      { label: 'Standard', command: 'codex' },
      { label: 'Full-Auto', command: 'codex --full-auto' },
      { label: 'YOLO (bypass)', command: 'codex --yolo' },
    ],
  },
  {
    id: 'gemini', label: 'Gemini', binary: 'gemini', color: '#4285f4',
    variants: [
      { label: 'Standard', command: 'gemini' },
      { label: 'Auto-Edit', command: 'gemini --approval-mode auto_edit' },
      { label: 'YOLO', command: 'gemini --yolo' },
    ],
  },
];

// Leitet die CLI-id aus dem Command-String ab: erstes Token nehmen, einen
// Pfad-Anteil via Basename strippen, gegen CLIS[].binary matchen. Unbekannt
// oder leer → null.
export function cliFromCommand(cmd) {
  if (!cmd || typeof cmd !== 'string') return null;
  const first = cmd.trim().split(/\s+/)[0];
  if (!first) return null;
  const bin = first.split('/').pop();
  const hit = CLIS.find(c => c.binary === bin);
  return hit ? hit.id : null;
}
