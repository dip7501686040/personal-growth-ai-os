---
name: apply-single
description: Prep one job the user found and pasted themselves — not from the automated search. Scaffolds job.json, runs it through content-queue (proof-bundle + a content-gap check) and generates the résumé/prose up front, then waits for the user to apply by hand and mark it done. Use when the user says "/apply-single", pastes a job title + JD and asks to prep it, or wants to apply to a specific job that never went through /apply-morning.
---

# apply-single

`/apply-morning` only ever sees what the automated search surfaces. This is
the manual door in: one job the user found some other way (a referral, a
company page, a job alert email) gets the exact same treatment — proof
bundle, tailored résumé, ledger record — without needing to fake a search
run for it.

The one real difference from the automated flow: **the user is applying by
hand, outside apply-drive's browser automation**, so this skill generates
the résumé (and any prose the user asks for) immediately, up front — not
lazily like `/apply-drive` does. There's no form-fill session later where
"the first time a field needs it" would ever happen.

## 1. Gather the job

Ask for (or take from what the user already pasted):
- **Company** and **role/title** — required.
- **The full JD text** — required, pasted in full. This is a real advantage
  over the automated path: no aggregator snippet to truncate, so tailoring
  works off the complete posting from the start.
- **Apply URL** — optional but ask for it; without one the folder still
  works, it just won't have a direct link.
- Location / salary, if the user has them — optional, cosmetic only.

## 2. Scaffold

```ts
import { scaffoldManualJobFolder } from "@/modules/applications/generate";
const { date, folder } = await scaffoldManualJobFolder({
  company: "<company>",
  role: "<role>",
  jdText: "<the full pasted JD>",
  applyUrl: "<url or omit>",
});
```

Writes `job.json` + a `search-provenance.md` that honestly says "added
manually" — no faked search score, no `skillMatch` math, since none of that
applies to a job the user found themselves.

Then record it in the ledger (idempotent, same as apply-morning):

```
pnpm apply record --file applications/<date>/<folder>/job.json
```

## 3. Content queue, inline

Same substance as `/apply-content-queue`, just run right here instead of as
a separate step:

```ts
import { getOwnerUserId } from "@/lib/owner";
import { regenerateProofBundle } from "@/modules/applications/generate";
const userId = await getOwnerUserId();
await regenerateProofBundle(userId, date, folder);
```

Then cross-check for gaps exactly like `/apply-content-queue` step 4:
`pnpm content missing <projectSlug>` against what the proof-bundle
references, and offer to fill any real gap (terminal/register/browser card)
— never fake one. If a card needs a recording, hand that back to the user
and pause; don't block the rest of this skill on it if the résumé itself
doesn't need that specific feature.

## 4. Résumé (and prose, if this application needs it) — now, not later

```ts
import { regenerateResume } from "@/modules/applications/generate";
await regenerateResume(userId, date, folder);
```

This picks the archetype fresh from the (untruncated) JD text, renders
`resume.md`/`.html`, and prints `Dipankar_Saha_Resume.pdf` (same name every
time, not per-company) — the file the user actually attaches when they apply
by hand.

If the application the user is filling out has a free-text field (why this
role, a cover letter, a "why you" box), generate that too, same discipline
as `/apply-drive` step 5 — grounded only in `proof-bundle.md`/`resume.md`,
never invented:

```ts
import { ensureWhyFitStub } from "@/modules/applications/generate";
await ensureWhyFitStub(date, folder);
```

then write real prose into the stub via `writeFolderFile`. Skip this
entirely if the user hasn't mentioned needing it — don't generate prose
nobody asked for.

Same house style as every other pitch here: open with a one-sentence hook on
the *company's actual problem* (not a recap of the JD or a stack-naming
sentence), lead with the most differentiating proof for this JD, and put
each claim's real proof link inline right after the claim — never a links
section batched at the end.

## 5. Hand off

Report: folder path, the PDF filename, ledger status (`draft`), and
anything skipped in step 3. Tell the user the résumé (and any prose) is
ready to use for their own manual application — this skill doesn't drive a
browser or submit anything.

## 6. After the user applies

They come back and say so ("applied to it", "submitted", "done") — this is
exactly `/apply-log`'s job, not a separate mechanism:

```
pnpm apply submit "applications/<date>/<folder>" --channel portal
```

(swap `--channel` for `linkedin`/`email`/whatever they actually used). This
flips the ledger to `applied` and schedules the first follow-up — see
`/apply-log` for the rest (pitch touchpoints, etc.) if relevant.

## Rules

- Never fabricate `score`/`skillMatch`/`replyLikelihood` for a manual job —
  `scaffoldManualJobFolder` already zeroes these out; leave them alone.
- Never invent a metric, project, or link in any prose — same rule as
  `/apply-drive` and `/apply-content-queue`.
- Don't drive a browser or click Submit here — that's `/apply-drive`'s job,
  for a job that's going through *our* automation. This skill is for the
  user applying themselves.
