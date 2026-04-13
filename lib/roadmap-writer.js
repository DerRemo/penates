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
const RE_DEV         = /^##\s+In\s+Entwicklung\s*:\s*v?(\S+)\s*$/i;
const RE_BACKLOG     = /^##\s+Backlog(\s*\/\s*Ideen)?\s*$/i;
const RE_ANY_H2      = /^##\s+(.+?)\s*$/;

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
