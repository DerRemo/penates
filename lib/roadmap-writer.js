// Writer für ROADMAP.md-Dateien. Pure Funktionen, keine I/O.
// Die drei Public-APIs (toggleItem, deleteItem, addItem) transformieren
// einen String zu einem neuen String. Sie validieren gegen stale
// line-Offsets (z.B. nach externer Bearbeitung) und werfen
// `new Error('stale')` bzw. `new Error('section-not-found')`.
//
// Wieso pure? Damit sie ohne Filesystem-Mocks testbar sind und die
// Mutex/IO-Logik von der Content-Transformation getrennt bleibt
// (siehe lib/mutations.js — Step 2a Task 4).

// Section-Erkennungs-Patterns (bewusst kopiert, nicht importiert — Module bleiben unabhängig)
const RE_RELEASED    = /^##\s+Released\s*:\s*v?(\S+)\s*$/i;
const RE_DEV         = /^##\s+In\s+Development\s*:\s*v?(\S+)\s*$/i;
const RE_BACKLOG     = /^##\s+Backlog(\s*\/\s*Ideas)?\s*$/i;
const RE_CHANGELOG   = /^##\s+Changelog\s*$/i;
const RE_ANY_H2      = /^##\s+(.+?)\s*$/;
// Strict Semver-ähnliches Format — gleich wie der Parser-Contract.
// Erlaubt beliebige nicht-Whitespace-Zeichen nach dem `v`.
const RE_VERSION     = /^[0-9A-Za-z.\-+]{1,40}$/;

// Item-Pattern: nur nicht-indentierte Top-Level-Checkboxen
const RE_ITEM        = /^-\s*\[([ xX])\]\s*(.+?)\s*$/;

// Metadata-Suffix: optional { ... } am Ende des Item-Texts
const RE_META_SUFFIX = /\s*\{([^{}]*)\}\s*$/;

// Section-Name → Regex-Matcher
const SECTION_RE = {
  released: RE_RELEASED,
  dev:      RE_DEV,
  backlog:  RE_BACKLOG,
};

/**
 * Normalisiert CRLF/CR → LF.
 * @param {string} content
 * @returns {string}
 */
function normalize(content) {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Parst eine Item-Zeile und gibt ein Item-Objekt zurück.
 * Gibt null zurück wenn die Zeile kein Top-Level-Checkbox-Item ist.
 * @param {string} line
 * @param {number} lineNum - 1-basiert
 * @returns {{ done: boolean, text: string, meta: Record<string,string>, line: number } | null}
 */
function parseItemLine(line, lineNum) {
  const m = RE_ITEM.exec(line);
  if (!m) return null;

  const doneFlag = m[1];
  const rawText  = m[2];
  const done = doneFlag === 'x' || doneFlag === 'X';

  const metaMatch = RE_META_SUFFIX.exec(rawText);
  let text = rawText;
  const meta = {};

  if (metaMatch) {
    text = rawText.slice(0, metaMatch.index).trimEnd();
    const pairs = metaMatch[1].split(',');
    for (const pair of pairs) {
      const colonIdx = pair.indexOf(':');
      if (colonIdx === -1) continue;
      const key   = pair.slice(0, colonIdx).trim();
      const value = pair.slice(colonIdx + 1).trim();
      if (!key) continue;
      meta[key] = value;
    }
  }

  return { done, text, meta, line: lineNum };
}

/**
 * Serialisiert ein Meta-Objekt in einen Suffix-String.
 * Keys werden alphabetisch sortiert. Leeres/fehlendes Objekt → ''.
 * Wirft `new Error('meta-value-not-string')` wenn ein Value kein String ist.
 * @param {Record<string,string> | undefined} meta
 * @returns {string}
 */
function serializeMeta(meta) {
  if (!meta || typeof meta !== 'object') return '';
  const keys = Object.keys(meta).sort();
  if (keys.length === 0) return '';
  const pairs = keys.map(k => {
    const v = meta[k];
    if (typeof v !== 'string') {
      throw new Error('meta-value-not-string');
    }
    return `${k}: ${v.trim()}`;
  });
  return ' {' + pairs.join(', ') + '}';
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Flippt [ ] ↔ [x] auf der angegebenen 1-basierten Zeile.
 * Alles andere bleibt byte-for-byte erhalten.
 * Wirft `new Error('stale')` wenn die Zeile kein Top-Level-Checkbox-Item ist.
 *
 * @param {string} content - ROADMAP.md als String
 * @param {number} line    - 1-basierte Zeilennummer
 * @returns {{ content: string, item: Item }}
 */
export function toggleItem(content, line) {
  if (typeof content !== 'string') throw new Error('invalid-content');
  const normalized = normalize(content);
  const lines = normalized.split('\n');

  if (line < 1 || line > lines.length) {
    throw new Error('stale');
  }

  const idx = line - 1;
  const targetLine = lines[idx];

  const item = parseItemLine(targetLine, line);
  if (!item) throw new Error('stale');

  // Nur die Checkbox-Klammern ersetzen, Rest byte-for-byte beibehalten
  const flipped = item.done ? '[ ]' : '[x]';
  lines[idx] = targetLine.replace(/\[[ xX]\]/, flipped);

  // item.done ist jetzt der neue Zustand (nach Toggle)
  const newItem = { ...item, done: !item.done };

  return { content: lines.join('\n'), item: newItem };
}

/**
 * Entfernt die angegebene Zeile aus dem Content.
 * Wirft `new Error('stale')` wenn die Zeile kein Top-Level-Checkbox-Item ist.
 *
 * @param {string} content - ROADMAP.md als String
 * @param {number} line    - 1-basierte Zeilennummer
 * @returns {{ content: string }}
 */
export function deleteItem(content, line) {
  if (typeof content !== 'string') throw new Error('invalid-content');
  const normalized = normalize(content);
  const lines = normalized.split('\n');

  if (line < 1 || line > lines.length) {
    throw new Error('stale');
  }

  const idx = line - 1;
  const targetLine = lines[idx];

  const item = parseItemLine(targetLine, line);
  if (!item) throw new Error('stale');

  lines.splice(idx, 1);

  return { content: lines.join('\n') };
}

/**
 * Fügt ein neues `- [ ] text` Item am Ende der angegebenen Section ein.
 * Wirft `new Error('section-not-found')` wenn die Section nicht im Content vorkommt.
 * Wirft `new Error('text-has-trailing-braces')` wenn `text` mit `{...}` endet,
 * da dies mit der Meta-Suffix-Parsing kollidieren würde. Caller sollten
 * `text` vor dem Aufruf bereinigen.
 *
 * @param {string} content   - ROADMAP.md als String
 * @param {'released'|'dev'|'backlog'} section - Ziel-Section
 * @param {string} text      - Item-Text (ohne Checkbox-Prefix). Darf nicht mit `{...}` enden.
 * @param {Record<string,string>} [meta] - Optional: Key-Value-Metadata
 * @returns {{ content: string, item: Item }}
 */
export function addItem(content, section, text, meta) {
  if (typeof content !== 'string') throw new Error('invalid-content');
  // Defensive: Caller wie `patchProject` trimmen bereits, aber ein direkter
  // Library-User darf sich darauf nicht verlassen. Trim vor der Brace-Check,
  // damit `"foo {v}"   ` nicht fälschlich durchrutscht.
  if (typeof text === 'string') text = text.trim();
  if (/\{[^{}]*\}\s*$/.test(text)) {
    throw new Error('text-has-trailing-braces');
  }
  const sectionRe = SECTION_RE[section];
  if (!sectionRe) throw new Error('section-not-found');

  const normalized = normalize(content);
  const lines = normalized.split('\n');

  // Finde den Section-Header
  let sectionStartIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (sectionRe.test(lines[i])) {
      sectionStartIdx = i;
      break;
    }
  }

  if (sectionStartIdx === -1) {
    throw new Error('section-not-found');
  }

  // Finde die Einfügeposition: nach dem letzten Item der Section (vor dem nächsten H2 oder Dateiende)
  // Wir iterieren ab dem Header und suchen nach dem letzten Item-Index in dieser Section.
  let lastItemIdx = -1;
  let nextSectionIdx = lines.length; // Standardmäßig Dateiende

  for (let i = sectionStartIdx + 1; i < lines.length; i++) {
    if (RE_ANY_H2.test(lines[i])) {
      nextSectionIdx = i;
      break;
    }
    if (RE_ITEM.test(lines[i])) {
      lastItemIdx = i;
    }
  }

  // Einfügeposition: nach dem letzten Item oder direkt nach dem Section-Header
  const insertAfterIdx = lastItemIdx !== -1 ? lastItemIdx : sectionStartIdx;
  const insertIdx = insertAfterIdx + 1; // splice-Index (einfügen nach dieser Position)

  const metaSuffix = serializeMeta(meta);
  const newLine = `- [ ] ${text}${metaSuffix}`;

  lines.splice(insertIdx, 0, newLine);

  // item.line ist 1-basiert
  const itemLineNum = insertIdx + 1;
  const newItem = parseItemLine(newLine, itemLineNum);

  return { content: lines.join('\n'), item: newItem };
}

/**
 * Ob die Section (per SECTION_RE) im Content vorkommt — exakt dieselbe
 * Erkennung wie addItem/addDoneItem (gleiche SECTION_RE-Quelle). Für Phase-5-
 * Preflight: garantiert, dass addDoneItem die Section danach auch findet.
 * @param {string} content @param {'released'|'dev'|'backlog'} section
 * @returns {boolean}
 */
export function sectionExists(content, section) {
  const sectionRe = SECTION_RE[section];
  if (!sectionRe || typeof content !== 'string') return false;
  return normalize(content).split('\n').some(l => sectionRe.test(l));
}

/**
 * Wie addItem, fügt aber ein ERLEDIGTES Item `- [x] text{ meta}` ans Ende der
 * Section. Für Phase 5 (Review→Fertig): das gemergte Feature wird als done
 * vermerkt. Reuse der Section-Find-/Insert-Logik von addItem. Parser-safe.
 * @param {string} content @param {'released'|'dev'|'backlog'} section
 * @param {string} text @param {Record<string,string>} [meta]
 * @returns {{ content: string, item: Item }}
 */
export function addDoneItem(content, section, text, meta) {
  if (typeof content !== 'string') throw new Error('invalid-content');
  if (typeof text === 'string') text = text.trim();
  if (/\{[^{}]*\}\s*$/.test(text)) throw new Error('text-has-trailing-braces');
  const sectionRe = SECTION_RE[section];
  if (!sectionRe) throw new Error('section-not-found');

  const lines = normalize(content).split('\n');
  let sectionStartIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (sectionRe.test(lines[i])) { sectionStartIdx = i; break; }
  }
  if (sectionStartIdx === -1) throw new Error('section-not-found');

  let lastItemIdx = -1;
  for (let i = sectionStartIdx + 1; i < lines.length; i++) {
    if (RE_ANY_H2.test(lines[i])) break;
    if (RE_ITEM.test(lines[i])) lastItemIdx = i;
  }
  const insertIdx = (lastItemIdx !== -1 ? lastItemIdx : sectionStartIdx) + 1;
  const newLine = `- [x] ${text}${serializeMeta(meta)}`;
  lines.splice(insertIdx, 0, newLine);
  const newItem = parseItemLine(newLine, insertIdx + 1);
  return { content: lines.join('\n'), item: newItem };
}

/**
 * Ersetzt den Text-Teil eines Items an `line`. Checkbox-State + Meta-Suffix
 * bleiben erhalten. `newText` darf nicht mit `{...}` enden.
 * Wirft 'stale' (kein Item), 'text-has-trailing-braces', 'invalid-content'.
 * @param {string} content @param {number} line @param {string} newText
 * @returns {{ content: string }}
 */
export function editItem(content, line, newText) {
  if (typeof content !== 'string') throw new Error('invalid-content');
  if (typeof newText === 'string') newText = newText.trim();
  if (typeof newText !== 'string' || newText.length === 0) throw new Error('invalid-content');
  if (/\{[^{}]*\}\s*$/.test(newText)) throw new Error('text-has-trailing-braces');
  const lines = normalize(content).split('\n');
  if (line < 1 || line > lines.length) throw new Error('stale');
  const idx = line - 1;
  const m = RE_ITEM.exec(lines[idx]);
  if (!m) throw new Error('stale');
  const flag = m[1];
  const rawText = m[2];
  const metaMatch = RE_META_SUFFIX.exec(rawText);
  const suffix = metaMatch ? rawText.slice(metaMatch.index).trimEnd() : '';
  lines[idx] = `- [${flag}] ${newText}${suffix}`;
  return { content: lines.join('\n') };
}

/**
 * Verschiebt das Item an `fromLine` ans Ende von `toSection` (released|dev|backlog).
 * Text/Meta/Checkbox-State bleiben byte-for-byte erhalten. Wirft 'stale'
 * (kein Item), 'section-not-found' (Zielsektion fehlt), 'invalid-content'.
 * @returns {{ content: string }}
 */
export function moveItem(content, fromLine, toSection) {
  if (typeof content !== 'string') throw new Error('invalid-content');
  const sectionRe = SECTION_RE[toSection];
  if (!sectionRe) throw new Error('section-not-found');
  const lines = normalize(content).split('\n');
  if (fromLine < 1 || fromLine > lines.length) throw new Error('stale');
  const idx = fromLine - 1;
  const rawItem = lines[idx];
  if (!RE_ITEM.test(rawItem)) throw new Error('stale');
  lines.splice(idx, 1); // entfernen
  let sectionStartIdx = -1;
  for (let i = 0; i < lines.length; i++) { if (sectionRe.test(lines[i])) { sectionStartIdx = i; break; } }
  if (sectionStartIdx === -1) throw new Error('section-not-found');
  let lastItemIdx = -1;
  for (let i = sectionStartIdx + 1; i < lines.length; i++) {
    if (RE_ANY_H2.test(lines[i])) break;
    if (RE_ITEM.test(lines[i])) lastItemIdx = i;
  }
  const insertIdx = (lastItemIdx !== -1 ? lastItemIdx : sectionStartIdx) + 1;
  lines.splice(insertIdx, 0, rawItem);
  return { content: lines.join('\n') };
}

/**
 * Ordnet ein Item innerhalb seiner Sektion an Position `toIndex` (0-basiert,
 * geclampt auf [0, n-1]) um. Permutiert nur die Item-Inhalte in den
 * bestehenden Item-Zeilen-Slots — interleaved Leerzeilen bleiben an Ort.
 * Wirft 'section-not-found', 'stale' (fromLine kein Item der Sektion),
 * 'invalid-content'.
 * @returns {{ content: string }}
 */
export function reorderItem(content, section, fromLine, toIndex) {
  if (typeof content !== 'string') throw new Error('invalid-content');
  const sectionRe = SECTION_RE[section];
  if (!sectionRe) throw new Error('section-not-found');
  const lines = normalize(content).split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) { if (sectionRe.test(lines[i])) { start = i; break; } }
  if (start === -1) throw new Error('section-not-found');
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) { if (RE_ANY_H2.test(lines[i])) { end = i; break; } }
  const itemIdxs = [];
  for (let i = start + 1; i < end; i++) { if (RE_ITEM.test(lines[i])) itemIdxs.push(i); }
  const fromPos = itemIdxs.indexOf(fromLine - 1);
  if (fromPos === -1) throw new Error('stale');
  const n = itemIdxs.length;
  let to = toIndex; if (to < 0) to = 0; if (to > n - 1) to = n - 1;
  if (to === fromPos) return { content: lines.join('\n') };
  const raw = itemIdxs.map(i => lines[i]);
  const [moved] = raw.splice(fromPos, 1);
  raw.splice(to, 0, moved);
  itemIdxs.forEach((li, k) => { lines[li] = raw[k]; });
  return { content: lines.join('\n') };
}

/**
 * Setzt die Versions-Nummer im Header von 'released' oder 'dev'.
 * Wirft 'bad-version', 'section-not-found' (Header fehlt oder section==backlog),
 * 'invalid-content'.
 * @returns {{ content: string }}
 */
export function setSectionVersion(content, section, version) {
  if (typeof content !== 'string') throw new Error('invalid-content');
  if (typeof version !== 'string' || !RE_VERSION.test(version)) throw new Error('bad-version');
  if (section !== 'released' && section !== 'dev') throw new Error('section-not-found');
  const re = section === 'released' ? RE_RELEASED : RE_DEV;
  const header = section === 'released' ? `## Released: v${version}` : `## In Development: v${version}`;
  const lines = normalize(content).split('\n');
  let found = false;
  for (let i = 0; i < lines.length; i++) { if (re.test(lines[i])) { lines[i] = header; found = true; break; } }
  if (!found) throw new Error('section-not-found');
  return { content: lines.join('\n') };
}

/**
 * Schließt eine Release-Version ab. Nimmt den kompletten Inhalt der
 * "In Entwicklung"-Section und verschiebt ihn in die "Released"-Section,
 * aktualisiert beide Versions-Header, und fügt einen neuen Changelog-
 * Eintrag oben in der Changelog-Section ein.
 *
 * Voraussetzung: ROADMAP.md enthält Released-, Dev- UND Changelog-Section
 * in der Reihenfolge Released → Dev → Changelog. Andere Reihenfolgen
 * werfen `section-order-unsupported`.
 *
 * @param {string} content   - ROADMAP.md als String
 * @param {object} opts
 * @param {string} opts.releaseVersion  - neue Released-Version (ohne "v"-Prefix)
 * @param {string} opts.newDevVersion   - neue In-Entwicklung-Version (ohne "v")
 * @param {string} [opts.narrative]     - freier Markdown-Text fürs Changelog
 * @returns {{ content: string }}
 * @throws {Error} mit .message aus:
 *   'invalid-content' | 'bad-release-version' | 'bad-dev-version' |
 *   'bad-narrative' | 'released-section-missing' | 'dev-section-missing' |
 *   'changelog-section-missing' | 'section-order-unsupported'
 */
export function finalizeRelease(content, { releaseVersion, newDevVersion, narrative } = {}) {
  if (typeof content !== 'string') throw new Error('invalid-content');
  if (typeof releaseVersion !== 'string' || !RE_VERSION.test(releaseVersion)) {
    throw new Error('bad-release-version');
  }
  if (typeof newDevVersion !== 'string' || !RE_VERSION.test(newDevVersion)) {
    throw new Error('bad-dev-version');
  }
  if (narrative === undefined || narrative === null) narrative = '';
  if (typeof narrative !== 'string') throw new Error('bad-narrative');
  // Narrative darf keine H2 enthalten — das würde eine neue Section öffnen
  // und den Parser komplett durcheinanderbringen.
  if (narrative.split('\n').some(l => /^##\s+/.test(l))) {
    throw new Error('bad-narrative');
  }

  const normalized = normalize(content);
  const lines = normalized.split('\n');

  let releasedIdx = -1, devIdx = -1, changelogIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (releasedIdx === -1 && RE_RELEASED.test(lines[i])) { releasedIdx = i; continue; }
    if (devIdx === -1 && RE_DEV.test(lines[i])) { devIdx = i; continue; }
    if (changelogIdx === -1 && RE_CHANGELOG.test(lines[i])) { changelogIdx = i; continue; }
  }
  if (releasedIdx === -1) throw new Error('released-section-missing');
  if (devIdx === -1) throw new Error('dev-section-missing');
  if (changelogIdx === -1) throw new Error('changelog-section-missing');
  if (!(releasedIdx < devIdx && devIdx < changelogIdx)) {
    throw new Error('section-order-unsupported');
  }

  function findNextH2(fromIdx) {
    for (let i = fromIdx + 1; i < lines.length; i++) {
      if (RE_ANY_H2.test(lines[i])) return i;
    }
    return lines.length;
  }
  const releasedEndIdx = findNextH2(releasedIdx); // typisch = devIdx
  const devEndIdx      = findNextH2(devIdx);      // typisch = Backlog- oder Changelog-Index

  // Dev-Body kopieren (zwischen Dev-Header und nächster H2, exklusiv).
  // Trailing-Blank am Ende wird abgeschnitten — sonst wächst die
  // Released-Section bei jedem Finalize um eine Leerzeile.
  let devBodyLines = lines.slice(devIdx + 1, devEndIdx);
  while (devBodyLines.length && devBodyLines[devBodyLines.length - 1] === '') {
    devBodyLines.pop();
  }
  // Leading-Blank ebenfalls abschneiden.
  while (devBodyLines.length && devBodyLines[0] === '') {
    devBodyLines.shift();
  }
  // Um hübsch zu bleiben: eine Leerzeile vor dem ersten Item und eine
  // danach. Wenn devBodyLines leer ist, nur eine Leerzeile als Body.
  const newReleasedBody = devBodyLines.length
    ? ['', ...devBodyLines, '']
    : [''];

  // Neuer Changelog-Block: Leerzeile, ### vX — Datum, Leerzeile,
  // Narrative (split by \n), Leerzeile. Bei leerem Narrative nur das
  // Heading ohne Body.
  const today = new Date().toISOString().slice(0, 10);
  const narrativeLines = narrative.trim() ? narrative.trim().split('\n') : [];
  const newChangelogBlock = [
    '',
    `### v${releaseVersion} — ${today}`,
    '',
    ...(narrativeLines.length ? [...narrativeLines, ''] : []),
  ];

  // ── Mutationen bottom-up, damit obere Indices stabil bleiben ─────────

  // 1) Changelog-Block direkt nach der Changelog-H2 einfügen.
  lines.splice(changelogIdx + 1, 0, ...newChangelogBlock);

  // 2) Dev-Body auf eine leere Zeile kürzen.
  const devBodyCount = devEndIdx - devIdx - 1;
  lines.splice(devIdx + 1, devBodyCount, '');

  // 3) Dev-Header-Version updaten.
  lines[devIdx] = `## In Development: v${newDevVersion}`;

  // 4) Released-Body durch den kopierten Dev-Body ersetzen.
  const releasedBodyCount = releasedEndIdx - releasedIdx - 1;
  lines.splice(releasedIdx + 1, releasedBodyCount, ...newReleasedBody);

  // 5) Released-Header-Version updaten.
  lines[releasedIdx] = `## Released: v${releaseVersion}`;

  return { content: lines.join('\n') };
}
