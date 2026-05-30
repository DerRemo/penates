// tmux-Scrollback-Capture. Express-frei, unit-testbar. Argv-Array → kein Shell-Interp.
import { execFileSync } from 'node:child_process';

// capture-pane -S -<lines> -E -1 = History OBERHALB des sichtbaren Panes (nicht der
// aktuelle Screen — den zeichnet gleich `tmux attach`). -e behält Farben/Escapes.
export function captureScrollback(sessionName, opts = {}) {
  const lines = Math.max(1, Math.min(opts.lines ?? 2000, 10000));
  const tmux = opts.tmux || process.env.TMUX_PATH || 'tmux';
  try {
    return execFileSync(
      tmux,
      ['capture-pane', '-p', '-e', '-S', `-${lines}`, '-E', '-1', '-t', sessionName],
      { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }
    );
  } catch {
    return '';
  }
}
