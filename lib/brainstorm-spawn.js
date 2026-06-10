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
  const t = String(title || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
  return `Brainstorme diese Board-Idee und arbeite sie zu einem Spec aus (nutze die brainstorming-Methodik). Idee: "${t}". Wenn der Spec geschrieben + committet ist, verlinke ihn auf der Karte: PATCH $CC_HUB_URL/api/board/cards/${cardId} mit {"brainstormDoc":"<pfad>"} (Bearer $CC_HUB_TOKEN).`;
}

// Idempotenz-Entscheidung: existiert schon eine lebende, verlinkte Session?
export function resolveBrainstormSpawn(card, liveSessionNames) {
  if (card && card.sessionRef && Array.isArray(liveSessionNames) && liveSessionNames.includes(card.sessionRef)) {
    return { reuse: true, session: card.sessionRef };
  }
  return { reuse: false };
}

// ── Phase 3-B: Ideen-Generierungs-Session (projekt-gescopet) ──────────────

// Deterministischer Session-Slug für die Ideen-Generierung eines Projekts.
// Form: ideas-<slug>. Deterministisch = Idempotenz-Schlüssel (keine Karte).
// Ausgabe ∈ [\w.-], konform zur Whitelist ^[\w\-. ]{1,64}$ (nach cc--Prefix).
export function ideaGenSessionName(projectName, projectId) {
  const slugify = (s) => String(s || '')
    .toLowerCase()
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 40);
  return `ideas-${slugify(projectName) || slugify(projectId) || 'x'}`;
}

// Einzeiliger Priming-Prompt für divergente Ideen-Generierung. Weist Claude an:
// (1) nur dieses Projekt explorieren + bestehende Karten gegen Dubletten lesen,
// (2) im Dialog mehrere Kandidaten generieren (NICHT ausspezifizieren),
// (3) nach Bestätigung je Idee eine collab-Karte POSTen. $CC_HUB_URL/$CC_HUB_TOKEN
// bleiben Shell-Literale (Claude löst sie zur Laufzeit auf). projectId ist ein
// Registry-Slug ([\w-]) → literal eingebettet; Transport via Env-Var, kein Shell-Interp.
export function buildIdeaGenPriming(projectId, projectName) {
  const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
  const name = clean(projectName || projectId, 80);
  const pid = clean(projectId, 120);
  return `Generiere im Dialog mit mir mehrere Ideen-Kandidaten für das Projekt "${name}" (nutze die brainstorming-Methodik, aber divergent: viele Ideen, NICHT eine einzelne ausspezifizieren). Exploriere zuerst dieses Projekt: Code, CHANGELOG.md, git-History und die bestehenden Karten via GET $CC_HUB_URL/api/board/cards?projectId=${pid} (Bearer $CC_HUB_TOKEN), um Dubletten zu vermeiden. Jede Idee = kurzer Titel + 1-2 Sätze Seed-Notiz. Erst wenn ich die Liste bestätigt habe, lege jede Idee als Board-Karte an: POST $CC_HUB_URL/api/board/cards mit {"projectId":"${pid}","title":"<titel>","notes":"<seed>","origin":"collab","stage":"idea"} (Bearer $CC_HUB_TOKEN). Spezifiziere die Ideen NICHT zu einem Spec aus — das passiert später, wenn ich eine Karte nach Brainstorming ziehe.`;
}

// Shell-Command für den Prompt-Spawn: hängt "$CCH_PRIME_PROMPT" als initiales
// Prompt-Argument an die CLI an. Der eigentliche Prompt-Text wird via tmux -e
// (argv-Array, kein Shell-Parsing) als Env-Var in die Session injiziert; die
// Shell expandiert die Referenz zu GENAU EINEM Argument — der Prompt-Inhalt
// selbst durchläuft nie Shell-Quoting. In den Prompts eingebettete Literale
// wie $CC_HUB_URL bleiben dabei literal (Shells re-expandieren das Ergebnis
// einer Expansion nicht) — Claude löst sie später selbst in bash auf.
export function promptedSpawnCommand(cmd) {
  return `${cmd} "$CCH_PRIME_PROMPT"`;
}

// Erkennt claudes „Do you trust this folder?"-Startgate anhand stabiler Phrasen
// (frisch gespawnte Sessions in noch-nicht-vertrauten Verzeichnissen zeigen es;
// es blockiert den Start, bis es bestätigt wird — Default ist „Yes, I trust
// this folder", also akzeptiert ein Enter; der argv-Prompt wird danach normal
// verarbeitet). Reine String-Prüfung, fehlertolerant.
export function looksLikeTrustPrompt(paneText) {
  const t = String(paneText || '');
  return /trust this folder/i.test(t) || /Quick safety check/i.test(t);
}

// ── Phase 4: Autonome Umsetzung (Implement-Session) ───────────────────────

// Deterministischer Session-Slug für die autonome Umsetzung einer Karte.
// Form: impl-<slug> (reuse slugifySessionName). Deterministisch = Idempotenz-
// Schlüssel; kollidiert NICHT mit der Brainstorm-Session (<slug>). Ausgabe ∈
// [\w.-], also konform zur Whitelist ^[\w\-. ]{1,64}$ (nach cc--Prefix).
export function implementSessionName(title) {
  return `impl-${slugifySessionName(title)}`;
}

// Branch-Name für die Umsetzung: idea/<slug> (gleicher Slug wie die Session).
// Slug ∈ [\w.-] → git-branch-konform.
export function implementBranchName(title) {
  return `idea/${slugifySessionName(title)}`;
}

// Einzeiliger Priming-Prompt für den autonomen Plan+Impl-Agenten: Spec lesen,
// Branch anlegen, planen + umsetzen (TDD), lokal committen (KEIN Push), und als
// LETZTE Aktion die Karte selbst nach review advancen (Callback — gleiches
// Muster wie buildBrainstormPriming). $CC_HUB_URL/$CC_HUB_TOKEN bleiben Shell-
// Literale (Claude löst sie zur Laufzeit auf). card.id (UUID) + brainstormDoc
// (Pfad) + branch (idea/<slug>) literal eingebettet (Transport via Env-Var, kein Shell-Interp).
export function buildImplementPriming(card, { isolated = false } = {}) {
  const c = card || {};
  const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
  const title = clean(c.title, 200);
  const doc = clean(c.brainstormDoc, 300);
  const branch = implementBranchName(c.title);
  const patchTail = `Wenn alles fertig + committet ist, advance die Karte als LETZTE Aktion: PATCH $CC_HUB_URL/api/board/cards/${c.id} mit {"stage":"review","branch":"${branch}","implementSummary":"<2-3 Sätze, was du gebaut hast>"} (Bearer $CC_HUB_TOKEN). Beende die Session danach NICHT (kein exit) — ich reviewe live.`;
  if (isolated) {
    return `Setze diese Board-Idee autonom um. Idee: "${title}". Lies zuerst den Spec unter ${doc}. Du arbeitest in einem frischen, isolierten git-Worktree, bereits auf Branch ${branch} — kein checkout/branch nötig. Installiere zuerst die Projekt-Dependencies (z.B. npm install), dann schreibe mit der writing-plans-Methodik einen Plan und setze ihn um: TDD, Tests laufen lassen, verifizieren. Committe lokal auf den Branch — KEIN git push. ${patchTail}`;
  }
  return `Setze diese Board-Idee autonom um. Idee: "${title}". Lies zuerst den Spec unter ${doc}. Lege einen Branch ${branch} vom aktuellen Branch an (existiert er schon, arbeite darauf weiter). Schreibe mit der writing-plans-Methodik einen Plan und setze ihn dann um: TDD, Tests laufen lassen, verifizieren. Committe lokal auf den Branch — KEIN git push. ${patchTail}`;
}
