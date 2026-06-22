import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ctrlByte, wheelScroll, wsCloseAction, isPongFrame } from './terminal-logic.js';

// ── ctrlByte ──
test('ctrlByte: letters map to control chars (case-insensitive bits)', () => {
  assert.equal(ctrlByte('a'), '\x01'); // 0x61 & 0x1f = 1
  assert.equal(ctrlByte('A'), '\x01'); // 0x41 & 0x1f = 1
  assert.equal(ctrlByte('c'), '\x03'); // SIGINT
});
test('ctrlByte: range edges 0x40 and 0x7e', () => {
  assert.equal(ctrlByte('@'), '\x00');  // 0x40 & 0x1f = 0
  assert.equal(ctrlByte('~'), '\x1e');  // 0x7e & 0x1f = 0x1e
});
test('ctrlByte: out of range and bad length → null', () => {
  assert.equal(ctrlByte(' '), null);    // 0x20 below range
  assert.equal(ctrlByte('\x7f'), null); // above range
  assert.equal(ctrlByte('ab'), null);   // length != 1
  assert.equal(ctrlByte(''), null);
});

// ── wheelScroll ──
test('wheelScroll: positive accum → wheel down (65), floored lines', () => {
  assert.deepEqual(wheelScroll(50, 24), { lines: 2, seq: '\x1b[<65;1;1M\x1b[<65;1;1M', remainderPx: 2 });
});
test('wheelScroll: negative accum → wheel up (64), ceiled lines', () => {
  assert.deepEqual(wheelScroll(-50, 24), { lines: -2, seq: '\x1b[<64;1;1M\x1b[<64;1;1M', remainderPx: -2 });
});
test('wheelScroll: sub-cell → no lines, accum preserved', () => {
  assert.deepEqual(wheelScroll(10, 24), { lines: 0, seq: '', remainderPx: 10 });
  assert.deepEqual(wheelScroll(-10, 24), { lines: 0, seq: '', remainderPx: -10 });
});
test('wheelScroll: exact multiple → zero remainder', () => {
  assert.deepEqual(wheelScroll(48, 24), { lines: 2, seq: '\x1b[<65;1;1M\x1b[<65;1;1M', remainderPx: 0 });
});

// ── wsCloseAction ──
test('wsCloseAction: terminal codes', () => {
  assert.equal(wsCloseAction(4001), 'auth');
  assert.equal(wsCloseAction(4004), 'session-gone');
});
test('wsCloseAction: everything else reconnects', () => {
  assert.equal(wsCloseAction(1006), 'reconnect');
  assert.equal(wsCloseAction(1000), 'reconnect');
  assert.equal(wsCloseAction(1005), 'reconnect');
});

// ── isPongFrame ──
test('isPongFrame: pong control frame', () => {
  assert.equal(isPongFrame('{"type":"pong"}'), true);
});
test('isPongFrame: other frames and garbage → false', () => {
  assert.equal(isPongFrame('{"type":"error","message":"x"}'), false);
  assert.equal(isPongFrame('{}'), false);
  assert.equal(isPongFrame('not json'), false);
  assert.equal(isPongFrame(''), false);
});
