# Rename: Claude Code Hub -> CrewHelm

**Date:** 2026-04-16
**Status:** Approved

## Summary

Rename the project from "Claude Code Hub" to **CrewHelm** to avoid trademark
conflict with Anthropic's "Claude" / "Claude Code" brand. The name is
verified clear on npm, PyPI, GitHub (0 repos), Docker Hub, all major TLDs,
and USPTO trademark search.

## Naming Convention

All identifiers follow a consistent mapping:

| Context              | Old                          | New                        |
|----------------------|------------------------------|----------------------------|
| Display name         | Claude Code Hub              | CrewHelm                   |
| npm package          | `claude-code-hub`            | `crewhelm`                 |
| GitHub Repo          | `DerRemo/claude-code-hub`    | `DerRemo/crewhelm`         |
| Session prefix       | `cc-`                        | `ch-`                      |
| Env variables        | `CC_HUB_SESSION`, `CC_HUB_URL`, `CC_HUB_TOKEN` | `CH_SESSION`, `CH_URL`, `CH_TOKEN` |
| localStorage         | `cchub_token`                | `ch_token`                 |
| LaunchAgent          | `com.claude-code-hub`        | `com.crewhelm`             |
| Data directory       | `~/.claude-code-hub/`        | `~/.crewhelm/`             |
| SW cache             | `cchub-cache-v1`             | `ch-cache-v1`              |
| PWA manifest name    | Claude Code Hub              | CrewHelm                   |
| Hook sentinel        | `"_owner": "claude-code-hub"`| `"_owner": "crewhelm"`     |
| StatusLine sentinels | `#CCH-SL-START#` / `#CCH-SL-END#` | `#CH-SL-START#` / `#CH-SL-END#` |

## Affected Files (25 files, ~144 occurrences)

### Code (logic-relevant)

- `server.js` — env vars, session prefix, hook sentinel, data dir
- `setup.sh` — LaunchAgent ID, hook install, StatusLine sentinels, data dir
- `lib/attention.js` — data dir
- `lib/usage-limits.js` — data dir
- `lib/known-sessions.js` — data dir
- `lib/projects.js` — data dir
- `lib/audit-log.js` — data dir
- `lib/push-subscriptions.js` — data dir
- `lib/mutations.js` — data dir
- `lib/files.js` — data dir
- `public/index.html` — display name, localStorage keys, SW registration, PWA refs
- `public/sw.js` — cache name
- `public/manifest.webmanifest` — app name

### Tests

- `tests/helpers.js` — session prefix, data dir
- `tests/fixtures.js` — session prefix, data dir
- `tests/global-setup.js` — session prefix
- `tests/filebrowser.spec.js` — session prefix
- `tests/terminal.spec.js` — session prefix
- `lib/files.test-helpers.js` — data dir
- `lib/push-subscriptions.test.js` — data dir

### Docs

- `CLAUDE.md` — name, examples, commands
- `README.md` — name, examples, commands
- `ROADMAP.md` — header/title
- `package.json` — package name
- `package-lock.json` — not manually edited; regenerated via `npm install` after `package.json` change

### Outside repo (affected by migration + setup.sh)

- `~/.claude/settings.json` — hook block with sentinel
- `~/.claude/statusline-command.sh` — reporting block with sentinel
- `~/Library/LaunchAgents/com.claude-code-hub.plist` — LaunchAgent
- `~/.claude-code-hub/` — entire data directory

## Repo Strategy

- **`DerRemo/claude-code-hub`** stays as-is. Final commit adds `migrate.sh`
  and a deprecation notice in README pointing to the new repo.
- **`DerRemo/crewhelm`** is created as a new repo with the renamed code
  and full git history.

## Migration Script (`migrate.sh` in old repo)

The script runs in the old repo before the user clones the new one:

1. **Kill running sessions** — list all `cc-*` tmux sessions, confirm with
   user, then kill them.
2. **Move data directory** — `mv ~/.claude-code-hub ~/.crewhelm`. Abort if
   `~/.crewhelm` already exists.
3. **Remove old hooks** — delete entries with `"_owner": "claude-code-hub"`
   from `~/.claude/settings.json` via `jq`.
4. **Remove old StatusLine block** — delete `#CCH-SL-START#` to
   `#CCH-SL-END#` from `~/.claude/statusline-command.sh` via `sed`.
5. **Remove old LaunchAgent** — `launchctl bootout` + delete old plist.
6. **Print next steps** — clone `crewhelm` and run `./setup.sh`.

### User flow

```bash
# In old repo:
cd claude-code-hub
git pull
./migrate.sh

# Clone new repo:
cd ..
git clone https://github.com/DerRemo/crewhelm.git
cd crewhelm
./setup.sh
```

## Scope

### In scope

- Rename all 25 files in the repo (code, tests, docs)
- `migrate.sh` in old repo
- Deprecation notice in old README
- `package.json` name + description in English
- `CLAUDE.md` fully updated
- `README.md` fully updated
- `ROADMAP.md` header/title updated
- `manifest.webmanifest` app name

### Explicitly out of scope

- UI text localization to English (separate feature)
- Domain registration / Cloudflare tunnel reconfiguration
- npm publish
- New logo / branding
