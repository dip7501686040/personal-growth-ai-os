# R2 store + auto-apply + outreach + visual proof

Order: **B (R2) → A (auto-apply/outreach) → C (visual proof)**.
Phase by phase. After each: STOP, summarize, wait for "apply Phase N".
One logical-unit commit per phase, on `main`.

---

## Ground rules

- No CAPTCHA solving, no SSO/password entry by script, no account creation — always the user.
- LinkedIn/Indeed automation breaks ToS and risks the account. Default = draft + manual send.
  Claude-driven paused-before-every-send is Phase 9b, opt-in only.
- Nothing sends without an explicit per-item `y`. No "send all".
- All copy grounded in `proof-bundle.md` / `resume.md` — no invented metrics, projects, links.
- **One file per purpose in a job folder. No duplicate/near-duplicate file types.**
  New capability extends an existing file; it never adds a parallel one.

## Job-folder file set (nothing else is added)

`resume.pdf` submit artifact · `resume.html` PDF print-source · `resume.md` plain-text paste + diff ·
`proof-bundle.md` matched skills→shipped work, **code link + visual link per item** ·
`search-provenance.md` why it surfaced · `outreach-targets.md` who to contact ·
`why-fit.md` the "why a fit" box · `cover-letter.md` full letter when asked (also the email-apply body) ·
`pitch-recruiter.md` cold outreach to the gatekeeper, all channels ·
`pitch-referral.md` referral ask to an employee, all channels ·
`job.json` JD + match data · `apply-result.md` submission record + confirmation screenshot ref.

---

## GROUP B — Cloudflare R2 as source of truth

### Phase 1 — R2 store + mirror
- `@aws-sdk/client-s3` → R2 (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
  bucket `applications`).
- `src/modules/apply/store.ts` — `putObject`, `getObject`, `listPrefix`, `deletePrefix`,
  `objectUrl`. Key scheme `<date>/<company>__<role>/<file>`.
- `pnpm apply push|pull [<date>|<folder>]` — sync local ↔ R2.
- Push the current local `applications/` up, then **gitignore `applications/`** and
  `git rm --cached` it — R2 is the sole source of truth; local is a working cache.
- `apply-prep` + every later generator auto-pushes the touched folder.

### Phase 2 — generators callable outside the CLI
- Extract core logic from `scripts/apply-prep.ts`, `scripts/resume.ts`, PDF regen,
  prose scaffolding → `src/modules/apply/generate.ts`
  (`scaffoldFolder`, `renderResume`, `regenPdf`, `writePitch`, `writeWhyFit`, …).
- CLI scripts become thin wrappers; server actions call the same functions.

### Phase 3 — `/applications` app page
- RSC lists R2 by date → folder → files (`listPrefix`).
- Open a file → view / edit markdown in-page → Save → `putObject`.
- Buttons: regenerate résumé / proof bundle / pitches → server action →
  `src/modules/apply/generate.ts` → write back to R2.
- Delete a folder → `deletePrefix` (confirm dialog).
- Status column from the Phase 10 ledger.

---

## GROUP A — auto-apply + outreach

### Phase 4 — Standing profile + answer bank
- `resume/profile.json` (gitignored) + `resume/profile.example.json` (committed):
  identity, links, work-authorization per region + sponsorship need, salary expectation,
  notice period, earliest start, years/seniority, remote-only=yes, relocate=no,
  contract types, "how did you hear" default, EEO answers (default "prefer not to say"),
  pronouns, criminal record=no, references=on request.
- `src/lib/apply/profile.ts` — zod schema + loader + `answerFor(labelText)`.

### Phase 5 — Assisted form-fill (Tier 1)
- Add `playwright`; `pnpm exec playwright install chromium`.
- `pnpm apply-fill <folder>`: pull folder from R2 → open `applyUrl` in a **visible**
  browser → detect Greenhouse/Lever/Ashby → fill name/email/phone/résumé-upload/
  LinkedIn/GitHub/cover-letter textarea/label-matched custom Qs from profile →
  **halt before Submit**, print filled ✓ / blank ⚠ / needs-you 🔴, save `apply-<ts>.png`
  → you review + click Submit → press Enter → capture confirmation → ledger `applied`
  → write `apply-result.md` → push to R2.
- Unknown ATS / login wall → open, screenshot, hand over.

### Phase 6 — Claude-driven browser (Tier 2)
- Playwright MCP in `.mcp.json`. `.claude/skills/apply-drive/SKILL.md`:
  open `applyUrl` → read DOM → fill from profile + folder → screenshot →
  **STOP, ask "submit? y/n"** → on `y` submit → capture confirmation → record.
  Never: accounts, captchas, passwords, submit without `y`.

### Phase 7 — Gmail draft + send (Tier 3)
- One-time: Google Cloud Desktop OAuth client → `~/.config/pgai/gmail-credentials.json`
  (gitignored); `pnpm gmail-auth` once. Scope `gmail.compose`.
- `src/lib/outreach/gmail.ts` — `createDraft`, `sendDraft`, `listDrafts`.
- `pnpm outreach email <folder> --kind apply|cold` → body from `cover-letter.md`
  (email-apply) or the Message section of `pitch-recruiter.md` (cold); recipient from
  `job.json.contactEmail` / `outreach-targets.md`; attach `resume.pdf`;
  **Draft only**; print link. `pnpm outreach send <draftId>` after explicit confirm.

### Phase 8 — Multi-channel pitch files (NO new files)
Restructure both pitch files so each carries every channel:
```
Subject: <line>                          ← email
## Message (~80 words)                    ← email body / LinkedIn DM / InMail
## LinkedIn connection note (≤300 chars)  ← fits the connect-request limit
```
`pitch-recruiter.md` audience = gatekeeper (recruiter or hiring manager);
`pitch-referral.md` audience = current employee. `why-fit.md` / `cover-letter.md`
unchanged. Update `src/modules/apply/generate.ts` + `.claude/skills/apply-morning/SKILL.md`.
Backfill the existing folders. Never create `cold-email.md` / `linkedin-*.md`.

### Phase 9 — LinkedIn outreach
- **9a (default)** `pnpm outreach linkedin <folder>` — print people-search URLs from
  `outreach-targets.md` + the note & message from `pitch-*.md`, open LinkedIn search in
  your normal browser. **You send by hand.** On confirm → touchpoint logged.
- **9b (opt-in)** Claude-driven via the Phase 6 MCP: connect + message, explicit `y`
  per send, hard caps (≤~10 connects/day, long random delays), stop on any checkpoint.
  Built only on explicit go after re-reading the risk.

### Phase 10 — Tracking
- Every channel logs: timestamp · channel (portal / email / linkedin-note / linkedin-dm)
  · ref (draft id / screenshot). Wire into `/apply-log` + `/apply-followups`.
- `pnpm outreach status` — per job: sent on which channel, what's due.

---

## GROUP C — visual proof (Cloudinary + portfolio)

Portfolio repo: **`/Users/dipankarsaha/portfolio`** (local, `github.com/dip7501686040/portfolio`).
I edit; user reviews + commits + pushes there.

### Phase 11 — Cloudinary media store + manifest
- `CLOUDINARY_URL` env. `src/lib/media/cloudinary.ts` — signed upload + URL builder
  (image / video / poster frame / transforms).
- `resume/media-manifest.json` — `projectSlug → featureKey → [{ kind:
  video|screenshot|diagram, cloudinaryId, caption }]`.
- `pnpm media upload <file> --project <slug> --feature <key> --kind screenshot
  --caption "..."` → upload + append to manifest.
- **User produces + uploads the media; the tool stores + indexes only.**

### Phase 12 — portfolio project pages + content cards
- Main page (`components/Projects.tsx` + `lib/data.ts`): add project cards for
  `personal-growth-ai-os`, `platform-infrastructure`, `platform-gitops`, `portfolio`
  alongside `ai-notification-system`. **Remove every "coming soon" state** — cards
  only exist when their slug page is done.
- Each project gets its own slug page under `app/projects/<slug>/` modelled on
  `ai-notification-system`, reusing the case-study components.
- The existing **"Technical deep dive"** section (`components/case-study/EngineeringEvidence.tsx`)
  becomes the content-card grid, fed from `media-manifest.json`: only finished cards,
  each an embedded Cloudinary video/image + caption, anchored `#<featureKey>`.

### Phase 13 — visual links in proof bundles + graph
- Link manifest media to graph entities (reuse `content_item` + feature/skill links).
- `getProofForJd` / `proofBundleMd` — for every feature, next to each GitHub `codeLinks`
  entry emit the matching **portfolio card link + Cloudinary URL** (`demoVideoUrl` exists;
  add `visualProof: [{kind, url, portfolioUrl}]`). Every proof line then carries
  code proof (GitHub) + visual proof (portfolio).

---

## What the user provides
- Phase 1: R2 bucket `applications` + API token (account id / access key / secret).
- Phase 4: fill `resume/profile.json`.
- Phase 5: OK to add Playwright + Chromium (~150 MB).
- Phase 7: Google Cloud Desktop OAuth client + one `pnpm gmail-auth`.
- Phase 9b: explicit decision after the risk note.
- Phase 11: Cloudinary account + `CLOUDINARY_URL`; produce + upload the media.
