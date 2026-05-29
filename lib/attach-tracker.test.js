// Tests für lib/attach-tracker.js — node --test lib/attach-tracker.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as tracker from './attach-tracker.js';

test('noteAttach/noteDetach zählt pro Session', () => {
  tracker._reset();
  assert.equal(tracker.hubAttachedCount('cc-a'), 0);
  tracker.noteAttach('cc-a');
  assert.equal(tracker.hubAttachedCount('cc-a'), 1);
  tracker.noteAttach('cc-a');
  assert.equal(tracker.hubAttachedCount('cc-a'), 2);
  tracker.noteDetach('cc-a');
  assert.equal(tracker.hubAttachedCount('cc-a'), 1);
  tracker.noteDetach('cc-a');
  assert.equal(tracker.hubAttachedCount('cc-a'), 0);
});

test('noteDetach unter 0 löscht den Eintrag sauber', () => {
  tracker._reset();
  tracker.noteDetach('cc-x'); // war nie attached
  assert.equal(tracker.hubAttachedCount('cc-x'), 0);
});

test('leerer/fehlender Name ist no-op', () => {
  tracker._reset();
  tracker.noteAttach('');
  tracker.noteAttach(undefined);
  assert.equal(tracker.hubAttachedCount(''), 0);
});

test('shouldSuppressForForeignClient — tmux attached + Hub hält keinen Attach => true', () => {
  assert.equal(tracker.shouldSuppressForForeignClient(true, 0), true);
});

test('shouldSuppressForForeignClient — Hub selbst attached => false', () => {
  assert.equal(tracker.shouldSuppressForForeignClient(true, 1), false);
  assert.equal(tracker.shouldSuppressForForeignClient(true, 3), false);
});

test('shouldSuppressForForeignClient — niemand attached => false', () => {
  assert.equal(tracker.shouldSuppressForForeignClient(false, 0), false);
  assert.equal(tracker.shouldSuppressForForeignClient(false, 2), false);
});

test('rename verschiebt den Attach-Count auf den neuen Namen', () => {
  tracker._reset();
  tracker.noteAttach('cc-old');
  tracker.noteAttach('cc-old');
  tracker.rename('cc-old', 'cc-new');
  assert.equal(tracker.hubAttachedCount('cc-old'), 0);
  assert.equal(tracker.hubAttachedCount('cc-new'), 2);
});

test('rename ohne bestehenden Eintrag ist no-op', () => {
  tracker._reset();
  tracker.rename('cc-x', 'cc-y');
  assert.equal(tracker.hubAttachedCount('cc-y'), 0);
});

test('forget entfernt den Eintrag', () => {
  tracker._reset();
  tracker.noteAttach('cc-z');
  tracker.forget('cc-z');
  assert.equal(tracker.hubAttachedCount('cc-z'), 0);
});

test('noteAttach(null) ist no-op', () => {
  tracker._reset();
  tracker.noteAttach(null);
  assert.equal(tracker.hubAttachedCount('cc-a'), 0);
});
