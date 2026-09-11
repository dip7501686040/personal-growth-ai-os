---
name: apply-content-queue
description: Process jobs queued from the /applications page's "Process content" button (J2 of the dynamic-content-platform plan). Use when the user says "process the queue", "process content", or when a SessionStart hook surfaces queued content work.
---

# apply-content-queue

The `/applications` page's **Process content** button doesn't run anything
itself — it can only record intent (`contentRequestedAt`). This is the
session-side half: for every queued job, fill in whatever visual proof its
`proof-bundle.md` is missing, then strengthen the pitches with the best of it.

## 1. See what's queued

```
pnpm apply queue
```

Lists `content queue` rows: `<id>  <company> — <role>  <bundleDir>`.

## 2. Per job: find what's missing, fill it in

```
cat applications/<date>/<folder>/proof-bundle.md   # or read via R2 — see bundleDir
pnpm content missing <projectSlug>                 # cross-check against the real gap list
pnpm content check <projectSlug> <featureKey>       # confirm one is genuinely missing (never regenerate an existing card)
```

For each feature the proof bundle references that's still missing a card,
pick the right generation path (never fake one — see the plan's decision
table):

- **CLI/script feature** → `pnpm content terminal --command "<real cmd>" --project <slug> --feature <key> --title "..."`
- **Have a diagram/screenshot file already** → `pnpm content register <file> --project <slug> --feature <key> --kind diagram|screenshot|video --title "..."`
- **Needs a live-app screenshot** → use the Playwright MCP tools against the
  deployed app (one-time login already persisted), save the screenshot, then
  `pnpm content register`.
- **Genuinely needs motion** → `pnpm content record-steps --project <slug> --feature <key> --title "..."`, then STOP and wait for the user to drop the recording in and say go.

`register`/`terminal` refuse to duplicate a card that already exists for that
feature — that's the point, not a bug to work around.

## 3. Regenerate the bundle, strengthen the pitches (judgment, not a blanket insert)

Once every feature the bundle needs has a card:

- Regenerate `proof-bundle.md` — via the `/applications/<date>/<folder>` page's
  "Regenerate proof bundle" button, or `regenerateProofBundle(userId, date, folder)`.
- Read the fresh bundle. Add the top 2–3 visual links to `pitch-recruiter.md`
  / `pitch-referral.md` **only where they genuinely strengthen that pitch** —
  same discipline as writing them the first time, no filler links.
- Same judgment call for `why-fit.md` / `cover-letter.md` — add a link only
  when it helps that specific pitch.

## 4. Clear the flag

```
pnpm apply mark-content-prepared <id>
```

## 5. Report back

One line per job: what was generated (or reused), what pitch files got a
link added, and anything you skipped (e.g. "needs a recording — sent steps,
waiting on you").
