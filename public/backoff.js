// Reconnect-Backoff: Base 1s, Faktor 2, Cap 20s, ±20% Jitter. attempt ist 0-basiert.
// rand ist injizierbar für deterministische Tests (default Math.random).
// Geteiltes Modul: public/index.html importiert nextBackoffMs hieraus (kein
// Inline-Mirror mehr); node:test deckt public/backoff.test.js daneben ab.
export function nextBackoffMs(attempt, rand = Math.random) {
  const base = Math.min(1000 * 2 ** attempt, 20000);
  const jitter = base * 0.2;
  return Math.round(base - jitter + rand() * 2 * jitter);
}
