// Reiner Helper: leitet die Shell-Counts (Brand-Subtitle, Live-Summary,
// Nav-/Sub-Toolbar-Counts) aus dem Sessions-Array von refreshSessions() ab.
// status ∈ running|dormant|foreign ; activity ∈ working|waiting|idle|unknown.
export function deriveShellCounts(sessions) {
  const c = { total: 0, active: 0, dormant: 0, working: 0, waiting: 0, idle: 0, unknown: 0 };
  for (const s of sessions || []) {
    c.total++;
    if (s && s.status === 'dormant') { c.dormant++; continue; }
    c.active++;
    switch (s && s.activity) {
      case 'working': c.working++; break;
      case 'waiting': c.waiting++; break;
      case 'idle':    c.idle++;    break;
      default:        c.unknown++; break;
    }
  }
  return c;
}
