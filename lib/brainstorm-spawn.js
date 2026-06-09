// Reine, Express-freie Helfer für den Brainstorming-Session-Spawn (Phase 3).
// Keine I/O, keine tmux-Aufrufe — nur String-/Entscheidungslogik, voll unit-testbar.

// Session-Slug aus dem Ideentitel. Ausgabe-Zeichen ∈ [\w.-], also konform zur
// Session-Whitelist ^[\w\-. ]{1,64}$ (nach cc--Prefix). Fallback 'idea'.
export function slugifySessionName(title) {
  const base = String(title || '')
    .toLowerCase()
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 48);
  return base || 'idea';
}

// Einzeiliger Priming-Prompt: Idee benennen, Brainstorming anstoßen, Callback
// anweisen. $CC_HUB_URL/$CC_HUB_TOKEN bleiben Shell-Literale (Claude löst sie zur
// Laufzeit auf). Titel wird einzeilig gehalten (Steuerzeichen → Space) + gekürzt.
export function buildBrainstormPriming(title, cardId) {
  const t = String(title || '').replace(/[^\x20-\x7E -￿]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
  return `Brainstorme diese Board-Idee und arbeite sie zu einem Spec aus (nutze die brainstorming-Methodik). Idee: "${t}". Wenn der Spec geschrieben + committet ist, verlinke ihn auf der Karte: PATCH $CC_HUB_URL/api/board/cards/${cardId} mit {"brainstormDoc":"<pfad>"} (Bearer $CC_HUB_TOKEN).`;
}

// Idempotenz-Entscheidung: existiert schon eine lebende, verlinkte Session?
export function resolveBrainstormSpawn(card, liveSessionNames) {
  if (card && card.sessionRef && Array.isArray(liveSessionNames) && liveSessionNames.includes(card.sessionRef)) {
    return { reuse: true, session: card.sessionRef };
  }
  return { reuse: false };
}
