---
name: apply-drive
description: Claude-driven application form-fill. Walks any portal's form field by field in a real browser (Playwright MCP), fills from resume/profile.json + the folder's prose, screenshots, and pauses for an explicit "y" before every Submit. Use when the user says "/apply-drive", "drive the <company> application", or when `pnpm apply-fill` flagged too much to finish by hand. Interactive sessions only.
---

# apply-drive

Tier 2 of the apply automation. `pnpm apply-fill` is faster for Greenhouse /
Lever / Ashby — use this for every other portal, or when apply-fill left too
many fields for the user. `apply-fill` throws if `resume.pdf` is missing, so
run step 1's `regenerateResume` call (and, if that portal wants one,
`ensureWhyFitStub`/write `cover-letter.md`) before invoking it too — it
doesn't generate those itself.

Needs: an interactive session with the **`playwright`** MCP server connected
(in `.mcp.json`; approve it once), `resume/profile.json` filled, and the
folder past content-processing — `job.json` + `search-provenance.md`
(`/apply-morning`) and `proof-bundle.md` (`/apply-content-queue`) should
already exist. Nothing else does yet: the résumé and every prose file
(`why-fit.md`, `cover-letter.md`, `pitch-recruiter.md`, `pitch-referral.md`,
`outreach-targets.md`) get generated here, one at a time, the first moment
the drive actually needs them — never all up front.

No folder named? Check `pnpm apply queue` — its `apply queue` section lists
jobs the user clicked **Apply** for on `/applications` (J4), each with its
`bundleDir`. Confirm the job is content-complete first (not still sitting in
`pnpm apply queue`'s `content queue`) before driving it.

## Loop

### 1. Load the folder
User names it (`apply-drive quill__fullstack-swe`, or `<date>/<folder>`).

```
pnpm apply pull <date>/<folder>
```

Read `applications/<date>/<folder>/job.json` (`applyUrl` → else `url`) and
`proof-bundle.md`. No usable apply URL → ask the user for one. No
proof-bundle.md → this job hasn't cleared `/apply-content-queue` yet; run that
first, don't generate a bundle here.

Generate the résumé now — almost every portal needs it uploaded up front, and
this also covers the case where `resume/master.json` changed since this job
was picked (e.g. the user just asked for a résumé edit): `regenerateResume`
renders fresh from the current master either way, first-time or re-render,
and never touches any other folder.

```ts
import { getOwnerUserId } from "@/lib/owner";
import { regenerateResume } from "@/modules/applications/generate";
const userId = await getOwnerUserId();
await regenerateResume(userId, "<date>", "<folder>");
```

Don't generate `why-fit.md`, `cover-letter.md`, or the pitch files yet — wait
until step 5 shows the form actually asks for one.

### 2. Load the answers

```
pnpm apply-answers --profile
```

Gives identity / links / work / comp and `gaps` (empty fields). If a gap is
relevant to this form (e.g. `compensation.expectation` and the form demands a
number), tell the user before starting.

For a specific field label, ask for its answer:

```
pnpm apply-answers "Are you authorized to work in the United States?" "Notice period"
```

Each answer is `{ value, field, confident }`. `confident:false` → don't fill it
silently; ask the user.

### 3. Open and read
`browser_navigate` to the apply URL. `browser_snapshot` to read the form.

### 4. Check for a wall
Login / SSO / "create an account" / captcha / identity or payment prompt / a
job-board page that isn't the real form → **STOP**. Tell the user what you see,
let them log in or navigate, and continue only when they say so. Never enter
credentials or solve a captcha.

### 5. Fill, field by field
From the snapshot, for each field:

| field | value |
|---|---|
| name / email / phone / location / links / notice / years | from `pnpm apply-answers "<the field's visible label>"` |
| résumé upload | `browser_file_upload` → absolute path to `applications/<date>/<folder>/resume.pdf` (already generated in step 1) |
| "why do you want to work here" / "anything else" free-text | see below — generate `why-fit.md` the first time this shows up, then paste it verbatim |
| cover-letter field or upload | see below — generate `cover-letter.md` the first time this shows up |
| work-authorization / sponsorship / "how did you hear" `<select>` | the option matching `apply-answers` `value` |
| EEO / gender / race / veteran / disability | the "Decline to self-identify" / "I don't wish to answer" option |
| no stored answer, no folder source | leave blank, add to the report |

**Generating `why-fit.md` / `cover-letter.md` on first need** — this is the
file's only generation point; nothing wrote it earlier:

```ts
import { ensureWhyFitStub } from "@/modules/applications/generate";
await ensureWhyFitStub("<date>", "<folder>");   // no-op if already written
```

lays down the stub (or does nothing if it's already real prose from an
earlier pass at this same folder); then write ~150 words into it yourself —
first person, concrete, leading with the 2–3 strongest points from
`proof-bundle.md` — via the folder's `writeFolderFile`. `cover-letter.md` has
no stub (only write one if the form actually asks for it): write it directly,
~250 words, same grounding rule.

Never type a value you can't trace to `apply-answers`, `profile.json`, or a file
in the folder. Never invent a metric, project, or link — everything in
`why-fit.md` / `cover-letter.md` must trace to `proof-bundle.md` or `resume.md`.

### 6. Screenshot and report
`browser_take_screenshot` (full page). Show the user:
- **Filled** — label → value
- **Left blank** — label (why)
- **Unsure** — label → the option you'd pick, asking them to confirm

### 7. Ask to submit
Ask, in plain words: **"Submit this application to `<company>`? Reply `y` to
click Submit, or tell me what to fix."**

Do **not** click Submit unless the user's next message is an explicit `y` /
"yes" / "submit". "looks good", an emoji, or silence is not a yes — ask again.
One `y` submits one application. Never batch.

### 8. On `y`
Click the form's submit control. `browser_snapshot` + `browser_take_screenshot`
the result. Confirm it actually went through (success text / URL change). If it
bounced with validation errors, report them and go back to step 5.

### 9. Record
- Copy the screenshots from `.apply-drive/` into the folder as
  `apply-<timestamp>.png` and `apply-confirm-<timestamp>.png`.
- Write `applications/<date>/<folder>/apply-result.md`:

  ```
  # Applied — <company> / <role>

  - submitted: <ISO>
  - portal: <final URL>
  - via: apply-drive
  - resume: resume.pdf
  - screenshots: apply-<ts>.png, apply-confirm-<ts>.png

  ## Auto-filled
  - <label>: <value>

  ## Needed manual input
  - <label> — <note>
  ```

- `pnpm apply push <date>/<folder>` then `pnpm apply submit <date>/<folder>`
  (ledger → applied).

### 10. Outreach (only if the user wants it)

`outreach-targets.md` and the pitch files never got generated earlier —
driving the form doesn't need them. If the user wants to reach out about this
job, generate the target list and the one pitch file you'll actually send,
then write real pitch prose grounded in `proof-bundle.md` (same discipline as
`why-fit.md` — no filler links):

```ts
import { ensureOutreachTargets, ensurePitchStub } from "@/modules/applications/generate";
await ensureOutreachTargets("<date>", "<folder>");
await ensurePitchStub("<date>", "<folder>", "recruiter"); // or "referral"
```

(`search-provenance.md` needs nothing here — `/apply-morning` already wrote
it. If it's somehow missing on an older folder, `ensureSearchProvenance`
materializes it from what job.json still has cached.)

### 11. Close
`browser_close`.

## Rules

- **Never** create an account, enter a password, or solve a captcha — hand those to the user.
- **Never** click Submit without an explicit `y` in the user's most recent message.
- **Never** invent a metric, project, link, or prose answer. Everything traces to the folder or the profile.
- Stop and hand over on any login wall, captcha, verification, payment, or anything that looks off.
- No human to answer `y` → stop after step 6 and report.
