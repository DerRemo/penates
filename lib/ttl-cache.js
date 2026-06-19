// Kleiner SYNCHRONER TTL-Memoizer für teure, argument-lose Producer (z.B.
// blockierende execFileSync-Scans wie tmux list-sessions oder lsof). get()
// liefert den zuletzt produzierten Wert, solange er jünger als ttlMs ist, sonst
// ruft es den Producer neu. invalidate() erzwingt den nächsten Refresh (nach
// Mutationen). now() ist injizierbar für deterministische Tests. Ersetzt das
// mehrfach inline kopierte { ts, val }-Cache-Idiom (cachedListeningPorts, …).
//
// Bewusst getrennt vom async, keyed createTtlCache in single-flight.js: dessen
// get() liefert ein Promise und würde alle synchronen Call-Sites (Express-
// Handler, Status-Literale) zu await zwingen. Hier bleibt alles synchron.
export function createSyncTtlCache(producer, ttlMs, now = Date.now) {
  let cached = { ts: -Infinity, val: undefined };
  return {
    get() {
      const t = now();
      if (t - cached.ts < ttlMs) return cached.val;
      cached = { ts: t, val: producer() };
      return cached.val;
    },
    invalidate() {
      cached = { ts: -Infinity, val: undefined };
    },
  };
}
