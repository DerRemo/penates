// lib/mata.js — Wrapper um die Mata-Host-App (getmata.app, Moshi-Team).
// Express-frei, unit-testbar, fehlertolerant — Vorbild lib/moshi-hook.js + lib/voice.js.
// Alle externen Aufrufe via execFile/execFileSync mit Argv-Array (kein Shell-Interp).
// Env wird IN den Funktionen gelesen (nicht beim Import) → testbar.
// Single source of truth bleibt: tmux = Sessions, Mata-App = Simulator-State.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import net from 'node:net';
import http from 'node:http';

const execFileP = promisify(execFile);

export const MATA_PORT = 3070;
const DEFAULT_BIN = '/Applications/Mata.app/Contents/MacOS/mata';

// MATA_BIN (Env) autoritativ; sonst der Standard-App-Pfad. Pfad oder null.
export function resolveBin() {
  if (process.env.MATA_BIN) {
    return existsSync(process.env.MATA_BIN) ? process.env.MATA_BIN : null;
  }
  return existsSync(DEFAULT_BIN) ? DEFAULT_BIN : null;
}

export function isInstalled() {
  return !!resolveBin();
}

// Preview-Source-Switcher-Mapping (rein, unit-testbar): nur "mata" → 3070.
export function previewPortForSource(source) {
  return source === 'mata' ? MATA_PORT : null;
}

function coerceRunning(v) {
  if (typeof v === 'boolean') return v;
  if (v == null) return false;
  const s = String(v).toLowerCase();
  if (/not[\s-]*running|not[\s-]*started|stopped|inactive|false|off|\bno\b/.test(s)) return false;
  return /running|active|started|true|\bon\b|\byes\b/.test(s);
}

function finalize(running, pid, version, startedAt) {
  const out = { running: !!running };
  const p = pid != null ? parseInt((String(pid).match(/\d+/) || [''])[0], 10) : NaN;
  if (Number.isInteger(p)) out.pid = p;
  if (version != null && String(version).trim()) {
    // Echtes Feld ist z.B. "Mata 1.1.10 (18)" — sauberen Semver herausziehen,
    // sonst den getrimmten Rohwert (ohne führendes v) behalten.
    const vstr = String(version).trim();
    const semver = vstr.match(/\d+\.\d+(?:\.\d+)?/);
    out.version = semver ? semver[0] : vstr.replace(/^v/i, '');
  }
  if (startedAt != null && String(startedAt).trim()) out.startedAt = String(startedAt).trim();
  return out;
}

// Toleranter Parser über `mata status`-Output. Echtes Format ist v1 unbestätigt
// (Phase-0-Spike / Real-App-Review klärt es), daher bewusst mehrform-robust:
// JSON-Objekt ODER `key: value`/`key = value`-Textzeilen ODER bare running/stopped.
export function parseStatus(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return { running: false };
  if (s[0] === '{') {
    try {
      const j = JSON.parse(s);
      if (j && typeof j === 'object') {
        const runningRaw = j.running != null ? j.running : j.status;
        return finalize(coerceRunning(runningRaw), j.pid, j.version,
          j.startedAt ?? j.started_at ?? j.started ?? j.uptime);
      }
    } catch { /* kein JSON → Text-Pfad */ }
  }
  const kv = {};
  for (const line of s.split('\n')) {
    const m = line.match(/^\s*([A-Za-z][\w .-]*?)\s*[:=]\s*(.+?)\s*$/);
    if (m) kv[m[1].trim().toLowerCase()] = m[2].trim();
  }
  let running;
  const statusVal = kv['status'] ?? kv['state'] ?? kv['mata'];
  if (statusVal != null) running = coerceRunning(statusVal);
  else if (/\bnot[\s-]*running\b|\bstopped\b|\binactive\b|\bnot[\s-]*started\b/i.test(s)) running = false;
  else running = /\brunning\b|\bactive\b/i.test(s);
  return finalize(running, kv['pid'] ?? kv['process'] ?? kv['process id'],
    kv['version'] ?? kv['v'],
    kv['started'] ?? kv['started at'] ?? kv['startedat'] ?? kv['uptime'] ?? kv['since']);
}

// getStatus: `mata status` ausführen + parsen. null bei fehlender App,
// {running:false} bei Lauf-Fehler (CLI exit≠0 wenn nicht laufend → trotzdem Output parsen).
export async function getStatus() {
  const bin = resolveBin();
  if (!bin) return null;
  try {
    const { stdout } = await execFileP(bin, ['status'], { timeout: 4000, encoding: 'utf8' });
    return parseStatus(stdout);
  } catch (e) {
    const out = (e && e.stdout) || '';
    return out ? parseStatus(out) : { running: false };
  }
}

async function runAction(action) {
  const bin = resolveBin();
  if (!bin) return { ok: false, error: 'not installed' };
  try {
    await execFileP(bin, [action], { timeout: 8000 });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}
export const start = () => runAction('start');
export const stop = () => runAction('stop');
export const restart = () => runAction('restart');

// TCP-Connect-Probe auf den Viewer-Port. async → Promise<bool>. Opts für Tests.
export function isViewerPortOpen({ port = MATA_PORT, host = '127.0.0.1', timeout = 500 } = {}) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    const finish = (val) => { if (done) return; done = true; try { sock.destroy(); } catch {} resolve(val); };
    sock.setTimeout(timeout);
    sock.once('connect', () => finish(true));
    sock.once('timeout', () => finish(false));
    sock.once('error', () => finish(false));
    sock.connect(port, host);
  });
}

// GET http://localhost:3070/session/capture → {buffer, contentType} oder null
// (Port zu / Non-Image / Non-200 / Timeout). Niemals werfen.
export function captureFrame({ port = MATA_PORT, host = '127.0.0.1', path = '/session/capture', timeout = 4000 } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (val) => { if (settled) return; settled = true; resolve(val); };
    let req;
    try {
      req = http.get({ host, port, path, timeout }, (res) => {
        const ct = String(res.headers['content-type'] || '');
        if (res.statusCode !== 200 || !/^image\//i.test(ct)) { res.resume(); return done(null); }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => done({ buffer: Buffer.concat(chunks), contentType: ct }));
        res.on('error', () => done(null));
      });
    } catch { return done(null); }
    req.on('timeout', () => { try { req.destroy(); } catch {} done(null); });
    req.on('error', () => done(null));
  });
}
