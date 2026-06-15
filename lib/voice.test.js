import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, chmodSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Each test sets env fresh; voice.js reads env inside functions (not at module top).
function freshEnv() {
  delete process.env.VOICE_ENABLED;
  delete process.env.WHISPER_BIN;
  delete process.env.WHISPER_MODEL;
  delete process.env.VOICE_LANG;
}

// A fake whisper-cli: parses -of <base> and writes "<base>.txt".
function makeFakeWhisper(dir, transcript = 'guten morgen test') {
  const bin = join(dir, 'fake-whisper.sh');
  writeFileSync(bin, `#!/bin/sh
base=""
while [ $# -gt 0 ]; do
  case "$1" in
    -of) base="$2"; shift 2;;
    *) shift;;
  esac
done
printf '%s\\n' "${transcript}" > "$base.txt"
`);
  chmodSync(bin, 0o755);
  return bin;
}

function fakeModel(dir) {
  const m = join(dir, 'model.bin');
  writeFileSync(m, 'not-a-real-model');
  return m;
}

test('isEnabled: false when model missing', async () => {
  freshEnv();
  const dir = mkdtempSync(join(tmpdir(), 'voice-'));
  try {
    process.env.WHISPER_BIN = makeFakeWhisper(dir);
    process.env.WHISPER_MODEL = join(dir, 'does-not-exist.bin');
    const voice = await import(`./voice.js?cfg1=${Date.now()}`);
    assert.equal(voice.isEnabled(), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('isEnabled: false when bin missing', async () => {
  freshEnv();
  const dir = mkdtempSync(join(tmpdir(), 'voice-'));
  try {
    process.env.WHISPER_BIN = join(dir, 'no-bin');
    process.env.WHISPER_MODEL = fakeModel(dir);
    const voice = await import(`./voice.js?cfg2=${Date.now()}`);
    assert.equal(voice.isEnabled(), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('isEnabled: true when bin + model present', async () => {
  freshEnv();
  const dir = mkdtempSync(join(tmpdir(), 'voice-'));
  try {
    process.env.WHISPER_BIN = makeFakeWhisper(dir);
    process.env.WHISPER_MODEL = fakeModel(dir);
    const voice = await import(`./voice.js?cfg3=${Date.now()}`);
    assert.equal(voice.isEnabled(), true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('isEnabled: false when VOICE_ENABLED=false despite bin+model', async () => {
  freshEnv();
  const dir = mkdtempSync(join(tmpdir(), 'voice-'));
  try {
    process.env.WHISPER_BIN = makeFakeWhisper(dir);
    process.env.WHISPER_MODEL = fakeModel(dir);
    process.env.VOICE_ENABLED = 'false';
    const voice = await import(`./voice.js?cfg4=${Date.now()}`);
    assert.equal(voice.isEnabled(), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Minimal-WAV (44-Byte-Header + 0 Samples) — Inhalt egal, der Fake-whisper liest ihn nicht.
const WAV = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(40)]);

test('transcribe: returns trimmed text from fake whisper', async () => {
  freshEnv();
  const dir = mkdtempSync(join(tmpdir(), 'voice-'));
  try {
    process.env.WHISPER_BIN = makeFakeWhisper(dir, '  commit das  ');
    process.env.WHISPER_MODEL = fakeModel(dir);
    const voice = await import(`./voice.js?tr1=${Date.now()}`);
    const { text } = await voice.transcribe(WAV, {});
    assert.equal(text, 'commit das');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('transcribe: lang override is passed (de default else override)', async () => {
  freshEnv();
  const dir = mkdtempSync(join(tmpdir(), 'voice-'));
  try {
    // Fake echoes back the -l value so we can assert it.
    const bin = join(dir, 'lang-whisper.sh');
    writeFileSync(bin, `#!/bin/sh
base=""; lang=""
while [ $# -gt 0 ]; do
  case "$1" in
    -of) base="$2"; shift 2;;
    -l) lang="$2"; shift 2;;
    *) shift;;
  esac
done
printf 'lang=%s' "$lang" > "$base.txt"
`);
    chmodSync(bin, 0o755);
    process.env.WHISPER_BIN = bin;
    process.env.WHISPER_MODEL = fakeModel(dir);
    const voice = await import(`./voice.js?tr2=${Date.now()}`);
    const def = await voice.transcribe(WAV, {});
    assert.equal(def.text, 'lang=de');
    const en = await voice.transcribe(WAV, { lang: 'en' });
    assert.equal(en.text, 'lang=en');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('transcribe: single-flight rejects concurrent call with BUSY', async () => {
  freshEnv();
  const dir = mkdtempSync(join(tmpdir(), 'voice-'));
  try {
    // Fake sleeps briefly so the first call is still in-flight.
    const bin = join(dir, 'slow-whisper.sh');
    writeFileSync(bin, `#!/bin/sh
base=""
while [ $# -gt 0 ]; do case "$1" in -of) base="$2"; shift 2;; *) shift;; esac; done
sleep 0.3
printf 'ok' > "$base.txt"
`);
    chmodSync(bin, 0o755);
    process.env.WHISPER_BIN = bin;
    process.env.WHISPER_MODEL = fakeModel(dir);
    const voice = await import(`./voice.js?tr3=${Date.now()}`);
    const p1 = voice.transcribe(WAV, {});
    await assert.rejects(voice.transcribe(WAV, {}), (e) => e.code === 'BUSY');
    await p1; // first completes fine
    // inFlight must have reset → a fresh call succeeds (not BUSY)
    const after = await voice.transcribe(WAV, {});
    assert.equal(after.text, 'ok');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('transcribe: temp dir is cleaned up even on whisper failure', async () => {
  freshEnv();
  const dir = mkdtempSync(join(tmpdir(), 'voice-'));
  try {
    // Fake exits non-zero, writes no txt.
    const bin = join(dir, 'fail-whisper.sh');
    writeFileSync(bin, `#!/bin/sh
exit 2
`);
    chmodSync(bin, 0o755);
    process.env.WHISPER_BIN = bin;
    process.env.WHISPER_MODEL = fakeModel(dir);
    const voice = await import(`./voice.js?tr4=${Date.now()}`);
    const before = readdirSync(tmpdir()).filter((n) => n.startsWith('pen-voice-')).length;
    await assert.rejects(voice.transcribe(WAV, {}));
    const after = readdirSync(tmpdir()).filter((n) => n.startsWith('pen-voice-')).length;
    assert.equal(after, before, 'no leaked pen-voice- temp dirs');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
