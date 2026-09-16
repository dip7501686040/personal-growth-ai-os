---
name: apply-morning
description: The morning job run — fetch + score today's matching jobs, let the user pick, and record each pick as job.json + search-provenance.md in the ledger. Use when the user says "/apply-morning", "run the morning jobs", or "prep applications".
---

# apply-morning

**Context that shapes every step below:** the user is based in Kolkata,
India, and wants remote roles — he needs visa sponsorship for every country
except India, so a company's *actual* hiring geography matters as much as
skill match. `score.ts` catches what's detectable from JD *text* alone
(`visa_blocker` for explicit "US citizens only"/"must reside in the US"
wording, a small `india_friendly` boost for "worldwide"/"hires globally"
language) — but plenty of real blockers never show up in the posting text at
all (found live: a ClickUp employee replied on LinkedIn that "ClickUp
doesn't hire engineers from India," nothing in the JD hinted at that). That
kind of fact isn't something to hardcode into a maintained list in
`score.ts`/`job-search.json` — the user explicitly said so. Instead: **hold
it in memory and apply it by judgment at presentation time**, the same way
you'd remember any other fact the user told you. When you learn a company
doesn't hire from India (a LinkedIn reply, the user mentioning it, a rejected
application), save it via the memory system (`type: reference` or
`project`, e.g. "ClickUp doesn't hire engineers based in India — told
directly by a ClickUp employee, 2026-09-16") so the next `/apply-morning`
run already knows, without any code change. Before presenting Group A/B,
scan company names against what you already know — this session's memory,
general knowledge of well-known company hiring-geography reputations, and
anything the user said earlier in the conversation — and flag or deprioritize
a company you have real reason to doubt, even if `score.ts` scored it clean.
Say *why* ("ClickUp — you were told directly they don't hire from India,
skipping") rather than silently dropping it.

This also means: when ranking/recommending picks, weigh three things
together, not just the numeric `score` — skill match, proof relevance (how
strong the graph-matched project evidence actually is for *this* JD), and
realistic hireability given the user's India-based location. A 0.55-score
job at a company that genuinely hires globally is worth more than a
0.70-score job at a company you have reason to think won't consider an
India-based candidate — steer the user toward jobs where an interview call
is actually plausible, not just toward the top of the raw score list.

Ties J1–J4 together. Fetch → score → pick → record `job.json` +
`search-provenance.md` per pick → record in the ledger. Nothing else gets
generated here — no résumé, no proof-bundle, no prose. Those cost real work
(LLM calls, DB lookups) and a picked job can still get rejected later, so
they're deferred: `/apply-content-queue` adds the proof-bundle when a job
clears content-processing, and `/apply-drive` fills in everything else, one
file at a time, right when the form on screen needs it. Search-provenance is
the one exception — it's written now because it's cheap (no LLM/DB calls,
just formatting this run's `cfg`/scoring context) and that context won't
exist any later than this.

## 1. Fetch and score

```
pnpm jobs --json > /tmp/jobs.json
pnpm jobs            # human view: Group A (clean) then Group B (flagged)
```

The search blends two layers:
- **Manual** — `resume/job-search.json` (`titles`, `excludeTitles`, `skills` keyword list, filters). Hand-tuned.
- **Knowledge graph** — automatic (unless `useGraphMatch: false` or `pnpm jobs --no-graph`). Adds a few source-query terms from your implemented/proven skills, and re-scores the top ~50 jobs with the same matcher `get_proof_for_jd` uses. `skillMatch = max(keyword, graph)`, so a job the keyword list misses but your real projects match still rises.

Show the user the Group A list (and the top of B). Each row: score · company — role · remote-kind · LPA · reply-likelihood · skillMatch (with `graph N.NN` when the graph beat the keyword score) · [sources] · flags. The `graph:` header line reports the extra terms + how many jobs were graph-scored. Indices in `/tmp/jobs.json` are `groupA` then `groupB` concatenated (0-based). `visa_blocker` now also covers residency-requirement wording ("must reside in the US", "US citizens only"), not just explicit no-sponsorship phrases; `india_friendly` is a small positive flag for postings that name India or genuinely global hiring. Before presenting, apply the judgment pass from the top of this file — flag/deprioritize anything you have real-world reason to doubt beyond what these text-pattern flags caught.

If `pnpm jobs` reports skipped sources (missing keys), mention it once — coverage is lower without JSearch/Adzuna/SerpApi.

`pnpm jobs` (either form) also saves this run to R2 automatically (when
configured) — the `/applications` page's "Search jobs" panel shows the same
Group A/B list, paginated, with checkboxes and a "Prep selected" button that
does exactly step 3+4 below for you. Picking here in chat and picking there
both write the same `job.json`/DB row, so it's fine if the user does one and
you do the other — mention the page exists, but keep driving the pick
conversation here unless they say they'd rather do it in the browser.

## 2. Pick

Ask which to prep — the user names indices, or says "prep the top N of Group A". Target 8–12/day; it's fine to dip into Group B for a flagged one that looks worth it.

## 2b. Resolve real apply links before scaffolding

Check each pick's `flags` and `applyUrl` in `/tmp/jobs.json`:

- **`verify_apply_link`** (currently: every Himalayas or Jobicy job) —
  Himalayas' own "Apply now" always routes to *its* signup wall
  (`/signup/talent`); Jobicy's "Apply Now" fires a `RegistrationGateOpened`
  tracking event and opens Jobicy's own registration modal. Neither ever
  reaches the company's real form. Don't scaffold that URL.
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

- **`truncated_jd_text`** — the aggregator's `descriptionSnippet` looks cut
  off (too short, or doesn't end on real punctuation). Everything downstream
  tailors off this text — archetype pick, skill/project hoisting, proof
  matching — so a truncated snippet silently starves all of it of whatever
  requirement language got cut (this happened for real: a snippet cut off
  right before the paragraph naming SCIM/RBAC/SAML/OAuth2 produced a résumé
  quietly tailored around their absence). If you're already resolving this
  pick's real apply link (above) or it's easy to open the real posting,
  capture the *full* page text and set it as `descriptionSnippet` in
  `/tmp/jobs.json` before scaffolding — same reasoning as the apply-link
  fix, cheapest to do now. If not, scaffold anyway and just flag it in the
  step 6 report so `/apply-drive` knows to fetch the real page before
  generating that job's résumé.

## 3. Scaffold each folder (deterministic — job.json + search-provenance.md)

```
pnpm apply-prep --jobs /tmp/jobs.json --pick 0,1,4,6
```

Writes `applications/<date>/<company>__<role>/job.json` and
`search-provenance.md` per pick — to the local cache and the R2
`applications` bucket (the source of truth). Nothing else: no résumé, no
proof-bundle, no prose yet.

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
  for later stages. This step only records what got picked, and why it
  surfaced.
