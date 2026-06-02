import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localDayKey, dowHour, fromDate } from './day-bucket.js';

test('localDayKey returns YYYY-MM-DD in local time', () => {
  const iso = '2026-06-02T07:39:06.512Z';
  const d = new Date(iso);
  const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  assert.equal(localDayKey(iso), expected);
});

test('localDayKey tolerates missing/invalid', () => {
  assert.equal(localDayKey(undefined), null);
  assert.equal(localDayKey('not-a-date'), null);
});

test('dowHour returns local day-of-week and hour', () => {
  const iso = '2026-06-02T07:39:06.512Z';
  const d = new Date(iso);
  assert.deepEqual(dowHour(iso), { dow: (d.getDay() + 6) % 7, hour: d.getHours() });
});

test('fromDate formats a Date to local day key', () => {
  const d = new Date('2026-01-15T12:00:00Z');
  assert.equal(fromDate(d), localDayKey('2026-01-15T12:00:00Z'));
});
