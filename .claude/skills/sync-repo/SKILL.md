---
name: sync-repo
description: Analyze a local or GitHub code repo and reconcile its real state into the Personal Growth app — project status, features, and suggested skill evidence. Idempotent. Use when the user says "/sync-repo <path>", "sync my <name> repo", or wants skills/projects backfilled from actual code.
---

# sync-repo

Turn a real repo into structured `projects` + `project_features` + `project_skills` + **suggested** `skill_evidence` in the Personal Growth app. Runs on the Claude subscription (this is local analysis + one script call — no app LLM cost). Idempotent: re-running reconciles, never duplicates.

## Input

A repo, given as a local path (preferred — instant) or a GitHub URL (clone to a temp dir first). Examples: `/Users/dipankarsaha/portfolio`, `https://github.com/dip7501686040/ai-notification-system`.

## Steps

### 1. Get prior sync state (for an incremental pass)

```
pnpm sync-repo --state <project-slug>
```

`<project-slug>` = kebab-case of the repo/project name (e.g. `ai-notification-system`). Output JSON has `found`, `status`, `lastSyncedSha`, `featureKeys`, `knowledgeSlugs`.

- If `found` is false or `lastSyncedSha` is null → **full analysis** (step 2).
- Else → `git -C <repo> log --oneline <lastSyncedSha>..HEAD` and focus on what changed; still re-emit the full feature list AND the full `knowledge` list (the reconcile needs every current `sourceKey` / knowledge `slug` to detect stale ones), but you only need to deeply re-examine changed areas.

### 2. Analyze the repo

Read, in roughly this order, and stop when you have enough:

- `README*`, `ARCHITECTURE*`, `DESIGN*`, `docs/`
- `package.json` / `go.mod` / `requirements.txt` / `pyproject.toml` / `Cargo.toml` — the real dependency list
- `docker-compose*`, `Dockerfile*`, `infra/`, `deploy/`, `k8s/`, `helm/`, `.github/workflows/`, `vercel.json`, `terraform/`
- `CHANGELOG*`, git tags (`git -C <repo> tag`), `git -C <repo> log --oneline -50`
- Top-level source directory layout (2–3 levels)

Decide:

- **Project status** — `idea` / `planning` / `building` (active commits, deployable, not yet stable) / `completed` (in production, maintained). Be honest; the script only ever moves a project *forward*.
- **description / problemSolved / architecture** — 1–3 sentences each, from the README. (The script fills these only if empty — it won't overwrite anything the user wrote.)
- **repoUrl** (GitHub URL), **liveUrl** (deployed URL if you find one), **repoPath** (the local absolute path).
- **lastSyncedSha** — `git -C <repo> rev-parse HEAD`.

### 3. Extract features

A *feature* = a coherent capability a reviewer would recognize (from README feature sections, major modules/dirs, CHANGELOG entries, or clusters of related commits). Per feature:

- `sourceKey`: `repo:<repoUrl>:feature:<kebab-title>` — **must be stable across runs**; reuse the exact key from `featureKeys` if it's the same feature.
- `title`, `description` (1–2 sentences)
- `status`: `planned` / `in_progress` / `done`. `done` = actually shipped/working in the codebase.
- `completedAt`: ISO date from the last relevant commit, when `done`.
- `codePaths`: `{ "<jd-keyword>": "<repo-relative dir/file>" }` for the parts a job description would ask to see, e.g. `{"k8s":"infra/k8s","ci":".github/workflows","api":"src/api"}`. Only real paths.
- `demoVideoUrl`: only if the repo/README links one (usually omit).
- `skills`: the tech **actually used in this feature's code** → `{ name, category, role }`.
  - `category`: one of `language` `framework` `database` `infrastructure` `concept` `tool` `practice`.
  - `role`: `used` (present, wired in) or `demonstrated` (central, non-trivial use — the feature is a real showcase of it).
  - Match names to the user's existing skills where possible (k8s → "Kubernetes", "next" → "Next.js"). New names become new skill rows.
  - Be conservative — only skills a reviewer would agree the feature proves.

### 3b. Distil knowledge documents

`/sync-repo` is now the **only** pipeline that feeds the knowledge base (the
`github-sync` cron + Extraction Agent were retired). Emit a `knowledge` array of
**distilled facts** — never raw file contents. Aim for:

- **1 `repo_summary`** — what the project is, the problem it solves, the shape of
  the architecture, the stack. 1–2 paragraphs.
- **3–8 `decision` / `concept` docs** — real architecture decisions ("chose
  RabbitMQ over Kafka because…", "RLS enforced at the DB, not the app"),
  non-obvious patterns, hard-won lessons. One idea per doc.
- **1 `learning` doc per major feature** (optional) — the interesting technical
  substance of that feature, phrased as a fact a reviewer would find credible.

Per knowledge doc:

- `slug`: stable kebab id, **unique within this repo**, reused verbatim across
  runs (it's the reconcile anchor — reuse the exact slug from `knowledgeSlugs`
  when it's the same fact). e.g. `repo-summary`, `why-rabbitmq`, `rls-model`.
- `docType`: `repo_summary` | `decision` | `concept` | `learning`.
- `title`: short, specific.
- `body`: the distilled fact. Plain prose, self-contained, no code dumps. A few
  sentences to a couple of paragraphs.

The app upserts each (idempotent by content hash — an unchanged body is a
no-op), embeds it, links it to your skills/features, and **supersedes any
knowledge doc from a previous run of this repo that you don't re-emit**. Send
`"knowledge": []` to explicitly clear this repo's knowledge; omit the key only
if you deliberately want to leave it untouched.

### 4. Write the proposal + apply

Write the JSON to a temp file and run the script:

```
pnpm sync-repo /tmp/<slug>-proposal.json
```

Proposal shape:

```json
{
  "project": {
    "name": "AI Notification System",
    "repoUrl": "https://github.com/dip7501686040/ai-notification-system",
    "liveUrl": null,
    "repoPath": "/Users/dipankarsaha/ai-notification-system",
    "description": "...",
    "problemSolved": "...",
    "architecture": "...",
    "status": "building",
    "lastSyncedSha": "a1b2c3d"
  },
  "features": [
    {
      "sourceKey": "repo:https://github.com/dip7501686040/ai-notification-system:feature:websocket-fan-out",
      "title": "WebSocket fan-out delivery",
      "description": "Real-time push to connected clients via a Redis-backed pub/sub fan-out.",
      "status": "done",
      "completedAt": "2026-04-12",
      "codePaths": { "ws": "src/ws", "pubsub": "src/pubsub" },
      "skills": [
        { "name": "WebSockets", "category": "concept", "role": "demonstrated" },
        { "name": "Redis", "category": "database", "role": "used" },
        { "name": "Node.js", "category": "language", "role": "used" }
      ]
    }
  ],
  "knowledge": [
    {
      "slug": "repo-summary",
      "docType": "repo_summary",
      "title": "AI Notification System — overview",
      "body": "A multi-channel notification service that fans real-time events out to connected clients. NestJS microservices behind RabbitMQ; Redis-backed pub/sub for the WebSocket layer; Postgres for delivery state. Deployed on Kubernetes."
    },
    {
      "slug": "why-rabbitmq",
      "docType": "decision",
      "title": "RabbitMQ over Kafka for event transport",
      "body": "Chose RabbitMQ because delivery is per-user and low-volume with strict ordering per recipient, not a high-throughput log. Topic exchanges give per-channel routing without partition management."
    }
  ]
}
```

### 5. Report

Print the script output. Then tell the user:

- what changed (status move, features added/updated, skills created)
- how many **suggested** evidence rows were created, and that they should open **/skills** and Accept the ones that look right — **levels only move after they accept** (the sync never sets a level directly)
- any **stale** features (in the app but no longer detected in the repo) — the user decides keep or archive; the sync never deletes them
- the `knowledge:` line — docs upserted / embedded / linked / superseded. High-confidence links to skills & features are auto-accepted; the rest wait in the `/knowledge` review queue

### 6. Check for new content gaps

New `done` features rarely arrive with visual proof already attached. Right
after reporting, run:

```
pnpm content missing <project-slug>
```

If anything's listed, generate it now — while the repo's fresh in context —
rather than leaving it for job-search time. Use the Group A tooling directly
(`pnpm content terminal` / `register` / `record-steps`, same idempotency
guarantee: never duplicates a feature that already has a card). See
[[apply-content-queue]] if you want the fuller checklist (that skill is
written for the `/applications` queue, but the generation steps are the
same). This keeps every shipped feature's proof-of-work ready *before* it's
needed for a pitch, instead of blocking `/apply-morning` on it later.

## Rules

- Never invent features, skills, or knowledge. Only what the code supports.
- Knowledge docs are **distilled facts**, never raw file contents or long code blocks.
- One repo per run. For several, run once each.
- The script is the only writer — don't touch the DB directly.
- Re-running on an unchanged repo must produce `+0 new` features, `+0 suggested` evidence, and `0 upserted` knowledge (all `unchanged`).
