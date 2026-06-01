import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Redirect the registry to a temp dir BEFORE importing projects.js, so the
// test never touches the user's real ~/.claude-code-hub registry. Dynamic
// import ensures projects.js reads the env at module-eval time after we set it.
const regDir = mkdtempSync(join(tmpdir(), 'cchub-reg-'));
process.env.CCHUB_REGISTRY_DIR = regDir;
const { listProjects, discoverProjects } = await import('./projects.js');

test('listProjects exposes ROADMAP.md mtimeMs', async () => {
  const root = mkdtempSync(join(tmpdir(), 'cchub-proj-'));
  const proj = join(root, 'demo');
  mkdirSync(proj);
  writeFileSync(join(proj, 'ROADMAP.md'), '## Released: v1.0.0\n\n- [x] done\n');
  await discoverProjects([root]);
  const list = await listProjects();
  const entry = list.find(p => p.path === proj);
  assert.ok(entry, 'project should be discovered');
  assert.equal(typeof entry.mtimeMs, 'number');
  assert.ok(entry.mtimeMs > 0);
  rmSync(root, { recursive: true, force: true });
  rmSync(regDir, { recursive: true, force: true });
});
