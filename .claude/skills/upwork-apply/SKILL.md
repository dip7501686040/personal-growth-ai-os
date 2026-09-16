---
name: upwork-apply
description: Write a winning proposal for one Upwork or Fiverr job/gig the user found and pasted themselves, grounded in real proof already in this app (including any project recorded specifically for a past freelance job, e.g. payment-processing-api) — then, once they've submitted it by hand, record the application as a folder for follow-up. Use for "/upwork-apply", "write me a proposal for this job", "I found this on Upwork/Fiverr, help me apply", "I submitted it, log it".
---

# upwork-apply

For a job the user found themselves (Upwork, Fiverr, or anywhere else) and
pastes here — as opposed to `/upwork-drive`, which searches and submits live
in a browser. Same non-fabrication discipline as `/apply-single`/`/apply-drive`
— every claim in the proposal traces to something real already in this app,
or to something the user confirms is real. **This skill never submits
anything itself** — the user applies by hand on the platform; step 5 records
it afterward.

## 1. Gather the job

Platform (Upwork/Fiverr/other), client name, role/title, the full post
(description + skills list + budget/rate type), and the verdict from
`/upwork-search` if that ran first.

## 2. Pull real proof

```ts
import { getOwnerUserId } from "@/lib/owner";
import { getProofForJd } from "@/modules/knowledge/jd-proof";
const userId = await getOwnerUserId();
const proof = await getProofForJd(userId, jdText);
```

This surfaces every matching skill/feature already recorded — including a
project built specifically for a past Upwork job (e.g. `payment-processing-api`,
recorded via `/sync-repo` + one portfolio card after that job) if this new
posting is the same kind of ask. Reuse that proof directly: same repo link,
same screenshot/card, no need to rebuild anything just because it's a
different client.

Note any **mandatory** skill the listing names with no match at all — surface
it plainly to the user rather than glossing over it.

## 3. If there's a real, undocumented gap

Ask the user first — they may have real history not yet in this app (old
GitHub repos, etc.). Only consider building something new if they confirm
there's nothing real to point to and want one built; that's the exception,
not the default path here. If it happens, the result gets recorded the same
way as any other shipped project — `/sync-repo` then one `pnpm content
register` card — never a hand-rolled DB insert, and never more than one card
per project unless asked.

## 4. Write the proposal — from the client's side of the screen

Upwork shows the client two views, and a generic proposal loses at both:

- **The preview card** — while scrolling 20–50 applicants, the client sees
  only your name/bid/JSS, the skills tags matched, and your *first line*.
  That line is the whole pitch at this stage.
- **The full view** — narrow pane, opened only if the card earned a click.
  Long dense paragraphs read as a wall of text here and the client's eyes
  skip past links buried inside them.

So:

1. **Opening line = hook, not a recap.** Never restate their job title,
   summary, or skill tags back at them ("I'd like to help build and
   maintain your web application" / "I noticed your stack requires PHP and
   JavaScript" — both read as generic, and half the other applicants open
   the same way). Read past the tag list to the actual **problem** the
   client is trying to solve — what's implied by "ongoing," "maintain,"
   "improve UX," a specific pain phrase, the project's real shape — not
   just which languages it's tagged with. Then open with the specific
   angle on *that* problem plus your single strongest matching proof, in
   one sentence, so the first line proves you already understand their
   situation, not just their keyword list. There's no fixed template for
   this — read the actual JD each time and write the sentence that fits
   *this* client's real problem; don't reduce it to filling in a stack name
   and a proof link.

2. **How I'd approach it** — 2–3 short bullets (not a paragraph), specific
   to *this* JD, not generic platitudes.
3. **Proof, not just claims** — one bullet block per project: name, a short
   plain one-line tech-stack summary, then links each on their own line
   (never buried mid-paragraph). Lead with whichever piece of proof is the
   most technically differentiating for *this* JD's mandatory skills — the
   thing that signals senior/advanced, not just "matched" — put that one
   first, not last.
4. **What I bring beyond this** — one line, the user's real broader
   background.
5. **Availability / rate** — only if the user gave you a number.

Bullets and short lines throughout, not dense paragraphs — write for someone
skimming a narrow pane on a laptop, comparing you against dozens of other
cards, not someone reading top to bottom.

Deliver the complete proposal text, ready to paste, and resend any relevant
screenshots via `SendUserFile` so they're easy to attach.

If the user asks you to actually drive the browser and submit this rather
than apply by hand (they log in, you fill/submit) — that's `/upwork-drive`'s
steps 6–9 mechanics, run with the proposal text from this step; same submit
discipline (explicit `y`), same known-friction fixes documented there.

## 5. After they submit — record it

They come back and say so ("submitted it", "sent the proposal", "applied").
Scaffold a folder the same way `/apply-single` does for a manually-found job,
so this lives in the same ledger/follow-up system as every other application:

```ts
import { scaffoldManualJobFolder } from "@/modules/applications/generate";
const { date, folder } = await scaffoldManualJobFolder({
  company: "<client name>",
  role: "<job title>",
  jdText: "<the full pasted job post>",
  applyUrl: "<job URL, if the user has it>",
});
```

Then write the proposal itself into the folder, and record it in the ledger:

```ts
import { writeFolderFile } from "@/modules/applications/generate";
await writeFolderFile(date, folder, "proposal.md", "<the proposal text actually sent>");
```

```
pnpm apply record --file "applications/<date>/<folder>/job.json"
pnpm apply submit "applications/<date>/<folder>" --channel portal
```

(`submit` flips the ledger to `applied` and schedules the first follow-up —
same as `/apply-log`.) If the user has a screenshot of the submitted
proposal, save it into the folder too (`apply-confirm-<timestamp>.png`) —
useful context for a later follow-up, not required to record the application.

## Rules

- Never claim a mandatory skill with no real proof behind it — disclose,
  don't fabricate.
- Prefer reusing an existing recorded project/card over building a new one —
  check step 2 before assuming a gap needs filling.
- Don't submit anything on the platform — the user applies by hand; this
  skill only records it afterward.
