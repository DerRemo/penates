// tmux Befehls-Konstruktion + Output-Parsing (Express-frei, unit-testbar).
// Die execFileSync-Aufrufe selbst bleiben dünn in server.js; hier liegt die
// fehleranfällige, sicherheitsrelevante Logik:
//   - das list-sessions-Format + sein Parser (pane_current_path kann ein '|'
//     enthalten, ist aber das letzte Feld → die ersten 4 destructuren, Rest
//     rejoinen, sonst wird der cwd am ersten '|' abgeschnitten);
//   - die new-session-Argv (argv-Array, kein Shell-String → keine Injection).

export const LIST_FORMAT =
  '#{session_name}|#{session_created}|#{session_windows}|#{session_attached}|#{pane_current_path}';

export function parseTmuxSessions(raw) {
  const output = (raw || '').trim();
  if (!output) return [];
  return output.split('\n').map((line) => {
    const [name, created, windows, attached, ...rest] = line.split('|');
    return {
      name,
      created: parseInt(created) * 1000,
      windows: parseInt(windows),
      attached: parseInt(attached) > 0,
      path: rest.join('|') || '~',
    };
  });
}

export function buildSpawnArgs({ sessionName, envArgs = [], dir, shellCmd }) {
  return ['new-session', '-d', '-s', sessionName, ...envArgs, '-c', dir, shellCmd];
}
