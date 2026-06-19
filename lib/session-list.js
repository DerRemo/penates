// Komposition der GET /api/sessions-Antwort (Express-frei, unit-testbar).
// Klassifiziert live-tmux + known-sessions zu running/foreign/dormant und
// reichert jede Session an (Activity/Cost/Context/Mute/Pin/Git/Projekt/Board-
// Karte/Command). Alle Laufzeit-Quellen sind injiziert → reine, testbare
// Kompositionslogik; server.js reicht die echten Funktionen rein
// (attention/usageLimits/getCurrentContext/getGitStatus/board/…).
//
//   running + foreign  ← tmux live  (foreign = läuft in tmux, aber weder
//                        cc-prefixed noch in known-sessions)
//   dormant            ← known-sessions ohne lebende tmux-Pane
export function composeSessions({
  live,
  known,
  sessionPrefix,
  projects,
  getHookActivity,
  getStatusline,
  getContext,
  getGitStatus,
  isMuted,
  isPinned,
  findBoardCard,
}) {
  const liveByName = new Map(live.map((s) => [s.name, s]));
  const knownByName = new Map(known.map((e) => [e.name, e]));

  const running = [];
  const foreign = [];
  for (const s of live) {
    const isKnown = knownByName.has(s.name);
    const isCcPrefixed = s.name.startsWith(sessionPrefix);
    if (isKnown || isCcPrefixed) running.push({ ...s, status: 'running' });
    else foreign.push({ ...s, status: 'foreign' });
  }

  const dormant = known
    .filter((e) => !liveByName.has(e.name))
    .map((e) => ({
      name: e.name,
      path: e.directory,
      command: e.command,
      created: e.createdAt ? Date.parse(e.createdAt) : null,
      lastSeenAt: e.lastSeenAt,
      windows: 0,
      attached: false,
      status: 'dormant',
    }));

  // Overview-Projekt-Badge: cwd → Projekt-Registry-Match (exakt oder Unterordner).
  const projectOf = (cwd) => {
    if (!cwd) return null;
    const m = projects.find((p) => cwd === p.path || cwd.startsWith(p.path + '/'));
    return m ? { id: m.id, name: m.displayName } : null;
  };

  const enrich = (s) => {
    const hookActivity = getHookActivity(s.name);
    const sl = getStatusline(s.name);
    const base = {
      ...s,
      activity: hookActivity || 'unknown',
      cost: sl
        ? { totalUsd: sl.costUsd, durationMs: sl.durationMs, linesAdded: sl.linesAdded, linesRemoved: sl.linesRemoved }
        : null,
    };
    // Context-Anzeige: Claudes eigener Statusline-Wert (context_window.used_percentage)
    // ist autoritativ — bevorzugen solange frisch; nur ohne frischen Statusline-Wert
    // (dormant, alte Claude-Version) auf die JSONL-Schätzung zurückfallen.
    if (sl && sl.contextPct != null) {
      base.contextPct = sl.contextPct;
      base.contextLimit = sl.contextSize ?? null;
      base.contextTokens = sl.contextSize != null ? Math.round((sl.contextSize * sl.contextPct) / 100) : null;
      base.contextModel = sl.model ?? null;
    } else {
      try {
        const ctx = getContext(s.path);
        base.contextTokens = ctx.tokens;
        base.contextModel = ctx.model;
        base.contextLimit = ctx.limit;
        base.contextPct = ctx.pct;
      } catch {
        base.contextTokens = null;
        base.contextModel = null;
        base.contextLimit = null;
        base.contextPct = null;
      }
    }
    base.muted = isMuted(s.name);
    base.pinned = isPinned(s.name);
    base.git = getGitStatus(s.path);
    base.project = projectOf(s.path);
    // Board-Karte (Idea Pipeline) die diese Session spawnte — Minimal-Subset.
    // findBoardCard ist synchron; defensiv gewrappt.
    let bc = null;
    try { bc = findBoardCard(s.name); } catch { bc = null; }
    base.boardCard = bc ? { id: bc.id, title: bc.title, stage: bc.stage } : null;
    // command für Running/Foreign aus known-sessions nachreichen (tmux liefert
    // es nicht). Dormant tragen es schon.
    if (base.command == null) {
      const ke = knownByName.get(s.name);
      base.command = ke ? ke.command : null;
    }
    return base;
  };

  return [...running.map(enrich), ...dormant.map(enrich), ...foreign.map(enrich)];
}
