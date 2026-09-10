---
name: apply-drive
description: Claude-driven application form-fill. Walks any portal's form field by field in a real browser (Playwright MCP), fills from resume/profile.json + the folder's prose, screenshots, and pauses for an explicit "y" before every Submit. Use when the user says "/apply-drive", "drive the <company> application", or when `pnpm apply-fill` flagged too much to finish by hand. Interactive sessions only.
---

# apply-drive

Tier 2 of the apply automation. `pnpm apply-fill` is faster for Greenhouse /
Lever / Ashby — use this for every other portal, or when apply-fill left too
many fields for the user.

Needs: an interactive session with the **`playwright`** MCP server connected
(in `.mcp.json`; approve it once), `resume/profile.json` filled, and the folder
already scaffolded with prose (`/apply-morning`).

## Loop

### 1. Load the folder
User names it (`apply-drive quill__fullstack-swe`, or `<date>/<folder>`).

```
pnpm apply pull <date>/<folder>
```

Read `applications/<date>/<folder>/`: `job.json` (`applyUrl` → else `url`),
`why-fit.md`, `cover-letter.md`. No usable apply URL → ask the user for one.

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
| résumé upload | `browser_file_upload` → absolute path to `applications/<date>/<folder>/resume.pdf` |
| cover-letter field or upload | `cover-letter.md` (text or file) |
| "why do you want to work here" / "anything else" free-text | paste `why-fit.md` verbatim (or `cover-letter.md` if the label literally says cover letter) |
| work-authorization / sponsorship / "how did you hear" `<select>` | the option matching `apply-answers` `value` |
| EEO / gender / race / veteran / disability | the "Decline to self-identify" / "I don't wish to answer" option |
| no stored answer, no folder source | leave blank, add to the report |

Never type a value you can't trace to `apply-answers`, `profile.json`, or a file
in the folder. If a field needs prose that isn't in the folder, ask the user —
don't write it yourself here.

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

### 10. Close
`browser_close`.

## Rules

- **Never** create an account, enter a password, or solve a captcha — hand those to the user.
- **Never** click Submit without an explicit `y` in the user's most recent message.
- **Never** invent a metric, project, link, or prose answer. Everything traces to the folder or the profile.
- Stop and hand over on any login wall, captcha, verification, payment, or anything that looks off.
- No human to answer `y` → stop after step 6 and report.
