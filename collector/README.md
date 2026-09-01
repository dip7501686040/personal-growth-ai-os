# Personal AI Activity Collector

A tiny local companion that turns **Claude Code** sessions into evidence of real
development work, and syncs metadata (only) to your Personal Growth AI OS.

- **Zero dependencies.** Runs on Node's native TypeScript (Node **22.18+**; you're on 24).
- **Metadata only** — files changed, project, git branch, commit messages, git
  `--stat`, timestamps. **No source code, no diffs, no prompts, no AI responses.**
- **Offline-safe** — every session is written to a local JSONL queue before the
  network call; failed syncs are retried on the next hook.
- Your Mac does **not** need to be online for the cloud agents to work. This is an
  optional collector.

---

## How it works

```
Claude Code ── hooks ──▶  collector/src/index.ts <event>
                              │  accumulates per-session state in data/sessions/
                              ▼  (on SessionEnd) consolidates one coding_session
                       data/pending-events.jsonl   ← offline queue
                              │  POST + Bearer token
                              ▼
              <apiBaseUrl>/api/activity/ingest  →  activity_events (RECEIVED)
                              │  daily AI analysis (cron or "Analyze" button)
                              ▼
              activity_analyses  +  skill_evidence (status = SUGGESTED)
```

| Claude Code hook | Collector command | What it does |
|---|---|---|
| `SessionStart` | `session-start` | records session id, cwd, detected project, git branch + HEAD |
| `PostToolUse` (`Edit`/`Write`/`MultiEdit`) | `file-activity` | adds the touched file path to the session (no network) |
| `Stop` | `checkpoint` | flushes the offline queue |
| `SessionEnd` | `session-end` | builds one `coding_session` from `git status` / `git log` / `git diff --stat`, enqueues it, syncs |

---

## Setup

### 1. Get an ingest token

In the app: **Activity → Collector setup → Generate token**. Copy the token
(shown once).

```bash
cp collector/.env.example collector/.env
# put the token in PGAIOS_INGEST_TOKEN
```

### 2. Point it at your deployment

```bash
cp collector/config/config.example.json collector/config/config.json
```

Set `apiBaseUrl` to your Vercel URL. `projects` is an optional map of
`absolute path → name`; usually you don't need it — instead set **`repo_path`**
on each project in the app (Projects → project → repo path) to the repo's
absolute path, and the server links sessions automatically.

### 3. Install the Claude Code hooks

```bash
node collector/install.ts
```

This merges the four hooks into `~/.claude/settings.json` (backing it up first),
using absolute paths to your Node binary and this folder. Start a **new** Claude
Code session for them to take effect.

To do it manually instead, merge `collector/claude-hooks.example.json` into
`~/.claude/settings.json` yourself (replace `NODE_BIN` and `COLLECTOR`).

---

## Testing

```bash
# Simulate a session end from inside a git repo with uncommitted changes:
echo '{"session_id":"test-1","cwd":"'"$PWD"'"}' | node collector/src/index.ts session-start
echo '{"session_id":"test-1","tool_input":{"file_path":"'"$PWD"'/README.md"}}' | node collector/src/index.ts file-activity
echo '{"session_id":"test-1"}' | PGAIOS_DEBUG=1 node collector/src/index.ts session-end

# Inspect / drain the queue:
cat collector/data/pending-events.jsonl
node collector/src/index.ts sync
```

Offline behaviour: unplug the network, run a session — the event lands in
`data/pending-events.jsonl`. Reconnect, run any session (or `node
collector/src/index.ts sync`) and it uploads. A `401`/`400` response drops the
event (bad token / bad payload); everything else is retried.

---

## Disk usage — it cleans up after itself

Everything lives under `collector/data/` and is bounded:

- **`data/pending-events.jsonl`** — one line per session waiting to upload.
  Lines are removed as soon as they're sent. On every drain the queue is pruned:
  events older than 30 days are dropped, and it's capped at the last 1000.
  A successfully uploaded session leaves **nothing** locally.
- **`data/sessions/*.json`** — one tiny file per in-progress session, deleted on
  `SessionEnd`. If Claude Code is force-quit and `SessionEnd` never fires, the
  orphan is swept on the next `SessionStart` (or `… sync`) once it's >24h old.
- **`~/.claude/settings.json.bak-*`** — `install.ts` keeps only the 3 newest.

To wipe everything: `rm -rf collector/data`.

## Security

- The token lives only in `collector/.env` (gitignored). It is sent as
  `Authorization: Bearer …` over HTTPS and validated server-side against a
  hashed copy. Revoke or rotate it any time on the Activity page.
- The Supabase service-role key is **never** on your Mac.
- Nothing but the fields listed above leaves your machine.
