---
name: apply-morning
description: The morning job run — fetch + score today's matching jobs, let the user pick, and record each pick as a bare job.json in the ledger. Use when the user says "/apply-morning", "run the morning jobs", or "prep applications".
---

# apply-morning

Ties J1–J4 together. Fetch → score → pick → record `job.json` per pick → record
in the ledger. Nothing else gets generated here — no résumé, no proof-bundle,
no prose. Those cost real work (LLM calls, DB lookups) and a picked job can
still get rejected later, so they're deferred: `/apply-content-queue` adds the
proof-bundle when a job clears content-processing, and `/apply-drive` fills in
everything else, one file at a time, right when the form on screen needs it.

## 1. Fetch and score

```
pnpm jobs --json > /tmp/jobs.json
pnpm jobs            # human view: Group A (clean) then Group B (flagged)
```

The search blends two layers:
- **Manual** — `resume/job-search.json` (`titles`, `excludeTitles`, `skills` keyword list, filters). Hand-tuned.
- **Knowledge graph** — automatic (unless `useGraphMatch: false` or `pnpm jobs --no-graph`). Adds a few source-query terms from your implemented/proven skills, and re-scores the top ~50 jobs with the same matcher `get_proof_for_jd` uses. `skillMatch = max(keyword, graph)`, so a job the keyword list misses but your real projects match still rises.

Show the user the Group A list (and the top of B). Each row: score · company — role · remote-kind · LPA · reply-likelihood · skillMatch (with `graph N.NN` when the graph beat the keyword score) · [sources] · flags. The `graph:` header line reports the extra terms + how many jobs were graph-scored. Indices in `/tmp/jobs.json` are `groupA` then `groupB` concatenated (0-based).

If `pnpm jobs` reports skipped sources (missing keys), mention it once — coverage is lower without JSearch/Adzuna/SerpApi.

## 2. Pick

Ask which to prep — the user names indices, or says "prep the top N of Group A". Target 8–12/day; it's fine to dip into Group B for a flagged one that looks worth it.

## 2b. Resolve real apply links before scaffolding

Check each pick's `flags` and `applyUrl` in `/tmp/jobs.json`:

- **`verify_apply_link`** (currently: every Himalayas job) — Himalayas' own
  "Apply now" always routes to *its* signup wall (`/signup/talent`), never
  the company's real form, regardless of company. Don't scaffold that URL.
- **`applyUrl` is null/missing and the source isn't a direct board** (e.g. an
  Adzuna redirect that turns out geo-blocked) — same problem, different
  shape.

For each one: WebSearch `<company> careers <role title>` and take the
company's own ATS link (Ashby/Greenhouse/Lever/Workday/direct careers page)
over any other job-board mirror. Patch that pick's `applyUrl` (and `url`) in
`/tmp/jobs.json` directly before running `apply-prep` — this is the one
point where fixing it is cheap (one session, one search); leaving it for
apply-drive means discovering the dead end only after everything else is
already prepped. If nothing turns up, leave it null and say so in the step 6
report — don't guess a URL.

## 3. Scaffold each folder (deterministic — job.json only)

```
pnpm apply-prep --jobs /tmp/jobs.json --pick 0,1,4,6
```

Writes `applications/<date>/<company>__<role>/job.json` per pick — to the
local cache and the R2 `applications` bucket (the source of truth) — nothing
else. `job.json` carries the JD text and this run's search-provenance
markdown (rendered now, while `cfg`/`result` are still in hand; materialized
into `search-provenance.md` later, on demand, by `/apply-drive`).

## 4. Record in the ledger

Per folder:

```
pnpm apply record --file applications/<date>/<company>__<role>/job.json
```

Status starts `draft`. (Idempotent on `<company>|<role>` — safe to re-run.)

## 5. Report

Print a table: index · company — role · folder path · ✅ recorded.

Then remind the user: content-processing (`/apply-content-queue`) generates
the proof-bundle next, and `/apply-drive` generates the résumé and prose the
first time it's actually needed for that job's form.

## Rules

- One `pnpm apply-prep` call can take several `--pick` indices — batch them.
- Don't submit anything or send any message — the user does that.
- Don't generate résumé, proof-bundle, or prose here — that's deferred work
  for later stages. This step only records what got picked and why.
