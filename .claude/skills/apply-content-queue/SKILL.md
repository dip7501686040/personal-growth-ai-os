---
name: apply-content-queue
description: Process jobs queued from the /applications page's "Process content" button (J2 of the dynamic-content-platform plan). Use when the user says "process the queue", "process content", or when a SessionStart hook surfaces queued content work.
---

# apply-content-queue

The `/applications` page's **Process content** button doesn't run anything
itself — it can only record intent (`contentRequestedAt`). This is the
session-side half: for every queued job, generate its proof-bundle.md (this
is the first time it's ever generated — `/apply-morning` only wrote
`job.json`), fill in whatever visual proof it's missing, then strengthen the
pitches with the best of it.

## 1. See what's queued

```
pnpm apply queue
```

Lists `content queue` rows: `<id>  <company> — <role>  <bundleDir>`.

## 2. Generate the proof-bundle

```ts
import { getOwnerUserId } from "@/lib/owner";
import { regenerateProofBundle } from "@/modules/applications/generate";
const userId = await getOwnerUserId();
await regenerateProofBundle(userId, "<date>", "<folder>");
```

Safe to call even if a bundle already exists (re-running this step just
refreshes it against the current knowledge graph).

## 4. Per job: find what's missing, fill it in

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
- **Genuinely needs motion** → `pnpm content record-steps --project <slug> --feature <key> --title "..."`, then STOP and wait for the user to drop the recording in and say go.

**If the feature's project has a live, reachable UI** (checked live — logged
into the local pgai dev server, or the deployed portfolio/pgai URL), *also*
capture a UI-view card, not just the terminal/code one — the two together
form one proof "cycle": what a user actually sees, then what's behind it.
Never force this onto infra-only projects with no end-user screen (Terraform
modules, Helm charts, CI pipelines) — terminal/config proof alone is the
honest answer there; use judgment per feature, not a blanket rule.

1. If the page needs auth, check `.env.local` first for that project's login
   (`PGAI_LOGIN_EMAIL`/`_PASSWORD`, `AI_NOTIFICATION_SYSTEM_EMAIL`/`_PASSWORD`
   — one pair per project with a `liveUrl`, see `.env.example`) before asking
   the user to retype credentials that are already there.
2. Navigate to the real page with the Playwright MCP tools and take a
   screenshot: `browser_navigate` → `browser_take_screenshot` (save under
   `.scratch/`, an absolute path).
3. Frame + upload + register it:
   ```
   pnpm content browser --screenshot <rawPngPath> --url <liveUrl> \
     --project <slug> --feature <key> --title "..." [--caption "..."]
   ```

`register`/`terminal` refuse to duplicate a *terminal-role* card for that
feature; `browser` refuses to duplicate a *ui-role* one — the two are
independent, so running both for the same feature is expected, not a
collision. `pnpm content check` shows both if present.

## 5. Regenerate the bundle once every feature has a card

Re-run the same `regenerateProofBundle(userId, date, folder)` call from step 2
— or use the `/applications/<date>/<folder>` page's "Regenerate proof bundle"
button.

This job's prose (`why-fit.md`, pitch files, cover letter) doesn't exist yet
— `/apply-morning` only wrote `job.json`, and `/apply-drive` writes those,
using this bundle as its source. So there's nothing to "strengthen" here;
just make sure the bundle itself is complete and current.

## 6. Clear the flag

```
pnpm apply mark-content-prepared <id>
```

## 7. Report back

One line per job: what was generated (or reused) for the bundle, and
anything you skipped (e.g. "needs a recording — sent steps, waiting on you").
