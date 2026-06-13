import { realpathSync, lstatSync, readdirSync, statSync, existsSync, createWriteStream, createReadStream } from 'fs';
import { readFile as fsReadFile, mkdir as fsMkdir, rename as fsRename, cp as fsCp, unlink as fsUnlink, open as fsOpen } from 'fs/promises';
import { execFile as execFileCb, execFileSync } from 'child_process';
import { promisify } from 'util';
import { resolve, relative, join, sep, basename, dirname } from 'path';

const execFile = promisify(execFileCb);

export class FileError extends Error {
  constructor(code, message, meta = {}) {
    super(message);
    this.code = code;
    this.meta = meta;
  }
}

const DEFAULT_IGNORES = new Set(['.git', 'node_modules', '.DS_Store', 'dist', 'build']);

export function resolveSafe(projectRoot, relPath = '') {
  const rootReal = realpathSync(projectRoot);
  const abs = resolve(rootReal, relPath || '.');
  let existing = abs;
  const missingParts = [];

  while (true) {
    try {
      const existingReal = realpathSync(existing);
      const real = missingParts.length ? resolve(existingReal, ...missingParts) : existingReal;
      assertUnderRootReal(rootReal, real, relPath);
      return real;
    } catch (e) {
      if (e instanceof FileError) throw e;
      if (e.code !== 'ENOENT') throw e;
      const parent = dirname(existing);
      if (parent === existing) throw e;
      missingParts.unshift(basename(existing));
      existing = parent;
    }
  }
}

function assertUnderRootReal(rootReal, absPath, relPath) {
  const rel = relative(rootReal, absPath);
  if (rel.startsWith('..') || rel === '..' || (rel && rel.split(sep)[0] === '..')) {
    throw new FileError('forbidden', `Path escapes project root: ${relPath}`);
  }
}

function assertUnderRoot(projectRoot, absPath, relPath) {
  assertUnderRootReal(realpathSync(projectRoot), absPath, relPath);
}

export function listDir(projectRoot, relPath = '', { all = false } = {}) {
  const abs = resolveSafe(projectRoot, relPath);
  const st = statSync(abs);
  if (!st.isDirectory()) throw new FileError('not-a-dir', `Not a directory: ${relPath}`);
  const names = readdirSync(abs);
  const entries = [];
  for (const name of names) {
    if (!all && DEFAULT_IGNORES.has(name)) continue;
    if (!all && name.startsWith('.') && name !== '.env') continue;
    const entAbs = join(abs, name);
    let info;
    try { info = lstatSync(entAbs); } catch { continue; }
    entries.push({
      name,
      type: info.isDirectory() ? 'dir' : info.isSymbolicLink() ? 'symlink' : 'file',
      size: info.size,
      mtime: info.mtimeMs,
      isSymlink: info.isSymbolicLink(),
      ignored: false,
    });
  }
  // git check-ignore in EINEM Aufruf für alle Einträge dieses Verzeichnisses.
  // Kein Repo / kein git → alles ignored:false (No-op). Pfade relativ zur Wurzel.
  markIgnored(projectRoot, relPath, entries);
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return { path: relPath || '', entries };
}

// Setzt entry.ignored via `git check-ignore --stdin`. Fehlertolerant:
// kein Repo / git fehlt / Fehler → keine Markierung (alles bleibt false).
function markIgnored(projectRoot, relPath, entries) {
  if (!entries.length) return;
  try {
    execFileSync('git', ['-C', projectRoot, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8', timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch { return; } // kein Repo → No-op
  const relPaths = entries.map(e => (relPath ? `${relPath}/${e.name}` : e.name));
  let ignoredSet = new Set();
  try {
    const out = execFileSync('git', ['-C', projectRoot, 'check-ignore', '--stdin'], {
      input: relPaths.join('\n'), encoding: 'utf8', timeout: 1500,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    ignoredSet = new Set(out.split('\n').map(s => s.trim()).filter(Boolean));
  } catch (e) {
    // git check-ignore exit 1 = "nichts ignoriert" → stdout trotzdem leer; ok.
    if (e.stdout) ignoredSet = new Set(String(e.stdout).split('\n').map(s => s.trim()).filter(Boolean));
  }
  for (let i = 0; i < entries.length; i++) {
    if (ignoredSet.has(relPaths[i])) entries[i].ignored = true;
  }
}

const TEXT_LIMIT = 2 * 1024 * 1024;
const IMAGE_LIMIT = 10 * 1024 * 1024;
const PDF_LIMIT = 10 * 1024 * 1024;

const IMAGE_SIGNATURES = [
  { mime: 'image/png', match: (b) => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 },
  { mime: 'image/jpeg', match: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/gif', match: (b) => b.length >= 6 && (b.slice(0, 6).toString() === 'GIF89a' || b.slice(0, 6).toString() === 'GIF87a') },
  { mime: 'image/webp', match: (b) => b.length >= 12 && b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP' },
  { mime: 'image/svg+xml', match: (b) => /^<\?xml|^<svg/i.test(b.slice(0, 200).toString('utf8')) },
];

function detectImage(buf) {
  for (const sig of IMAGE_SIGNATURES) {
    if (sig.match(buf)) return sig.mime;
  }
  return null;
}

function looksLikeText(buf) {
  const sample = buf.slice(0, 1024);
  let nonPrintable = 0;
  for (let i = 0; i < sample.length; i++) {
    const c = sample[i];
    if (c === 0) return false;
    if (c < 9 || (c > 13 && c < 32 && c !== 27)) nonPrintable++;
  }
  return nonPrintable / sample.length < 0.05;
}

const LANG_BY_EXT = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript', jsx: 'javascript',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
  md: 'markdown', html: 'html', css: 'css', scss: 'scss',
  sh: 'bash', zsh: 'bash', bash: 'bash', env: 'bash',
  sql: 'sql', xml: 'xml', dockerfile: 'dockerfile',
};

export async function readFile(projectRoot, relPath) {
  const abs = resolveSafe(projectRoot, relPath);
  const st = statSync(abs);
  if (!st.isFile()) throw new FileError('not-a-file', `Not a file: ${relPath}`);
  const ext = (relPath.split('.').pop() || '').toLowerCase();

  if (ext === 'pdf') {
    if (st.size > PDF_LIMIT) throw new FileError('oversize', 'PDF too large', { size: st.size, limit: PDF_LIMIT });
    const buf = await fsReadFile(abs);
    return { kind: 'pdf', mime: 'application/pdf', buffer: buf, size: st.size };
  }

  if (st.size > IMAGE_LIMIT) {
    throw new FileError('oversize', 'File too large', { size: st.size, limit: IMAGE_LIMIT });
  }

  const head = await fsReadFile(abs);
  const imageMime = detectImage(head);
  if (imageMime) {
    return { kind: 'image', mime: imageMime, buffer: head, size: st.size };
  }

  if (looksLikeText(head)) {
    if (st.size > TEXT_LIMIT) throw new FileError('oversize', 'Text too large', { size: st.size, limit: TEXT_LIMIT });
    return {
      kind: 'text',
      mime: 'text/plain',
      buffer: head,
      size: st.size,
      detectedLang: LANG_BY_EXT[ext] || 'plaintext',
    };
  }

  throw new FileError('unsupported', 'Unsupported binary file type', { size: st.size });
}

export async function mkdir(projectRoot, parentRel, name) {
  if (!/^[^/\\]+$/.test(name)) throw new FileError('bad-name', 'Invalid folder name');
  const parent = resolveSafe(projectRoot, parentRel);
  const target = join(parent, name);
  await fsMkdir(target, { recursive: true });
  return { path: relative(projectRoot, target) };
}

export async function createEmptyFile(projectRoot, parentRel, name) {
  // Name darf kein Pfad-Segment sein (kein / oder \) — sonst bad-name.
  if (!/^[^/\\]+$/.test(name)) throw new FileError('bad-name', 'Invalid file name');
  const parent = resolveSafe(projectRoot, parentRel);
  const target = join(parent, name);
  // Guard: das geschriebene Ziel muss unter der Wurzel bleiben.
  assertUnderRoot(projectRoot, target, join(parentRel || '', name));
  if (existsSync(target)) throw new FileError('exists', 'File exists');
  // 'wx' = exclusive create → atomar, scheitert wenn schon da (Race-safe).
  const fh = await fsOpen(target, 'wx');
  await fh.close();
  // resolveSafe gibt den realpath zurück (auf macOS /tmp → /private/tmp). Den
  // cwd-relativen Pfad daher gegen die aufgelöste Wurzel rechnen.
  return { path: relative(realpathSync(projectRoot), target) };
}

// Zentralisiert die Zielauflösung für renameOrMove UND copy.
// Keystone: ist `toRel` ein existierender Ordner, wird basename(from) angehängt.
// Liefert { from, target } (absolute Pfade) oder wirft FileError.
export function resolveMoveTarget(projectRoot, fromRel, toRel) {
  const from = resolveSafe(projectRoot, fromRel);
  if (!existsSync(from)) throw new FileError('not-found', `Source not found: ${fromRel}`);
  const toAbs = resolveSafe(projectRoot, toRel);
  const target = (existsSync(toAbs) && statSync(toAbs).isDirectory())
    ? join(toAbs, basename(from))
    : toAbs;
  assertUnderRoot(projectRoot, target, toRel);
  if (!existsSync(dirname(target))) {
    throw new FileError('not-found', 'Destination folder does not exist');
  }
  if (target === from) throw new FileError('same-path', 'Source and target are the same');
  if (statSync(from).isDirectory() && (target === from || target.startsWith(from + sep))) {
    throw new FileError('into-self', 'Cannot move a folder into itself');
  }
  return { from, target };
}

export async function renameOrMove(projectRoot, fromRel, toRel, { onConflict } = {}) {
  const { from, target: t0 } = resolveMoveTarget(projectRoot, fromRel, toRel);
  let target = t0;
  if (existsSync(target)) {
    if (!onConflict) {
      throw new FileError('exists', 'Target exists', {
        suggested: nextFreeName(dirname(target), basename(target)),
      });
    } else if (onConflict === 'rename') {
      target = join(dirname(target), nextFreeName(dirname(target), basename(target)));
    } else if (onConflict === 'overwrite') {
      if (statSync(target).isDirectory()) throw new FileError('exists', 'Cannot overwrite a directory');
      // Datei: fsRename überschreibt atomar — kein explizites unlink nötig.
    }
  }
  await fsRename(from, target);
  return { path: relative(realpathSync(projectRoot), target) };
}

export async function copy(projectRoot, fromRel, toRel, { onConflict } = {}) {
  const { from, target: t0 } = resolveMoveTarget(projectRoot, fromRel, toRel);
  let target = t0;
  let force = false;
  if (existsSync(target)) {
    if (!onConflict) {
      throw new FileError('exists', 'Target exists', {
        suggested: nextFreeName(dirname(target), basename(target)),
      });
    } else if (onConflict === 'rename') {
      target = join(dirname(target), nextFreeName(dirname(target), basename(target)));
    } else if (onConflict === 'overwrite') {
      if (statSync(target).isDirectory()) throw new FileError('exists', 'Cannot overwrite a directory');
      force = true; // Datei überschreiben
    }
  }
  await fsCp(from, target, { recursive: true, errorOnExist: !force, force });
  return { path: relative(realpathSync(projectRoot), target) };
}

// Liefert den nächsten freien `name-<i>.ext` in parentAbs. Geteilt von
// writeStream (Upload-Konflikt), renameOrMove und copy.
export function nextFreeName(parentAbs, name) {
  const base = name.replace(/\.[^.]+$/, '');
  const ext = name.slice(base.length);
  let i = 1;
  let candidate;
  do {
    candidate = `${base}-${i}${ext}`;
    i++;
  } while (existsSync(join(parentAbs, candidate)));
  return candidate;
}

export async function writeStream(projectRoot, parentRel, name, stream, { onConflict = 'rename' } = {}) {
  if (!/^[^/\\]+$/.test(name)) throw new FileError('bad-name', 'Invalid file name');
  const parent = resolveSafe(projectRoot, parentRel);
  await fsMkdir(parent, { recursive: true });
  let targetName = name;
  let targetAbs = join(parent, targetName);
  assertUnderRoot(projectRoot, targetAbs, join(parentRel || '', targetName));
  if (existsSync(targetAbs)) {
    if (onConflict === 'rename') {
      targetName = nextFreeName(parent, name);
      targetAbs = join(parent, targetName);
      assertUnderRoot(projectRoot, targetAbs, join(parentRel || '', targetName));
    } else if (onConflict !== 'overwrite') {
      throw new FileError('exists', 'File exists', { suggested: nextFreeName(parent, name) });
    }
  }
  const tmp = targetAbs + '.cchub-upload-' + Date.now();
  try {
    await new Promise((resolve, reject) => {
      const out = createWriteStream(tmp);
      stream.pipe(out);
      stream.on('limit', () => {
        out.destroy();
        reject(new FileError('oversize', 'Upload too large'));
      });
      stream.on('error', reject);
      out.on('error', reject);
      out.on('finish', resolve);
    });
    if (stream.truncated) throw new FileError('oversize', 'Upload too large');
    await fsRename(tmp, targetAbs);
  } catch (e) {
    try { await fsUnlink(tmp); } catch {}
    throw e;
  }
  return { path: relative(projectRoot, targetAbs), name: targetName };
}

export async function deleteToTrash(projectRoot, relPaths) {
  const absPaths = relPaths.map(p => resolveSafe(projectRoot, p));
  try {
    await execFile('/usr/bin/trash', absPaths);
  } catch (e) {
    throw new FileError('trash-failed', e.stderr?.toString() || e.message);
  }
  return { count: absPaths.length };
}

export function streamFileToResponse(projectRoot, relPath, res) {
  const abs = resolveSafe(projectRoot, relPath);
  let st;
  try {
    st = statSync(abs);
  } catch (e) {
    if (e && e.code === 'ENOENT') throw new FileError('not-found', `File not found: ${relPath}`);
    throw e;
  }
  if (!st.isFile()) throw new FileError('not-a-file', `Not a file: ${relPath}`);

  const name = basename(abs);
  const asciiName = name.replace(/[^\x20-\x7E]/g, '_');
  const encoded = encodeURIComponent(name);

  res.setHeader('Content-Length', st.size);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${asciiName}"; filename*=UTF-8''${encoded}`
  );

  const rs = createReadStream(abs);
  rs.on('error', (err) => {
    console.error('[files] stream error:', err);
    if (!res.headersSent) {
      try { res.status(500).json({ error: 'stream-error' }); }
      catch { res.destroy(err); }
    } else {
      res.destroy(err);
    }
  });
  rs.pipe(res);
  return rs;
}
