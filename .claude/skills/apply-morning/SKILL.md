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

## 3. Scaffold each folder (deterministic)

```
pnpm apply-prep --jobs /tmp/jobs.json --pick 0,1,4,6
```

Writes `applications/<date>/<company>__<role>/` per pick with: `resume.md` / `.html` / `.docx` (archetype auto-picked, tailored to the JD via get_proof_for_jd), `proof-bundle.md`, `outreach-targets.md`, `search-provenance.md` (why this job surfaced — manual vs knowledge-graph layer + score math), `job.json`.

## 4. Write the prose files (your judgment — Sonnet)

For each folder, using `job.json` (the JD + match data) and `proof-bundle.md`:

| File | Length | Notes |
|---|---|---|
| `why-fit.md` | ~150 words | the "why are you a fit?" box. Lead with the 2–3 strongest proof points from `proof-bundle.md`. Concrete, first person, no fluff. |
| `cover-letter.md` | ~250 words | only if the JD/portal asks for one — otherwise skip the file. |
| `pitch-recruiter.md` | 60–90 words | DM/email to a recruiter. Open with the single best proof link. |
| `pitch-referral.md` | 60–90 words | asking a current employee for a referral — warmer, shorter, one link. |

Ground every claim in `proof-bundle.md` / `resume.md`. Never invent a metric, project, or link. If a skill has no shipped-feature proof, don't claim it as proven.

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
