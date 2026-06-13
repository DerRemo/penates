// Parser für ROADMAP.md — wandelt den Inhalt in eine strukturierte Roadmap-Datenstruktur um.
//
// Sections werden per Regex case-insensitiv erkannt:
//   ## Released: vX.Y.Z   → roadmap.released  (mit Versions-String)
//   ## In Entwicklung: vX.Y.Z → roadmap.dev   (mit Versions-String)
//   ## Backlog [/ Ideen]  → roadmap.backlog    (Array von Items)
//   ## Changelog          → roadmap.changelog  (Rohtext, getrimmt)
//   Alle anderen H2       → roadmap.unknown[]  (Titel, Inhalt verworfen)
//
// Item-Format: - [x] Text {key: value, key2: value2}
//   done  = true bei [x] oder [X]
//   text  = Item-Text ohne Metadata-Suffix, getrimmt
//   meta  = Key-Value-Pairs aus {...}, {} wenn keins
//   line  = 1-basierte Zeilennummer im Original (für Write-Back)
//
// Reine Parser-Funktion, kein I/O, keine Side-Effects.

// Section-Erkennungs-Patterns
const RE_RELEASED     = /^##\s+Released\s*:\s*v?(\S+)\s*$/i;
const RE_DEV          = /^##\s+In\s+Development\s*:\s*v?(\S+)\s*$/i;
const RE_BACKLOG      = /^##\s+Backlog(\s*\/\s*(Ideas?|Ideen))?\s*$/i;  // EN + DE "Ideen"
const RE_CHANGELOG    = /^##\s+Changelog\s*$/i;
const RE_ANY_H2       = /^##\s+(.+?)\s*$/;

// Item-Pattern: - [ ] text oder - [x] text — nur nicht-indentierte Zeilen.
// Nur nicht-indentierte Checkboxen werden als Items erkannt. Nested Sub-Tasks
// sind bewusst ausgeklammert (siehe Roadmap Phase 1 Scope) — sie würden
// den Write-Back in Step 2 komplizierter machen.
const RE_ITEM         = /^-\s*\[([ xX])\]\s*(.+?)\s*$/;

// Metadata-Suffix: optional { ... } am Ende des Item-Texts
const RE_META_SUFFIX  = /\s*\{([^{}]*)\}\s*$/;

/**
 * Parst den Inhalt einer ROADMAP.md und liefert eine strukturierte Roadmap zurück.
 * @param {string} content - Rohes Markdown als String
 * @returns {Roadmap}
 */
export function parseRoadmap(content) {
  const roadmap = {
    released:  { version: null, items: [] },
    dev:       { version: null, items: [] },
    backlog:   [],
    changelog: '',
    unknown:   [],
  };

  if (!content || typeof content !== 'string') return roadmap;

  // CRLF normalisieren
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  // Aktuelle Section: 'released' | 'dev' | 'backlog' | 'changelog' | 'unknown' | null
  let section = null;
  const changelogLines = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1; // 1-basiert
    const line = lines[i];

    // H2-Header erkennen
    const releasedMatch = RE_RELEASED.exec(line);
    if (releasedMatch) {
      roadmap.released.version = releasedMatch[1];
      section = 'released';
      continue;
    }

    const devMatch = RE_DEV.exec(line);
    if (devMatch) {
      roadmap.dev.version = devMatch[1];
      section = 'dev';
      continue;
    }

    if (RE_BACKLOG.test(line)) {
      section = 'backlog';
      continue;
    }

    if (RE_CHANGELOG.test(line)) {
      section = 'changelog';
      continue;
    }

    const h2Match = RE_ANY_H2.exec(line);
    if (h2Match) {
      roadmap.unknown.push(h2Match[1]);
      section = 'unknown';
      continue;
    }

    // Inhalt der aktuellen Section verarbeiten
    if (section === 'changelog') {
      changelogLines.push(line);
      continue;
    }

    if (section === null || section === 'unknown') {
      continue;
    }

    // Item-Erkennung für released / dev / backlog
    const itemMatch = RE_ITEM.exec(line);
    if (!itemMatch) continue;

    const doneFlag = itemMatch[1];
    const rawText  = itemMatch[2];

    const done = doneFlag === 'x' || doneFlag === 'X';

    // Metadata-Suffix extrahieren
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

    const item = { done, text, meta, line: lineNum };

    if (section === 'released') {
      roadmap.released.items.push(item);
    } else if (section === 'dev') {
      roadmap.dev.items.push(item);
    } else if (section === 'backlog') {
      roadmap.backlog.push(item);
    }
  }

  // Changelog-Rohtext trimmen (führende/schließende Leerzeilen entfernen)
  if (changelogLines.length > 0) {
    roadmap.changelog = changelogLines.join('\n').trim();
  }

  return roadmap;
}
