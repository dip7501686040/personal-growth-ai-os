---
name: apply-morning
description: The morning job run — fetch + score today's matching jobs, let the user pick, and generate a ready-to-submit application folder per job (tailored résumé, proof bundle, pitches, cover letter). Use when the user says "/apply-morning", "run the morning jobs", or "prep applications".
---

# apply-morning

Ties J1–J4 together. Fetch → score → pick → generate per-job folders → record in the ledger.

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

## 3. Scaffold each folder (deterministic)

```
pnpm apply-prep --jobs /tmp/jobs.json --pick 0,1,4,6
```

Writes `applications/<date>/<company>__<role>/` per pick — to the local cache
and the R2 `applications` bucket (the source of truth) — with: `resume.md` /
`.html` / `.pdf` (archetype auto-picked, tailored to the JD via
get_proof_for_jd), `proof-bundle.md`, `outreach-targets.md`,
`search-provenance.md` (why this job surfaced), `job.json`, and **stub**
`why-fit.md` / `pitch-recruiter.md` / `pitch-referral.md` for you to fill in
(re-running the scaffold never overwrites prose you've written).

## 4. Write the prose files (your judgment — Sonnet)

For each folder, using `job.json` (the JD + match data) and `proof-bundle.md`:

| File | Shape | Notes |
|---|---|---|
| `why-fit.md` | ~150 words | the "why are you a fit?" box. Lead with the 2–3 strongest proof points from `proof-bundle.md`. Concrete, first person. |
| `cover-letter.md` | ~250 words | only if the JD/portal asks for one, or the application is by email — otherwise skip the file. |
| `pitch-recruiter.md` | 3 parts (below) | cold outreach to the gatekeeper — recruiter **or** hiring manager. |
| `pitch-referral.md` | same 3 parts | asking a current employee for a referral — warmer, shorter. |

Both pitch files carry every channel in one file (no separate LinkedIn/email files):

```
# Pitch — <who> · <Company>

Subject: <email subject line>

## Message
<~80 words (referral ~70). Opens with the single strongest proof link.
Serves as a cold email or a LinkedIn DM / InMail.>

## LinkedIn connection note (≤300 chars)
<a tight cold-open that fits the connection-request limit — identity + role + one hook>
```

`pnpm outreach email` reads the `Subject:` line and the `## Message` section;
`/apply-drive` and Phase 9 use the `## LinkedIn connection note`.

Ground every claim in `proof-bundle.md` / `resume.md`. Never invent a metric,
project, or link. If a skill has no shipped-feature proof, don't claim it as proven.

## 5. Record in the ledger

Per folder:

```
pnpm apply record --file applications/<date>/<company>__<role>/job.json
```

Status starts `draft`. (Idempotent on `<company>|<role>` — safe to re-run.)

## 6. Report

Print a table: index · company — role · folder path · archetype · proof (skills/features) · prose files written · ✅ recorded.

Then remind the user: review each folder, submit on the portal, send the pitches, and run `/apply-log` per job.

## Rules

- One `pnpm apply-prep` call can take several `--pick` indices — batch them.
- Don't submit anything or send any message — the user does that.
- Don't fabricate. Everything traces to `proof-bundle.md`, `resume.md`, or `job.json`.
