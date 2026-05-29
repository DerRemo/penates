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
