// Tests für lib/attention.js — node --test lib/attention.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as attention from './attention.js';

function collect() {
  // events: nur session-attention (Notification-wert, mit Sound/Flash).
  // activities: nur session-activity (reine State-Updates für Badge-Patch).
  const events = [];
  const activities = [];
  const fn = (e) => {
    if (e.type === 'session-attention') events.push(e);
    else if (e.type === 'session-activity') activities.push(e);
  };
  attention.subscribe(fn);
  return { events, activities, unsub: () => attention.unsubscribe(fn) };
}

function reset() {
  attention.stop();
}

test('reportHookEvent — Stop auf frischem State feuert session-attention mit activity:idle', () => {
  reset();
  const { events, activities } = collect();
  attention.reportHookEvent('cc-a', 'Stop', {}, 1000);
  assert.equal(events.length, 1);
  assert.equal(events[0].name, 'cc-a');
  assert.equal(events[0].activity, 'idle');
  assert.equal(activities.length, 1);
  assert.equal(activities[0].activity, 'idle');
});

test('reportHookEvent — Notification feuert mit activity:waiting', () => {
  reset();
  const { events } = collect();
  attention.reportHookEvent('cc-a', 'Notification', {}, 1000);
  assert.equal(events.length, 1);
  assert.equal(events[0].activity, 'waiting');
});

test('reportHookEvent — UserPromptSubmit setzt working, feuert session-activity, KEIN session-attention', () => {
  reset();
  const { events, activities } = collect();
  attention.reportHookEvent('cc-a', 'UserPromptSubmit', {}, 1000);
  assert.equal(events.length, 0);
  assert.equal(activities.length, 1);
  assert.equal(activities[0].activity, 'working');
  assert.equal(attention._debugState().sessions[0].activity, 'working');
});

test('reportHookEvent — session-attention feuert auch wenn attached (Suppression lebt jetzt in Push-Schicht)', () => {
  reset();
  attention.reportHookEvent('cc-a', 'Stop', {}, 500); // Init state, setzt lastNotifiedAt=500
  attention.setAttached('cc-a', true);  // no-op, bleibt als backwards-compat no-op
  const { events, activities } = collect();
  attention.reportHookEvent('cc-a', 'Notification', {}, 11000); // 10500ms > HOOK_COOLDOWN_MS
  assert.equal(events.length, 1, 'session-attention feuert trotz attached');
  assert.equal(events[0].activity, 'waiting');
  assert.equal(activities.length, 1);
});

test('reportHookEvent — muted feuert session-activity aber kein session-attention', () => {
  reset();
  attention.setMuteChecker((n) => n === 'cc-a');
  const { events, activities } = collect();
  attention.reportHookEvent('cc-a', 'Stop', {}, 1000);
  assert.equal(events.length, 0);
  assert.equal(activities.length, 1);
  assert.equal(attention._debugState().sessions[0].activity, 'idle');
});

test('reportHookEvent — Cool-Down drosselt zweites session-attention', () => {
  reset();
  const { events, activities } = collect();
  attention.reportHookEvent('cc-a', 'Notification', {}, 1000);
  attention.reportHookEvent('cc-a', 'Notification', {}, 5000);  // < 10s
  assert.equal(events.length, 1);
  // activity-Broadcasts sind NICHT gedrosselt
  assert.equal(activities.length, 2);
  attention.reportHookEvent('cc-a', 'Notification', {}, 12000); // > 10s
  assert.equal(events.length, 2);
});

test('reportHookEvent — SessionEnd purget State', () => {
  reset();
  attention.reportHookEvent('cc-a', 'Stop', {}, 1000);
  assert.equal(attention._debugState().sessions.length, 1);
  attention.reportHookEvent('cc-a', 'SessionEnd', {}, 2000);
  assert.equal(attention._debugState().sessions.length, 0);
});

test('reportHookEvent — SessionStart initialisiert State ohne Broadcast', () => {
  reset();
  const { events, activities } = collect();
  attention.reportHookEvent('cc-a', 'SessionStart', {}, 1000);
  assert.equal(events.length, 0);
  assert.equal(activities.length, 0);
  assert.equal(attention._debugState().sessions.length, 1);
});

test('getHookActivity — liefert aktuellen Wert innerhalb HOOK_FRESH_MS', () => {
  reset();
  attention.reportHookEvent('cc-a', 'Stop', {}, 1000);
  assert.equal(attention.getHookActivity('cc-a', 2000), 'idle');
});

test('getHookActivity — liefert null wenn State stale (>60s)', () => {
  reset();
  attention.reportHookEvent('cc-a', 'Stop', {}, 1000);
  assert.equal(attention.getHookActivity('cc-a', 70_000), null);
});

test('getHookActivity — unbekannte Session liefert null', () => {
  reset();
  assert.equal(attention.getHookActivity('cc-ghost'), null);
});

test('rename — überträgt State auf neuen Namen', () => {
  reset();
  attention.reportHookEvent('cc-old', 'Stop', {}, 1000);
  attention.rename('cc-old', 'cc-new');
  const sessions = attention._debugState().sessions;
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].name, 'cc-new');
  assert.equal(sessions[0].activity, 'idle');
});

test('forget — entfernt Session aus State', () => {
  reset();
  attention.reportHookEvent('cc-a', 'Stop', {}, 1000);
  attention.forget('cc-a');
  assert.equal(attention._debugState().sessions.length, 0);
});

test('setAttached — no-op für unbekannte Session', () => {
  reset();
  attention.setAttached('cc-ghost', true);
  assert.equal(attention._debugState().sessions.length, 0);
});

test('reportToolStart broadcastet session-activity mit tool, kein attention', () => {
  attention.stop();
  const events = [];
  attention.subscribe((e) => events.push(e));
  attention.reportToolStart('cc-tool', 'Bash');
  const acts = events.filter((e) => e.type === 'session-activity');
  assert.equal(acts.length, 1);
  assert.equal(acts[0].name, 'cc-tool');
  assert.equal(acts[0].activity, 'working');
  assert.equal(acts[0].tool, 'Bash');
  assert.equal(events.filter((e) => e.type === 'session-attention').length, 0);
  assert.equal(attention.getHookTool('cc-tool'), 'Bash');
});

test('reportToolEnd löscht tool und broadcastet ohne tool', () => {
  attention.stop();
  const events = [];
  attention.subscribe((e) => events.push(e));
  attention.reportToolStart('cc-tool', 'Edit');
  attention.reportToolEnd('cc-tool');
  const last = events.filter((e) => e.type === 'session-activity').at(-1);
  assert.equal(last.tool, undefined);
  assert.equal(last.activity, 'working');
  assert.equal(attention.getHookTool('cc-tool'), null);
});

test('rename trägt das tool mit', () => {
  attention.stop();
  attention.reportToolStart('cc-old', 'Write');
  attention.rename('cc-old', 'cc-new');
  assert.equal(attention.getHookTool('cc-new'), 'Write');
});
