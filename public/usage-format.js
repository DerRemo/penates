// public/usage-format.js
// Pure helpers for the Usage view. Importable by the browser (dynamic import)
// AND node:test — no DOM, no globals. Mirrors the public/clis.js pattern.

// pace: { stage, deltaPct, etaSeconds, lastsToReset } | null
// Returns { text, cls } or null when there is no pace to show.
export function paceLabel(pace, t) {
  if (!pace) return null;
  // Use stage to derive the direction label key so onTrack/behind/ahead align.
  const stage = pace.stage;
  const dir = stage === 'behind' ? 'slower' : stage === 'ahead' ? 'faster' : 'onTrack';
  const dirKey = `usage.pace.${dir}`;
  const cls = stage === 'behind' ? 'good' : stage === 'ahead' ? 'bad' : 'neutral';
  const eta = pace.lastsToReset
    ? t('usage.pace.lastsToReset')
    : t('usage.pace.runsOutIn', { eta: formatEtaShort(pace.etaSeconds, t) });
  return { text: `${t(dirKey)} · ${eta}`, cls };
}

export function formatEtaShort(seconds, t) {
  if (seconds == null || !(seconds > 0)) return '';
  const min = Math.round(seconds / 60);
  if (min < 90) return t('usage.eta.min', { n: min });
  const hours = Math.round(seconds / 3600);
  if (hours < 48) return t('usage.eta.hour', { n: hours });
  const days = Math.round(seconds / 86400);
  return t('usage.eta.day', { n: days });
}

// values oldest->newest. Returns SVG path d-strings for a filled area + line.
export function buildTrendPath(values, w, h, pad = 6) {
  if (!values || values.length === 0) return { line: '', area: '' };
  const max = Math.max(...values, 1);
  const n = values.length;
  const x = (i) => (n === 1 ? 0 : (i / (n - 1)) * w);
  const y = (v) => pad + (1 - v / max) * (h - 2 * pad);
  const fmt = (n) => Number.isInteger(n) ? String(n) : n.toFixed(1);
  const pts = values.map((v, i) => `${fmt(x(i))},${fmt(y(v))}`);
  const line = 'M' + pts.join(' L');
  const area = `${line} L${w},${h} L0,${h} Z`;
  return { line, area };
}
