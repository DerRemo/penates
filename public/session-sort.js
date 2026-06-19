// Single source of session ordering for the sidebar and the overview.
// Pure: no DOM, no globals. Imported in the browser (exposed as
// window.SessionSort) and in node:test. The ordering rule lives ONLY here
// so both surfaces share one predictable pattern:
//   pinned first, then alphabetical by the *displayed* name.

// Display label the user actually sees — drives alphabetical order. Board-
// pipeline sessions show their idea title; everything else shows the tmux
// name with the `cc-` prefix stripped (matching the card/sidebar render).
export function sessionLabel(s) {
  if (s && s.boardCard && s.boardCard.title) return s.boardCard.title;
  return String((s && s.name) || '').replace(/^cc-/, '');
}

// Case-insensitive, natural-numeric comparator on the display label, so
// `s2` sorts before `s10` and capitalization doesn't split the list.
export function compareByLabel(a, b) {
  return sessionLabel(a).localeCompare(sessionLabel(b), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

// Board-pipeline session pulled into the Board section: idea-linked AND live.
// Mirrors the predicate the overview used inline before this module existed.
export function isBoardSession(s) {
  return !!(s && s.boardCard) && ((s && s.status) || 'running') === 'running';
}

// Pinned-first, then alphabetical. Shared by the sidebar order and the Board
// group (where pinned board sessions float to the top).
function byPinnedThenLabel(a, b) {
  const ap = a && a.pinned ? 1 : 0;
  const bp = b && b.pinned ? 1 : 0;
  if (ap !== bp) return bp - ap;
  return compareByLabel(a, b);
}

// Overview partition. Each session lands in exactly one group (predicates are
// mutually exclusive by construction); each group is returned already sorted.
export function partitionOverview(sessions) {
  const list = Array.isArray(sessions) ? sessions : [];
  const board = [];
  const pinned = [];
  const active = [];
  const dormant = [];
  const foreign = [];
  for (const s of list) {
    const status = (s && s.status) || 'running';
    if (isBoardSession(s)) { board.push(s); continue; }
    if (status === 'foreign') { foreign.push(s); continue; }
    if (s && s.pinned && (status === 'running' || status === 'dormant')) {
      pinned.push(s); continue;
    }
    if (status === 'dormant') { dormant.push(s); continue; }
    active.push(s); // remaining = unpinned running (or unknown status)
  }
  board.sort(byPinnedThenLabel);  // pinned board sessions float to the top of Board
  pinned.sort(compareByLabel);
  active.sort(compareByLabel);
  dormant.sort(compareByLabel);
  foreign.sort(compareByLabel);
  return { pinned, board, active, dormant, foreign };
}

// Sidebar flat order: pinned first, then alphabetical. No attached-first —
// the open session is already highlighted in place via sidebar__item--active.
export function orderSidebar(sessions) {
  const list = Array.isArray(sessions) ? sessions.slice() : [];
  list.sort(byPinnedThenLabel);
  return list;
}
