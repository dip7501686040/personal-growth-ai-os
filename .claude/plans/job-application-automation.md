# Job Application Automation — Plan

**Status:** Draft v7 — §15b adds the phase-by-phase build order (Track A model picker: A1–A2; Track J job automation: J0–J6). Ready to start. (2026-09-07)
**Owner:** Dipankar Saha (single-user, private app)
**Run window:** daily for 30 days.

**Daily targets (your numbers):**
| Activity | Target/day |
|---|---|
| Relevant jobs surfaced | 15–20 |
| Applications to strong matches | 8–12 |
| Referral / contact outreach | 3–5 people |
| Follow-ups sent | 5–10 |
| Your time | 1–2 h avg, flexible, no hard cap |

**North star:** a **verified, low-ghost job list** — postings where a real human replies and hiring actually happens — with a **named contact/source** wherever possible, plus a ready-to-submit package per job.

---

## 0. Foundation — sync skills & project features from your real repos

**Why this is step one.** The knowledge base is only as good as its base layer:

```
skills + project features  →  knowledge base  →  content / learning  →  jobs / business
```

Right now every skill sits at *interested/practiced* and every project at *idea* — even though `portfolio`, `ai-notification-system`, `platform-gitops`, `platform-infrastructure`, `personal-growth-ai-os` (and more) prove otherwise. `get_proof_for_jd` reads exactly this data, so the job flow produces weak output until it's fixed — **and stays only as fresh as the last sync**.

**Why it isn't automatic today.** GitHub sync feeds the RAG knowledge base and creates `github_repo`-type skill evidence — but nothing in the app creates `project_features` rows, moves a project past `idea`, or produces the `project_feature`-type evidence that actually pushes a skill to `implemented`/`proven`.

**How — Claude Code on your Pro subscription** (local repo analysis, no API cost). A `/sync-repo <path-or-url>` skill in this repo. **Idempotent by design — run it against the same repo any number of times; each run reconciles, never re-creates.** Per run:

1. **Analyze (incremental)** — first run reads the whole repo (README, `package.json` / `go.mod` / infra dirs, `.github/workflows`, k8s manifests, `git log`, tags, deploy config). Later runs diff `git log <last-synced-SHA>..HEAD` and only re-examine what changed. The last-synced SHA is stored on the `projects` row.
2. **Extract features** — major modules / README sections / CHANGELOG → `{title, description, status (planned/in_progress/done), completedAt (from commit dates), codePaths}`. Each feature carries a stable `sourceKey = repo:<url>:feature:<slug>`.
3. **Map skills** — tech actually used per feature → your existing `skills` rows (aliases: k8s → Kubernetes). Unmatched tech → proposed new skill rows.
4. **Reconcile & write** — `scripts/sync-repo.ts` calls the app's service layer so invariants hold:
   - **New feature** → insert `project_features` + `project_skills`; `skill_evidence` (`sourceType: project_feature`, `sourceId: <featureId>`) as `status: suggested`.
   - **Existing feature** (matched on `sourceKey`) — status advanced (`in_progress` → `done`), description changed, or new skills detected → **update in place**; add `suggested` evidence only for the *new* skill/feature pairs. **Never touches already-accepted or already-rejected evidence.**
   - **Skill usage deepened** across runs (weak → moderate → strong, or a skill now spans 2–3 features) → add a fresh `suggested` evidence row reflecting the stronger claim; the old one stays.
   - **Feature no longer detectable** → **not deleted** (it may be real, just refactored). Stamp `lastSeenAt`; after N missed syncs, surface it in the review screen for you to keep or archive.
   - **Project status** — the new status is *proposed*, shown as a diff; if you've set it manually it is never silently overridden.
   - Emit `context_events` for every changed skill/project so the knowledge base refreshes.
5. **You review** — open Skills, bulk-accept the suggested evidence per skill (reject bad calls); confirm proposed project/feature status. **Levels then derive** (`deriveLevel`) from accepted evidence — you never set a level directly.

**Conservative by design.** Auto-detected evidence caps at `moderate` strength and `implemented` level unless a skill appears across 2–3 features/projects — no unreviewed inflation.

**Cadence.** Week 0: run once per repo for the initial population. Ongoing: re-run `/sync-repo` for any repo with meaningful new work (or a weekly pass over your active repos) — this is how features move to `done` and skills climb to `proven` over the 30 days as you actually ship.

**Repos:** `portfolio`, `ai-notification-system`, `platform-gitops`, `platform-infrastructure`, `personal-growth-ai-os`, + any others you name — local paths and GitHub URLs both work.

---

## 1. The package you get per job

Every morning, one command produces a folder per matching job containing:

1. **Tailored resume** — built from your master resume, starting from the closest of 3 archetypes, then reordered/rephrased for this JD's skills + the matching project features + skill relevance. Output `.md` → **ATS-clean `.pdf` and `.docx`**.
2. **Proof-of-work bundle** — links resolved from your knowledge base, grouped by JD requirement:
   - project **repo** link, **specific file/dir** links per requirement (JD says Kubernetes → `github.com/you/repo/tree/main/infra/k8s`), feature **demo video** (Cloudinary), feature **code** link
   - **published content** links (video / image / doc / diagram) on your portfolio
   - related **learning** evidence (weakest, fallback only)
3. **`why-fit.md`** — ~150 words for the form's free-text box.
4. **`cover-letter.md`** — ~250 words, only when the JD asks.
5. **`pitch-recruiter.md`** / **`pitch-referral.md`** — 60–90 words + 2–3 strongest proof links, channel-appropriate.
6. **`outreach-targets.md`** — who to contact for a referral at this company + a per-channel draft.
7. **`job.json`** — machine copy of JD, match data, all links, source, contact.

You do by hand: submit on the portal, send the messages, run a one-line `log` command.

---

## 2. Guiding principles

- **Three systems, clear jobs.** Private app = brain + ledger. Claude Code = daily driver. Portfolio = public renderer. Only the private app touches the private DB.
- **Deterministic where possible.** Skill/feature match, proof-of-work, related-content = already **no-LLM** (Knowledge Spine Phase 7). Stays that way.
- **LLM only for writing.** Resume tailoring, pitches, cover letter, why-fit — in **Claude Code on your Claude Pro plan**. No new in-app LLM cost.
- **No scrapers, no auto-submit, no auto-send.** Aggregator APIs + public feeds supply the list. You press submit and send.
- **Anti-ghost first.** The list is scored for reply-likelihood, not just keyword match (§4).

---

## 3. The three systems

```
                 morning: fetch + score jobs from many sources
   ┌───────────────────┐ ──────────────────────────────▶ ┌───────────────────────────┐
   │   CLAUDE CODE      │                                  │  Job sources (§4)          │
   │   (local driver)   │                                  │  JSearch · Adzuna ·        │
   │  /apply-morning    │ ◀────────────────────────────── │  SerpApi · WeWorkRemotely ·│
   │  /apply-followups  │      scored, deduped list         │  RemoteOK · Remotive ·     │
   │  /apply-log        │                                  │  HN "Who is hiring"        │
   └───────┬───────────┘                                  └───────────────────────────┘
           │  MCP (read knowledge)  +  HTTP API (write records)
           ▼
   ┌───────────────────────────────┐
   │   PERSONAL-GROWTH APP          │  brain + ledger
   │   (private, password login)   │  • knowledge base (skills, features, proof, content)
   │   MCP server + new API routes  │  • job_applications + touchpoints ledger
   └───────┬───────────────────────┘
           │  GET /api/public/*   (only isPublic + published; excluded from auth middleware)
           ▼
   ┌───────────────────────────────┐
   │   PORTFOLIO APP               │  github.com/dip7501686040/portfolio · Next 14
   │   (Vercel, public)           │  • /proof/<slug> + /work/<project>/<feature> pages
   └───────────────────────────────┘
```

---

## 4. Job sources & anti-ghost scoring

### 4.1 Sources — what can be automated

| Source | Access | Value |
|---|---|---|
| **JSearch** (RapidAPI) | free key ✓ | Widest single feed — pulls Google-for-Jobs (LinkedIn, Indeed, Glassdoor, ZipRecruiter…). Gives apply link, publisher, posted date, sometimes salary. |
| **Adzuna** | free key ✓ | Strong India + global; **reliable salary data** (drives the LPA filter); clean company names. |
| **SerpApi Google Jobs** | free key ✓ (100/mo) | Broad catch-all; `apply_options` (multiple apply links), posted-at, salary. Overlaps JSearch — used mainly to cross-verify a posting is real. |
| **We Work Remotely** | public RSS, free | Remote-only, curated, **direct employer, low ghost rate**. |
| **RemoteOK** | public JSON, free | Remote-only, salary ranges, direct apply, tags. |
| **Remotive** | public JSON, free | Remote-only, curated. |
| **HN "Who is hiring"** | Algolia API, free | Monthly founder-posted thread; **lowest ghost rate**, contact usually in the post. |

**Manual-browse only** (no usable API / anti-scraping — you check these yourself, then paste a JD to track it): **Wellfound, Instahyre, Naukri, LinkedIn Jobs.** LinkedIn/Indeed/Glassdoor are still covered *indirectly* via JSearch/SerpApi.

### 4.2 Merge + dedupe

Normalize every posting to `{company, role, location, remote, salary, postedAt, url, applyLinks[], source, publisher, contact?, companyType, funding}`. Dedupe on `(company, normalized-role, ~week)` — keep the entry with the best apply link + most metadata; record how many sources carried it.

### 4.3 Two-group output — nothing is dropped (yet)

For the first weeks you want to **see everything** and judge the filters yourself. So `/apply-morning` splits the list into two groups, never discards:

- **Group A — Clean.** Passed every filter: recent, direct/product company, no agency/body-shop signal, no evergreen/ghost signal. Ranked by `reply_likelihood × skill_match`. This is what you work from first.
- **Group B — Flagged.** Tripped one or more filters. Shown **below Group A**, each row listing its flag(s) (e.g. `agency_unnamed`, `stale:34d`, `body_shop:C2C`, `evergreen`, `no_salary`, `verify_funding`). Same ranking within the group. You review these manually and apply/skip case by case.

Every job (both groups) keeps its full `flags[]` array in `job.json` and the `job_applications` row, so the weekly review can show **which flags actually correlate with ghosting** in your data.

**Later:** once you've watched a flag for a few weeks and it reliably means "waste of time", tell me and that flag graduates to a hard drop (removed from the fetch entirely). Until you say so, every flag is show-and-sort-down only.

### 4.4 Signals (raise/lower rank, or flag → Group B)

| Signal | Effect |
|---|---|
| Posted ≤ 7 days | strong up |
| Posted > 21 days | flag `stale:<n>d` → Group B |
| Direct-employer board (WWR, RemoteOK, HN) or company career page | up |
| Publisher looks like a staffing agency ("staffing", "talent", "consultancy", "recruiters" in name) | flag `agency_publisher` → Group B |
| Named contact / email present (common on HN, some WWR) | strong up · flag `has_contact` for direct outreach |
| Posting seen on many boards for many weeks (evergreen) | flag `evergreen` → Group B |
| "100+ applicants" / very high application count where known | down (stays in A) |
| Real salary disclosed **and** ≥ ~18 LPA-equivalent | up |
| Salary hidden | flag `no_salary` → Group B |
| Small/mid-stage company (from enrichment where available) | up |
| **Product company** (own product, not services) | up |
| **Agency posting that names the client + location** | flag `agency_named_client` → Group B |
| **Agency / staffing posting with no named client** ("our MNC client", "product-based company") | flag `agency_unnamed` → Group B |
| **Body-shop / outsourcing** ("C2C", "C2H", "bench", "onsite at client location", third-party staffing) | flag `body_shop` → Group B |
| **Funding known and healthy** (recent round, credible investor) | up |
| **Funding known and weak/stale** (no raise in 3+ yrs for a startup, or shutting-down signals) | flag `weak_funding` → Group B |
| Funding unknown | flag `verify_funding` (stays in A — it's just a note) |

Rule of thumb: **anything you'd want to eyeball before trusting → a flag that sends it to Group B**; anything that's just "slightly less promising" → a rank nudge within Group A.

### 4.5 Salary normalization

Your band: **20–30 LPA INR** (≈ **$24k–$36k/yr** at ~83 INR/USD). `/apply-morning` fetches a live USD/INR rate (fallback 83), converts every disclosed salary to LPA-equivalent, shows both. A disclosed salary **below ~18 LPA-equivalent** → flag `low_salary` → Group B (not dropped). Strong global-remote roles often pay 40–90 LPA-equivalent — that's fine, up-ranked.

### 4.6 Focus

Remote-first. Everything tagged `remote | onsite-foreign | onsite-india`. `onsite-foreign` and `onsite-india` postings → flag `onsite` → Group B unless skill-match is high **and** salary clears the band, in which case they stay in Group A. You can filter by tag each morning regardless.

### 4.7 Company type & funding filter

You do **not** want middle-man agencies that just outsource your work — but for now these are **flagged into Group B, not dropped**, so you can verify the classifier is right.

**`companyType` — decided from company name, domain, and posting language:**

| Class | Signals | Outcome (for now) |
|---|---|---|
| `product` | real product website (not a services/portfolio site); posting says "our product / platform / users"; engineering-led org on LinkedIn | Group A, up-rank |
| `agency_named_client` | "hiring for our client **<name>**, based in **<location>**"; client + location both stated | Group B, flag `agency_named_client` |
| `agency_unnamed` | "our client", "an MNC", "a product-based company", "reputed client" — no name | Group B, flag `agency_unnamed` |
| `body_shop` | "C2C", "C2H", "contract-to-hire", "bench", "deputation", "onsite at client site", "third-party payroll", staffing-firm name ("…Staffing", "…Talent", "…Consultancy Services", "…Infotech") | Group B, flag `body_shop` |
| `unknown` | not enough signal | Group A, flag `verify_company` |

Once you've watched `agency_unnamed` / `body_shop` for a few weeks and confirmed they're never worth it, tell me and they graduate to a hard drop (§4.3).

**`funding` — best-effort, honest about limits:**
- **From the posting text** where stated (common on HN "Who is hiring", We Work Remotely, some listings): stage, amount, investors, date → captured directly.
- **Otherwise `unknown`** — there is no reliable free funding API. Flagged `verify_funding` (stays in Group A — just a note); `job.json` / `outreach-targets.md` include a one-click check link (Crunchbase / company "About" / "Careers") for a ~30-sec check before applying.
- **Explicit negative signal** (layoffs, "winding down", down-round language) → Group B, flag `weak_funding`. Not dropped.
- Optional later: wire a paid enrichment (Crunchbase Basic, PredictLeads) if the manual check becomes the bottleneck.

Both `companyType` and `funding` land in `job.json` and the `job_applications` row so the weekly review can tell you which company types actually reply.

### 4.8 Contact / source per job

- If the posting carries a name/email → captured into `job.json` and `outreach-targets.md`.
- If not → the job is flagged `needs-contact`; `outreach-targets.md` gives you a LinkedIn search string ("<company> recruiter", "<company> engineering manager") and pre-written referral drafts to fill a name into. The system never scrapes LinkedIn; you spend ~1 min finding the person, the message is ready.

---

## 5. Resume strategy

### 5.1 Structure

- **Master résumé** — one comprehensive structured source (checked into this repo as `resume/master.md` + a `resume/master.json`, seeded from your Google Doc). Never sent anywhere.
- **3 archetypes**, generated from the master, because JDs cluster:
  1. **Backend / Distributed Systems** — Node/NestJS, event-driven, RabbitMQ, microservices, Postgres. (Your core.)
  2. **Platform / DevOps** — Kubernetes, AWS EKS, CI/CD, observability (OpenTelemetry/Prometheus/Grafana/Jaeger/Loki — already on your resume).
  3. **AI / LLM Engineering** — OpenAI integration, RAG, agentic workflows, prompt engineering — backed by *this* project (personal-growth-ai-os + the knowledge spine).
- **Per-JD variant** — `/apply-morning` picks the nearest archetype, then: rewrites the summary line to the JD, reorders skill/bullet order to lead with JD keywords, injects the 2–3 matching project features, drops irrelevant tech. → `resume.md` → `resume.pdf` + `resume.docx`.

So the answer to "2 or 3 versions?": **3 archetypes**, plus the auto per-JD tailoring on top.

### 5.2 ATS rules (the generator enforces these)

- Single column. **No tables, text boxes, images, icons, charts, headers/footers.**
- Standard headings: `Summary` · `Skills` · `Experience` · `Projects` · `Education`.
- Standard font (Calibri/Arial/Georgia), 10–12 pt. Dates as plain `MMM YYYY`.
- Skills as a plain comma/pipe list, not skill bars.
- Export **both** `.docx` (best ATS parsing — many portals prefer it) and a **text-based `.pdf`** (never image/scanned).
- Filename `Dipankar_Saha_Resume_<Role>.pdf`.
- Mirror the JD's exact wording where truthful ("Kubernetes" and "k8s"; "CI/CD" and "continuous integration").
- 1–2 pages.

> Pipeline: Markdown → `pandoc` → `.docx` + `.pdf` with a clean ATS reference template. Your Google Doc formatting is likely fine content-wise but risky for ATS parsing (Docs often exports multi-column/table structure). Recommendation: rebuild the template as ATS-clean Markdown; **I can produce that template from your current resume content** once you drop the PDF/Doc in.

---

## 6. Personal-growth app changes

### New tables

| Table | Purpose | Key columns |
|---|---|---|
| `job_applications` | one row per prepped job | company, role, jdText, jdUrl, portal, source, contactName, contactChannel, remoteKind, salaryRaw, salaryLpa, companyType (`product`/`agency_named_client`/`agency_unnamed`/`body_shop`/`unknown`), fundingStage, fundingNote, status (`draft`→`applied`→`screening`→`interviewing`→`offer`/`rejected`/`ghosted`), replyLikelihood, skillMatch, matchedSkills (jsonb), matchedFeatures (jsonb), proofBundle (jsonb), bundleDir, appliedAt, createdAt, updatedAt |
| `application_touchpoints` | every message about an application | applicationId, kind (`submitted`/`recruiter_pitch`/`referral_pitch`/`follow_up_1`/`follow_up_2`/`interview`/`note`), channel (`portal`/`email`/`linkedin`/`whatsapp`/`twitter`/`instagram`/`facebook`/`discord`/`slack`/`telegram`/`other`), sentAt, responseAt, responseSummary, nextDueAt |

### Link metadata on existing tables

| Table | New columns |
|---|---|
| `projects` | `repoUrl`, `liveUrl`, `lastSyncedSha` (git SHA at last `/sync-repo` run), `lastSyncedAt` |
| `project_features` | `demoVideoUrl` (Cloudinary), `codePaths` (jsonb, e.g. `{"k8s":"infra/k8s","api":"src/api","ci":".github/workflows"}`), `sourceKey` (`repo:<url>:feature:<slug>`, unique), `lastSeenAt` |
| `content_items` | `isPublic` (bool), `publishedUrls` (jsonb), `assetType` (`video`/`image`/`doc`/`diagram`/`post`) |

### MCP server — new tools (extend `mcp/server.ts`)

| Tool | In | Out |
|---|---|---|
| `get_proof_for_jd` | `jdText` | matched skills (name, level, weight); matched features (title, status, repoUrl, demoVideoUrl, JD-relevant `codePaths` links); matched content (title, assetType, publishedUrls); related learning. **No LLM.** |
| `get_master_resume` | — | master résumé JSON + text + which archetype fits a given JD |
| `record_application` / `set_application_status` / `record_touchpoint` | … | writes via authenticated `POST /api/apply/*` (local shared secret) so DB logic stays in the app |
| `list_open_applications` / `list_due_followups` | status? / — | ledger reads |

### Public API (for the portfolio — exclude from auth middleware)

- `GET /api/public/content` → published content with `publishedUrls`, `assetType`, related skill/feature names
- `GET /api/public/features` → public features: title, description, `demoVideoUrl`, `repoUrl`, project

### In-app model selection (settings page) — was "Phase A"

- A model dropdown in the app's settings: **`claude-sonnet-5`** (Anthropic key), **`gpt-5`**, **`gpt-4.1`** (OpenAI key), **`gemini-3-flash`** (existing). Persisted per user in `agent_model_config` (already exists — `buildLadder` reads it as the top of every agent's ladder).
- Whatever you pick becomes entry #1 for **in-app agents + the Vercel crons**; the existing Gemini/OpenAI chain stays behind it as automatic fallback (rate-limit / missing-key / outage).
- Build: `ANTHROPIC_API_KEY` in `env.ts`; a `lib/llm/anthropic.ts` provider (structured output via Claude tool-use); `claude-sonnet-5` + `gpt-5` rows in `pricing.ts`; `hasProviderKey` / `getProvider` wired for `anthropic` and for `openai:gpt-5`.
- **The job-apply flow (§8) ignores this setting entirely** — it runs in Claude Code under your Pro subscription (no API key, no per-token cost), a separate lane. The subscription cannot back in-app / cron calls (§ earlier discussion: subscription auth is a local OAuth profile, not a server credential), so in-app Claude = Sonnet 5 via the API key (~$2–3/mo at your usage).
- Independent of everything else here — can ship any time.

---

## 7. Portfolio app changes

**Current state (checked):** `github.com/dip7501686040/portfolio`, Next 14 App Router, all content hardcoded in `lib/data.ts` (profile, skills, experience, projects with image+video media), one case-study page, resume PDF served from `/public`. No CMS.

**Plan:**
- Add `lib/proof.ts` (typed array) + `app/proof/[slug]/page.tsx` and `app/work/[project]/[feature]/page.tsx`.
- These pages fetch `personal-growth-app/api/public/*` at build time with **ISR (revalidate hourly)** — so a brief private-app outage still serves cached proof pages, and the private app stays the single source of truth.
- No admin UI added to the portfolio. It only renders.
- Existing project media support (Cloudinary video/image) is reused for feature demo embeds.

*Alternative if you want zero runtime coupling:* the private app commits generated entries into the portfolio's `lib/proof.ts` via the GitHub API → Vercel redeploy. More moving parts; only worth it if the ISR dependency bothers you. Default is ISR.

---

## 8. Claude Code — the daily driver (a project skill in this repo)

**`/apply-morning`**
1. Query all §4 sources with your archetype keywords + titles + locations; merge + dedupe (§4.2); score (§4.3); normalize salary (§4.4).
2. Drop anything already in `job_applications`.
3. Show **Group A (clean)** then **Group B (flagged)** — each row: company · role · remote-kind · salary(LPA) · reply-likelihood · skill-match · source · contact? · flags. You pick 8–12 (usually from A; dip into B when a flagged one looks worth it).
4. Per picked job → `applications/<YYYY-MM-DD>/<company>__<role>/` with: `resume.md`+`.pdf`+`.docx`, `why-fit.md`, `cover-letter.md` (if asked), `pitch-recruiter.md`, `pitch-referral.md`, `outreach-targets.md`, `proof-bundle.md`, `job.json`. Data from `get_proof_for_jd` + `get_master_resume`; writing by Sonnet via Claude Code.
5. `record_application` each → ledger, `status: draft`.
6. Summary table: job · scores · folder · ready?

**`/apply-log <folder|id> [portal]`** — after you submit: status→`applied`, record `submitted` touchpoint, schedule follow-up #1 (day 5).

**`/apply-followups`** — `list_due_followups` → draft `follow-up-1.md` / `follow-up-2.md` per channel into each folder → you send → `/apply-log` records + schedules next (day 12), then stop unless a reply.

**Optional:** a scheduled cloud routine runs `/apply-morning` ~08:45 so the list + folders are waiting.

---

## 9. How the bundle maps to a JD submission

| JD / recruiter asks for… | You use… |
|---|---|
| Résumé upload | `resume.pdf` / `resume.docx` |
| "Why are you a fit?" box | `why-fit.md` |
| Cover letter | `cover-letter.md` |
| Recruiter DM/email | `pitch-recruiter.md` |
| Employee referral ask | `pitch-referral.md` + `outreach-targets.md` |
| "Portfolio / links" field | top 3 lines of `proof-bundle.md` |
| Long form, evidence handy | `proof-bundle.md` (grouped by requirement) |
| Day-5 / day-12 nudge | `follow-up-1.md` / `follow-up-2.md` |

`proof-bundle.md`, grouped by requirement, strongest link each:
```
## Kubernetes
- infra/k8s manifests — github.com/you/orders-svc/tree/main/infra/k8s
- "Zero-downtime rollout" demo — res.cloudinary.com/.../rollout.mp4  (2 min)

## Event-driven architecture
- RabbitMQ consumer + outbox — github.com/you/orders-svc/blob/main/src/events/consumer.ts
- Blog: "Outbox pattern in practice" — dipankar.dev/proof/outbox-pattern
```

**Proof-link priority:** feature demo video → specific repo path (`codePaths[requirement]`) → published content → whole repo → learning evidence.

---

## 10. Daily loop

| Time | You | System |
|---|---|---|
| ~08:45 | — | (optional) cloud pre-run of `/apply-morning` |
| morning | run/review `/apply-morning`; pick 8–12 | fetch + score + generate folders (~15–20 min model work) |
| +1–2 h | per job: skim `resume` + `why-fit`, submit on portal, send `pitch-*` where relevant, do 3–5 referral outreaches from `outreach-targets.md`, `/apply-log` each | ledger + follow-ups scheduled |
| every 2–3 days | `/apply-followups`, send 5–10, `/apply-log` each | touchpoints recorded |
| weekly | `/sync-repo` over active repos → accept new evidence (keeps skills/features current as you ship); review ledger: reply rate by source / pitch style / proof link; tune | — |

---

## 11. 30-day rollout

### Week 0 — setup (~4–5 sessions)

- [ ] **§0 Foundation sync (do first)** — build `/sync-repo` + `scripts/sync-repo.ts` (idempotent reconcile; stores last-synced SHA on `projects`); run per repo (`portfolio`, `ai-notification-system`, `platform-gitops`, `platform-infrastructure`, `personal-growth-ai-os`, …); you bulk-accept the suggested evidence + confirm project status. Everything below depends on this data; re-run weekly thereafter.
- [ ] **MCP wiring** — add `personal-context` to Claude Code's MCP config, confirm `mcp/server.ts` runs (`/mcp`).
- [ ] **App schema** — `job_applications`, `application_touchpoints`; link-metadata columns (`projects.repoUrl/liveUrl`, `project_features.demoVideoUrl/codePaths`, `content_items.isPublic/publishedUrls/assetType`). One migration.
- [ ] **App API** — `POST /api/apply/*` (shared secret); `GET /api/public/content` + `/features`; middleware exclusion for `/api/public/*`.
- [ ] **MCP tools** — `get_proof_for_jd`, `get_master_resume`, write tools.
- [ ] **In-app model picker** — `anthropic.ts` provider + `ANTHROPIC_API_KEY` + `gpt-5`/`claude-sonnet-5` pricing rows + settings dropdown. (Independent; can slot in any time.)
- [ ] **Resume** — you drop the PDF/DOCX in `resume/`; I build `master.md` + `master.json` + 3 ATS-clean archetypes + the `pandoc` → docx/pdf pipeline.
- [ ] **Link-metadata top-up** — after §0, fill any gaps: per feature `demoVideoUrl` (Cloudinary) + `codePaths`; per public content item `isPublic` + `publishedUrls` + `assetType`.
- [ ] **Portfolio** — `lib/proof.ts` + `/proof/[slug]` + `/work/[project]/[feature]` on ISR.
- [ ] **Job sources** — plug in JSearch + Adzuna + SerpApi keys; wire WWR/RemoteOK/Remotive/HN feeds; build the merge + score module.
- [ ] **Claude Code skill** — `/apply-morning`, `/apply-log`, `/apply-followups` in `.claude/skills/`.
- [ ] **Dry run** — 3 real jobs end-to-end; tune resume/pitch prompts + the score weights.

### Days 1–30

Run §10. Tuning passes at day 7 and day 21. Keep `applications/README.md` as a running log of what's landing replies.

---

## 12. Inputs from you — on demand

You'll provide these when I ask, at the point in Week 0 where each is needed:

1. **Resume file** — export your Google Doc as **PDF + DOCX** (both), drop them in `resume/`. I'll build the master + archetypes + ATS template from them.
2. **Project repos** — the GitHub repo URLs for the projects you'd cite (personal-growth-ai-os, portfolio, orders/notification service, others). I'll clone/scan them to propose `codePaths` per feature.
3. **Cloudinary** — the base URL / folder where your demo videos live, or a list of `feature → video URL`.
4. **Job-source keys** — put `JSEARCH_API_KEY`, `ADZUNA_APP_ID` + `ADZUNA_APP_KEY`, `SERPAPI_KEY` in `.env.local` when we start Week 0.
5. **Portfolio deploy URL** — the live domain (for generating proof links). `dipankar.dev`? something else?
6. **Target titles** — the exact role titles to search (e.g. "Senior Backend Engineer", "Platform Engineer", "Backend Engineer Remote", "Full Stack Engineer", "AI Engineer"). And any hard *excludes* (e.g. no "Support", no "QA").
7. **Published content list** — as we backfill: for each already-public post/video/doc, its URL(s) and which skill/feature it demonstrates.

---

## 13. Decisions

**Confirmed:**
- **SerpApi Google Jobs** — cross-check on top-ranked jobs only (free tier ~3 searches/day), not a primary feed. Revisit if coverage is thin.

**Still open:**
- **Résumé PDF engine** — `pandoc` locally (recommended, simple) vs a render endpoint on the app.
- **Cloud pre-run at 08:45** — start manual, add the routine once the flow is proven?
- **Wellfound / Naukri / Instahyre / LinkedIn** — manual browse, paste JD to track. Accept that these aren't in the automated morning list?
- **In-app career agent** — deterministic `get_proof_for_jd` covers the daily flow; running the full LLM career analysis per job is optional polish, decide after the dry run.
- **Paid company enrichment** (Crunchbase Basic / PredictLeads) — only if the manual `verify-funding` check becomes the daily bottleneck.

---

## 14. Explicitly out of scope

- Scraping job portals; auto-submitting applications; auto-sending pitches/follow-ups; a second admin UI in the portfolio.

---

## 15b. Build phases (execution order)

Two tracks, shipped one phase at a time — each phase ends with full verification (`tsc` / `lint` / `test` / `build` + a live check) and a stop-and-summarize before the next, same discipline as the Knowledge Spine phases.

### Track A — In-app model selection (small, independent)

| Phase | Scope | Done when |
|---|---|---|
| **A1** | `anthropic` added to `llmProviderEnum` (migration) + `LlmProviderName`; `ANTHROPIC_API_KEY` in `env.ts`; new `lib/llm/anthropic.ts` (structured output via Claude tool-use); `claude-sonnet-5` + `gpt-5` rows in `pricing.ts`; `hasProviderKey` / `getProvider` wired; both models registered as selectable `ModelChoice`s (not yet in any default ladder). | A raw structured call through Sonnet 5 **and** gpt-5 succeeds; verification green. |
| **A2** | New `/settings` page + nav link. One "Preferred model" dropdown: `claude-sonnet-5` / `gpt-5` / `gpt-4.1` / `gemini-3-flash`. Save writes `agent_model_config` so `buildLadder` puts the pick on top for every agent + cron; existing Gemini/OpenAI chain stays as automatic fallback. | Pick Sonnet 5 → run the career agent → `ai_usage` shows `anthropic:claude-sonnet-5`; remove the key → same run falls back cleanly. |

### Track J — Job application automation

| Phase | Scope | Done when |
|---|---|---|
| **J0** | Migration for all link-metadata columns (§6). `scripts/sync-repo.ts` (idempotent reconcile via the service layer). `/sync-repo` Claude Code skill (analyzer → proposal JSON). Batch-accept affordance on the Skills page + project-status diff confirm. Run against the 5 repos; you accept. | Skills derive to `implemented`/`proven` after acceptance; projects show real status + features; re-running `/sync-repo` on an unchanged repo writes **zero** new rows. |
| **J1** | Wire `mcp/server.ts` into Claude Code (`.mcp.json`). Add `get_proof_for_jd` (deterministic) + `get_master_resume` MCP tools. | Both tools, called from Claude Code, return real data off the J0-populated DB. |
| **J2** | Migration: `job_applications`, `application_touchpoints`. `POST /api/apply/*` routes (shared secret) + MCP write/read tools. Minimal `/applications` list page. | Create → update → list round-trips via MCP; page renders. |
| **J3** | You drop résumé PDF/DOCX in `resume/`. Build `master.md` / `master.json` + 3 archetypes + `pandoc` → docx/pdf pipeline + ATS template. | A tailored résumé generates for a sample JD; ATS-lint passes (single column, no tables, text-based PDF). |
| **J4** | `src/lib/jobs/` — fetchers (JSearch/Adzuna/SerpApi/WWR/RemoteOK/Remotive/HN) + normalize + dedupe + `companyType` classify + reply-likelihood score + salary-normalize + Group A/B split. Keys into `.env.local`. | A real ranked two-group list for your target titles. |
| **J5** | `/apply-morning`, `/apply-log`, `/apply-followups` Claude Code skills tying J1–J4 together. | End-to-end dry run on 3 real jobs — folder has all 7 files, ledger rows created, proof links present. |
| **J6** | `GET /api/public/content` + `/features` (+ middleware exclusion). Portfolio `lib/proof.ts` + `/proof/[slug]` + `/work/[project]/[feature]` on ISR. | A proof link from a J5-generated pitch resolves to a live portfolio page. |

**Suggested order:** A1 → A2 → J0 → J1 → J2 → J3 → J4 → J5 → J6, then run the Days 1–30 loop (§10) with `/sync-repo` weekly.

---

## 15. Relationship to earlier plans

- **Knowledge Spine (Phases 0–7, shipped)** — the matching + proof-of-work + related-content substrate this sits on.
- **"Phase A" (Sonnet 5 in-app)** — folded in as §6 → *In-app model selection*. Independent; **not on the critical path** for job automation (the job flow runs in Claude Code on your Pro plan). Ship it whenever.
- **Broader vision** (daily capture, "Today" view, learning roadmap, content cron) — the portfolio public API and the §0 backfill are shared with it; the rest is deferred behind the job/career priority.
