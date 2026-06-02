// lib/usage-scan/day-bucket.js
// ISO timestamp -> local calendar day + day-of-week/hour. Local time on purpose
// (matches the existing heatmap/day aggregation in lib/usage.js).

function toDate(iso) {
  if (typeof iso !== 'string') return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t);
}

export function fromDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function localDayKey(iso) {
  const d = toDate(iso);
  return d ? fromDate(d) : null;
}

export function dowHour(iso) {
  const d = toDate(iso);
  if (!d) return null;
  return { dow: (d.getDay() + 6) % 7, hour: d.getHours() }; // Mon=0..Sun=6
}
