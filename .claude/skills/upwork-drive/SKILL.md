---
name: upwork-drive
description: End-to-end Upwork job search + proposal + submit in a real browser (Playwright MCP) — reads the user's own Upwork profile, searches for jobs matching their real proof-of-skills, scores them on freshness/competition/client-quality, prepares a proposal for whichever job the user picks, waits for an explicit "submit", submits it on Upwork, and records the application as a folder for follow-up. Use when the user says "/upwork-drive", "search Upwork for me", "find me Upwork jobs and apply", "log into Upwork and look for work". Interactive sessions only — needs a human at the login wall.
---

# upwork-drive

The live-browser counterpart to `/upwork-apply`: instead of the user pasting
a job they already found, this skill searches Upwork itself, then drives the
whole loop through to a submitted proposal. Same non-fabrication discipline
as `/apply-drive` throughout, and the same submit discipline: **never click
Submit without an explicit "submit"/"y" in the user's most recent message.**

## 1. Open Upwork, handle login

`browser_navigate` to upwork.com. If it's a login wall, stop and tell the
user — they log in themselves in the same browser session; never enter
credentials or solve a captcha. Continue once they confirm they're in.

## 2. Read the user's own profile

Navigate to their Upwork profile. Note the title, skills listed, hourly
rate, and portfolio items shown — this is how they're already representing
themselves on the platform, and keeps the proposals you write from
contradicting it (e.g. don't pitch a rate wildly off their stated one
without flagging it).

## 3. Search

Build search terms from real proof-of-skills, not a generic keyword guess —
pull from the master résumé / recently-synced projects (`resume/master.json`,
or `get_proof_for_jd` against a candidate JD once you have one). Use Upwork's
own filters where the UI offers them (payment verified, hours/duration,
category). Sort by Newest — freshness matters more here than Upwork's
relevance ranking (see the scoring bar below).

For each candidate job, open it and read the full posting **and** its
Activity + About-the-client panels — the score depends on both, not just the
description.

## 4. Score and present

Skill-fit is the primary gate, not proposal count. Run the JD through
`getProofForJd` and estimate a real match percentage (mandatory skills
covered, real shipped proof behind each, stack alignment) — **80-90%+ match
overrides a high proposal count.** A high-proposal job with a genuine strong
match is worth pursuing; a low-proposal job with a weak or fabricated match
is not, no matter how fresh.

| Signal | Ideal | Red flag |
|---|---|---|
| Skill match (`getProofForJd`) | 80-90%+, mandatory skills covered with real proof | Under ~60%, or a mandatory skill with zero proof |
| Posted | 0–5 hours ago | old *and* weak skill match |
| Client last viewed | today, 0–5h ago | stale |
| Hires so far | 0 | already filled |
| Proposals | no ceiling on its own — high count is fine at 80%+ match | high count *and* weak match |
| Client spend | > $0, verified payment | $0 or unverified |

Proposal count and posting age are tiebreakers between similarly-matched
jobs, not standalone reject signals — don't skip a strong match just because
it already has 50+ proposals. Present a ranked list — **Pursue / Borderline
/ Skip**, one line of reasoning each (lead with the match % and what's
covered/missing) — and wait. Don't open an apply form for anything until the
user names one.

## 5. User says "apply this job" → scaffold + prepare

```ts
import { getOwnerUserId } from "@/lib/owner";
import { getProofForJd } from "@/modules/knowledge/jd-proof";
import { scaffoldManualJobFolder, regenerateResume, regenerateProofBundle } from "@/modules/applications/generate";

const userId = await getOwnerUserId();
const { date, folder } = await scaffoldManualJobFolder({
  company: "<client name>",
  role: "<job title>",
  jdText: "<full posting text>",
  applyUrl: "<job URL>",
});
await regenerateProofBundle(userId, date, folder);
await regenerateResume(userId, date, folder); // only if the job's apply flow takes an attachment
```

Write the actual proposal text (grounded in the proof bundle, same rules as
`/upwork-apply` step 2–3: reuse an existing recorded project/card before
building anything new; never fabricate a skill with no proof) into the
folder:

```ts
import { writeFolderFile } from "@/modules/applications/generate";
await writeFolderFile(date, folder, "proposal.md", proposalText);
```

## 6. Fill the proposal form in the browser

`browser_navigate` to the job's apply page. Field by field: paste the cover
letter/proposal text, set a bid rate only if the user gave one (never invent
a number), attach the résumé if the form takes one. `browser_snapshot` +
`browser_take_screenshot` when filled.

## 7. Ask to submit

**"Submit this proposal to `<client>` for `<role>`? Reply `y` to click
Submit, or tell me what to change."** "looks good" or silence is not a yes.

## 8. On `y`

Click Submit. `browser_snapshot` + `browser_take_screenshot` the result,
confirm it actually went through (success text / URL change). If it bounced,
report the error and go back to step 6.

## 9. Record

```
cp <screenshot> "applications/<date>/<folder>/apply-<timestamp>.png"
```

```ts
await writeFolderFile(date, folder, "apply-result.md", `# Applied — ${company} / ${role}\n\n- submitted: <ISO>\n- portal: upwork\n- proposal: proposal.md\n- screenshot: apply-<timestamp>.png\n`);
```

```
pnpm apply record --file "applications/<date>/<folder>/job.json"
pnpm apply submit "applications/<date>/<folder>" --channel portal
```

This puts it in the same ledger/follow-up system as every other application
— `/apply-followups` will surface it when a nudge is due.

## Rules

- Never enter Upwork credentials or solve a captcha — the user handles login.
- Never click Submit without an explicit `y`/"submit" in the user's latest
  message. One `y` submits one proposal — never batch.
- Never invent a bid rate, metric, or proof — same discipline as
  `/apply-drive`/`/upwork-apply`.
- Prefer reusing an existing recorded project/card (`getProofForJd`) over
  building something new for the proposal.
- No human available to confirm submit → stop after step 6 and report,
  same as `/apply-drive`.
