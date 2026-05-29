import { execFileSync } from 'child_process';

const TMUX = process.env.TMUX_PATH || (() => {
  try {
    return execFileSync('/usr/bin/which', ['tmux'], { encoding: 'utf8', timeout: 3_000 }).trim();
  } catch {
    return '/opt/homebrew/bin/tmux';
  }
})();

export default async function globalTeardown() {
  try {
    const output = execFileSync(TMUX, ['list-sessions', '-F', '#{session_name}'], {
      encoding: 'utf8',
      timeout: 5_000,
    });

    const testSessions = output
      .split('\n')
      .filter(Boolean)
      .filter(name => name.startsWith('cc-test-') || name.startsWith('moshi-e2e-'));

    for (const name of testSessions) {
      try {
        execFileSync(TMUX, ['kill-session', '-t', name], { timeout: 5_000 });
        console.log(`[global-teardown] killed leftover session: ${name}`);
      } catch {}
    }

    if (testSessions.length > 0) {
      console.log(`[global-teardown] cleaned up ${testSessions.length} leftover test session(s)`);
    }
  } catch {
    // tmux not running or no sessions — that's fine
  }
}
