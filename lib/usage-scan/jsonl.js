// lib/usage-scan/jsonl.js
// Tolerant JSONL reader: read whole file, split on newline, JSON.parse each
// non-empty line, skip parse failures. Whole-file read is fine for our sizes
// (matches the prior lib/usage.js approach). Callback gets the parsed object.

import { readFileSync } from 'node:fs';

export function forEachJsonLine(absPath, onObject) {
  let text;
  try {
    text = readFileSync(absPath, 'utf8');
  } catch {
    return; // missing/unreadable -> no-op
  }
  for (const line of text.split('\n')) {
    if (!line) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    onObject(obj);
  }
}
