# Dynamic content platform — R2 as source of truth, minimal human-in-the-loop

Goal: pgai owns every piece of content (identity/résumé data, media, curated
portfolio cards, the project catalog) and serves it live; the portfolio and
every generator become pure readers. The `/applications` page becomes the one
place a day's job-search run gets picked, content-completed, and (with a human
still clicking the final Submit) applied to. No new file types where an
existing one already fits; no regenerating something that already exists.

Order: **R → M → C → P → A → J**. Phase by phase, one commit per phase on
`main` (pgai) / uncommitted-for-your-review (portfolio), same as before. STOP
after each phase, wait for "apply Phase N".

---

## Decisions this plan makes (flag if you want any changed)

1. **Cloudinary, not R2, for all visual media** (diagrams, screenshots,
   terminal-cards, videos). Reason: Cloudinary already gives us CDN delivery,
   on-the-fly transforms, and a poster frame for video, for free — R2 would
   need all of that built by hand. R2 stays for **structured/text files**
   (`my-files`) and the `applications` tree, where there's no transform need.
2. **Reuse existing tables instead of inventing new ones:**
   - Curated "content card" = **`content_items`** (already has `assetType`
     `video|image|doc|diagram|post`, `isPublic`, `status`, `publishedUrls`) +
     two new columns (`cloudinaryPublicId`, `projectFeatureId`) instead of a
     parallel table. It already has its own `/content` page — extended, not
     duplicated.
   - Project catalog = **`projects`** (already has `name`, `slug`,
     `description`, `problemSolved`, `architecture`, `repoUrl`, `liveUrl`,
     `isPublic`) + two new columns (`tagline`, `highlights` jsonb array). Tech
     stack is derived from the project's linked skills (already modelled).
3. **Idempotency guarantee:** before generating anything for
   `(projectSlug, featureKey)`, check `content_items` for an existing
   `isPublic && published` row referencing that feature. If found, reuse it —
   never regenerate, never re-upload. This is what makes reuse-across-jobs
   work: a feature used in ten different proof bundles gets its visual proof
   made once.
4. **`ffmpeg-static`** as a project devDependency (not a system Homebrew
   install — this Mac has no Homebrew, and a scoped binary matches how
   Playwright's Chromium is already handled) — for stitching a screenshot
   burst into a lightweight clip when you don't hand-record one.
5. **The "Apply" button's real limit:** portal Submit and any CAPTCHA/login
   wall still need you physically present per the hard rules already in
   place (Phase 5/6) — that doesn't change here. The button gets you to
   "everything is prepped and queued, review and click go" with zero manual
   assembly before that point. I will not build silent, unattended portal
   submission.

---

## Group R — `my-files` R2: resume/ becomes the cloud, not the repo

**R1. Second R2 bucket + generic file store**
- `R2_FILES_BUCKET` env (default `my-files`), same R2 account/credentials.
- `src/modules/files/store.ts` — thin wrapper over the same S3 client as
  `applications/store.ts` (bucket parameterized instead of hardcoded), same
  put/get/list/delete surface.

**R2. Migrate every `resume/*` reader to R2-first, local-fallback**
- `loadProfile()`, `loadMaster()`, `loadJobSearchConfig()`,
  `loadManifest()`/`loadManifestFromR2()` (already R2-mirrored — folds in
  here) all become "R2 if configured, else local file" — matching the
  pattern `readFolderFile` already uses in `generate.ts`.
- One-time migration script: push current `resume/master.json`,
  `profile.json`, `job-search.json`, `media-manifest.json`, `master.md`,
  `README.md`, `Dipankar_Saha_Resume.pdf` into `my-files`.

**R3. Drop `resume/` from git**
- Gitignore it (like `applications/`), remove tracked files, keep a short
  `README` pointer at the repo root saying where the data actually lives.
- Update every skill/doc that references a `resume/…` path.

*Note: several loaders are synchronous today (`loadMaster`, `loadProfile`) —
this phase makes them async, which ripples into their callers
(`apply-prep`/`generate.ts`/`resume.ts`/scripts). Flagging the size now so
"apply Phase R2" isn't a surprise.*

---

## Group M — `/media` page

**M1.** `/media` page, two sections:
- **Cloudinary assets** — list (from the manifest, which stays the index),
  each row: preview, project/feature, kind, caption. Actions: **reupload**
  (replace the file at the same `cloudinaryId`), **edit caption**, **delete**
  (Cloudinary Admin API destroy + manifest removal + R2 mirror update +
  cascade: any `content_items` row pointing at it gets flagged, not silently
  orphaned).
- **Files (my-files / R2)** — list of the R2 bucket from Group R. Actions:
  add, reupload, rename, delete.

**M2.** Server actions wrapping Cloudinary's Admin API (destroy/rename) and
the Group R file store.

---

## Group C — curated content cards (portfolio's real source of truth)

**C1.** Extend `content_items`: `cloudinaryPublicId text`,
`projectFeatureId uuid references project_features`. A row with
`assetType in (diagram, screenshot, video)` + `isPublic` + `status=published`
**is** a portfolio deep-dive card. No separate GitHub-link field is stored —
`projectFeatureId` already resolves to the feature's `repoUrl` + `codePaths`
(the same data `/api/public/features` already exposes), so the card's code
link is joined at serve time, never duplicated.

**C2.** Extend the existing `/content` page (not a new one) with these
fields when `assetType` is one of the three visual kinds: project/feature
picker, Cloudinary asset picker (from Group M's list), order. Add/edit/delete
here is immediately live — the public API reads this table directly, so
there's no separate "publish" step to forget.

**C3.** `/api/public/content-cards` (same unauthenticated + `revalidate=300`
+ CORS pattern as `/features` and `/content`) — returns the curated,
published visual cards **with the linked feature's `repoUrl` + `codePaths`
resolved inline** (`{ ...card, code: { repoUrl, links: [{label, url}] } }`),
so every card carries its GitHub reference alongside the visual.

**C4. Portfolio:** `ContentGrid` / `[slug]/page.tsx` switch from the raw
`/api/public/media` + feature-title join (last session's stopgap) to this
curated feed. `/api/public/media` stays for internal tooling (Group A's
dedup check) but the portfolio stops reading it directly. `ContentGrid`'s
card and lightbox both get a **"View code" link** (GitHub icon + the
feature's repo/code-path links) next to the caption — click the card to see
the visual, click "View code" to jump to the source. If a card has no linked
feature (hand-added, no code behind it), the link is simply omitted.

---

## Group P — dynamic project catalog

**P1.** Extend `projects`: `tagline text`, `highlights jsonb` (string array).
Backfill the 4 case-study projects added last session from their current
static `lib/data.ts` entries (one-time script, then those entries are
deletable).

**P2.** `/api/public/projects` — public, `isPublic` rows only, with tech
derived from linked skills, tagline/highlights/problem(`problemSolved`)/
solution(`architecture`) straight from the row.

**P3. Portfolio:** `lib/data.ts`'s static `projects[]` goes away entirely.
`Projects.tsx` (the card grid) and `[slug]/page.tsx` fetch live. Decide at
apply-time whether `ai-notification-system`'s bespoke page also migrates to
the generic renderer or keeps its custom components — recommend migrating
once this exists, to kill the last static content in the repo.

---

## Group A — idempotent, judgment-aware content generation

**A1.** `ensureVisualProof(projectSlug, featureKey)` — the single entry
point. Checks `content_items` (Group C) first; **returns the existing card
untouched if one exists.** Only on a genuine miss does it generate:

| situation | action |
|---|---|
| no live app page for this feature | **diagram** — SVG generated from the feature's description, uploaded straight to Cloudinary (no PNG conversion needed), `content_items` row created |
| feature is CLI/script-shown | **terminal-card** — runs the real command, renders output into a macOS-Terminal-styled HTML (traffic-light dots, rounded window chrome, dark theme, monospace), screenshots it to PNG via headless Chrome, uploads |
| feature has a live UI page | **screenshot** — Playwright MCP against the deployed app (needs your one-time login per profile; already persisted since last session) |
| feature genuinely needs motion | **flag for you** — I print exact recording steps (what to show, ~10–15s, save-as path) and stop; you record, drop the file, say go; I resume from upload onward. Never attempted automatically. |

**A2.** Content-hash dedup on top of the feature-key check: two features that
would generate the *same* diagram don't get two uploads.

---

## Group J — `/applications` page: select → content → apply

**How this actually executes.** Search (J3) is deterministic — API calls +
the app's own configured provider keys, no agent judgment — so it's the one
step that can genuinely run unattended (cron-able). **Content creation (J2)
and Apply (J4) need real judgment** (a sensible diagram, reading a live page,
walking a form field by field) — that's Claude Code, run under your
subscription, on this machine. The pgai UI is the board: what's selected,
what's missing, what's queued. It sets intent; a Claude Code session (this
kind, invoked when you ask) clears the queue. Nothing here spawns an
unattended background agent — "Apply" queues work, it doesn't execute itself.

**How the buttons actually trigger a Claude Code session.** A button click
on the deployed site can't itself run Claude — it can only record *intent*.
So "Process content" and "Apply" write a queue flag
(`job_applications.contentRequestedAt` / `applyRequestedAt`, two new nullable
timestamp columns — same pattern as the existing `excludedAt` flag) and
nothing more. A Claude Code session — this kind, invoked by you, or a
scheduled one via `/loop`/`schedule` polling "anything queued?" every so
often — reads that flag and does the work, then clears it
(`contentPreparedAt`/`appliedAt`). So: click the button anytime; the work
happens next time a session checks the queue (immediately, if you're already
in one and say so — or on the schedule if you set one up later). Being
upfront that a scheduled poll still spends a Claude Code session each time it
runs, same as any other invocation — it's not free background compute.

**J1.** Checkbox per job folder; I pre-check my recommendations (reusing the
existing score/group logic) but leave the final set to you. A **"Process
content"** button sets `contentRequestedAt` on the checked rows.

**J2. Content processing** (what a session does on seeing the flag) — for
every queued job, reads its
`proof-bundle.md`, finds every referenced feature missing visual proof
(via Group C), runs `ensureVisualProof` on each (batched, one run for
everything you selected — no per-item clicking), then:
- regenerates that job's `proof-bundle.md` (existing `regenerateProofBundle`)
- adds the top 2–3 visual links to `pitch-recruiter.md` / `pitch-referral.md`
  where they strengthen the pitch (my judgment — not a blanket insert)
- adds a portfolio/visual link to `why-fit.md` / `cover-letter.md` only when
  it genuinely helps that specific pitch (my judgment, same discipline as
  everything else in this plan — no filler links)

**J3. "Search jobs" button** — runs the fetch+score step in the background
(same `recordCronStart/Finish` pattern the existing crons use) with a status
the page polls, since a live multi-source search can run long for a
request/response cycle.

**J4. "Apply" button (top of page)** — sets `applyRequestedAt` on the
selected, content-complete jobs. A session picks these up and runs
`apply-fill`/`apply-drive` per job, still pausing for you at the final
Submit per Phase 5/6 — that boundary doesn't move. What this removes is
everything *before* that click: no more manually running prep, no more
manually checking what needs visual proof.

**J5.** Once you've run J1–J4 by hand a few times and I'm not doing anything
you'd correct, wire **only J3 (search)** into a Vercel Cron for every
morning — it queues fresh, scored jobs for you to review. J2 (content) and
J4 (apply) never get cron'd; they stay things a session processes when you
ask (or a scheduled session polls for), and J4's final Submit stays a
deliberate, present action either way.

**J6. One combined "Outreach & follow-ups" section on `/applications`** —
per open job (applied/screening/interviewing, from `applicationsOverview`,
Phase 10), a single card showing it all together: channels used so far, last
touchpoint, next follow-up due with an **overdue** marker, its **Gmail
drafts** with a **Send** button (`sendDraft` server-side), and its
**LinkedIn** note/message with copy-to-clipboard + a people-search link +
an **"I sent it"** button (`recordTouchpoint`, same as `outreach linkedin
--sent` today) — plus a general **"log follow-up sent"** action for anything
outside those two channels. One place per job for review, send, and log —
not split across sections. Sending itself stays manual either way (Gmail
confirm click, LinkedIn always manual) — this removes the terminal
round-trip, not the human send.

**J7. No more typing "process the queue."** A `SessionStart` hook (built via
the `update-config` skill, not hand-rolled) runs a lightweight check at the
start of *any* Claude Code session — any queued `contentRequestedAt` /
`applyRequestedAt` rows get surfaced as context automatically. I notice it
and start processing without being asked, same as if you'd typed the
sentence — your per-item checkpoints (reviewing prep, clicking Submit) stay
exactly where they were. This only fires when you open a session for
whatever reason; it's not a standing background process (that would be the
scheduled-agent poll option — not chosen here).

---

## What's still genuinely yours

- Video recordings (I tell you exactly what/how, then wait).
- The one-time login in the Playwright browser for live screenshots.
- Final Submit / CAPTCHA / any login wall, always.
- Reviewing the pre-selected job set and the generated pitch additions before
  a batch goes out — not because I can't decide, but because it's your name
  on the application.
