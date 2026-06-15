// Lokale Sprach-Transkription via whisper.cpp (C++-Binary, Metal auf Apple Silicon).
// Async execFile (NICHT execFileSync) — eine 1–2s-Transkription darf den
// Event-Loop nicht blockieren. Argv-Array → kein Shell-Interp (Projekt-Konvention).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

const execFileP = promisify(execFile);

// Env wird absichtlich IN den Funktionen gelesen (nicht modul-top), damit Tests
// pro Fall frische Werte setzen können.
export function resolveBin() {
  // Wenn WHISPER_BIN explizit gesetzt ist, nur diesen Pfad prüfen (kein Fallback).
  // Fallbacks greifen nur wenn WHISPER_BIN komplett fehlt.
  if (process.env.WHISPER_BIN) {
    return existsSync(process.env.WHISPER_BIN) ? process.env.WHISPER_BIN : null;
  }
  const fallbacks = ['/opt/homebrew/bin/whisper-cli', '/usr/local/bin/whisper-cli'];
  for (const p of fallbacks) { if (existsSync(p)) return p; }
  return null;
}

export function modelPath() {
  return process.env.WHISPER_MODEL
    || join(homedir(), '.penates', 'models', 'ggml-large-v3-turbo-q5_0.bin');
}

export function langDefault() {
  return process.env.VOICE_LANG || 'de';
}

export function isEnabled() {
  if (process.env.VOICE_ENABLED === 'false') return false;
  return !!resolveBin() && existsSync(modelPath());
}

let inFlight = false;

// Transkribiert einen 16-kHz-Mono-WAV-Buffer. Liefert { text }.
// Fehler-Codes: BUSY (parallele Anfrage), DISABLED (bin/modell fehlt).
export async function transcribe(wavBuffer, opts = {}) {
  if (inFlight) { const e = new Error('transcription busy'); e.code = 'BUSY'; throw e; }
  const bin = resolveBin();
  if (!bin) { const e = new Error('whisper not installed'); e.code = 'DISABLED'; throw e; }
  const model = modelPath();
  if (!existsSync(model)) { const e = new Error('whisper model missing'); e.code = 'DISABLED'; throw e; }
  const lang = opts.lang || langDefault();

  inFlight = true;
  try {
    const dir = mkdtempSync(join(tmpdir(), 'pen-voice-'));
    const wav = join(dir, 'in.wav');
    const outBase = join(dir, 'out');
    try {
      writeFileSync(wav, wavBuffer);
      // -nt: keine Timestamps, -otxt -of <base>: schreibt <base>.txt (robuster als stdout-Parsing).
      // Hinweis: bei stiller/leerer Audio kann whisper exit 0 OHNE .txt schreiben → readFileSync
      // wirft ENOENT, propagiert sauber (inFlight wird zurückgesetzt, Temp-Dir geräumt).
      await execFileP(bin, ['-m', model, '-l', lang, '-nt', '-otxt', '-of', outBase, '-f', wav], {
        timeout: 30_000,
        maxBuffer: 8 * 1024 * 1024,
      });
      const txt = readFileSync(outBase + '.txt', 'utf8');
      return { text: txt.trim() };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  } finally {
    inFlight = false;
  }
}
