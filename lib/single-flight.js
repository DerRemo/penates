// TTL-Cache mit In-Flight-Dedup (single-flight). Schließt den Thundering-Herd:
// das `await` zwischen Staleness-Check und Cache-Assignment yieldet den Event-
// Loop, sodass N parallele Caller im Cold-Window sonst ALLE den teuren Build
// starten. Hier teilen sie sich EINEN laufenden Build.
//
//   const cache = createTtlCache(5000);
//   const val = await cache.get(() => expensiveAsync());     // key '' (default)
//   const val = await cache.get(build, { key: `days=${d}` }); // pro-Key getrennt
//   const val = await cache.get(build, { force: true });      // TTL umgehen (refresh)
//   cache.invalidate();        // alles
//   cache.invalidate('days=7') // nur diesen Key
//
// build()-Fehler vergiften den Cache nicht (Eintrag bleibt unverändert) und
// räumen den In-Flight-Slot ab → der nächste Caller versucht es erneut.
export function createTtlCache(ttlMs, { now = () => Date.now() } = {}) {
  const entries = new Map(); // key → { val, ts }
  const pending = new Map(); // key → Promise

  return {
    get(build, { key = '', force = false } = {}) {
      const e = entries.get(key);
      if (!force && e && now() - e.ts < ttlMs) return Promise.resolve(e.val);
      const inflight = pending.get(key);
      if (inflight) return inflight;
      const p = Promise.resolve()
        .then(build)
        .then((val) => { entries.set(key, { val, ts: now() }); return val; })
        .finally(() => { if (pending.get(key) === p) pending.delete(key); });
      pending.set(key, p);
      return p;
    },
    invalidate(key) {
      if (key === undefined) { entries.clear(); return; }
      entries.delete(key);
    },
    peek(key = '') { return entries.get(key); },
  };
}
