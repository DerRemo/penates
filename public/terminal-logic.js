// Pure logic extracted from connectToSession / openTerminalWebSocket / the
// touch-scroll handler in index.html. No DOM, window, term, or ws references.
// Imported statically by index.html (synchronous hot-path callers). Tested in
// terminal-logic.test.js. The reconnect backoff lives separately in backoff.js.

// Ctrl-transform for the touch-toolbar sticky-Ctrl: a single ASCII char in
// 0x40..0x7E becomes its C0 control char (code & 0x1f); anything else → null
// (caller passes the data through unchanged).
export function ctrlByte(data) {
  if (data.length !== 1) return null;
  const code = data.charCodeAt(0);
  if (code >= 0x40 && code <= 0x7e) return String.fromCharCode(code & 0x1f);
  return null;
}

// Touch-scroll → SGR mouse-wheel sequence. accumPx is the accumulated finger
// delta (>0 = finger up = wheel down), cellH the current xterm cell height.
// Returns the whole-line count (signed), the escape sequence repeated once per
// line (button 64 = up, 65 = down), and the sub-cell remainder to carry forward.
export function wheelScroll(accumPx, cellH) {
  const lines = accumPx > 0 ? Math.floor(accumPx / cellH) : Math.ceil(accumPx / cellH);
  if (lines === 0) return { lines: 0, seq: '', remainderPx: accumPx };
  const button = lines < 0 ? 64 : 65;
  const seq = `\x1b[<${button};1;1M`.repeat(Math.abs(lines));
  return { lines, seq, remainderPx: accumPx - lines * cellH };
}

// WS close-code decision. 4001 = auth failed, 4004 = session gone (both
// terminal, no reconnect); everything else → reconnect.
export function wsCloseAction(code) {
  if (code === 4001) return 'auth';
  if (code === 4004) return 'session-gone';
  return 'reconnect';
}

// True iff a string WS frame is the {type:'pong'} heartbeat control message.
// Unknown/garbage frames → false (caller writes them to the terminal as before).
export function isPongFrame(str) {
  try {
    const m = JSON.parse(str);
    return !!(m && m.type === 'pong');
  } catch {
    return false;
  }
}
