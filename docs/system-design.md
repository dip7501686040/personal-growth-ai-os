# Personal Growth AI OS — System Design

Single-user personal AI operating system. Six specialized agents (Learning,
Project/Proof-of-Work, Career, Content, Business, Chief of Staff) share one
evolving **Proof-of-Skills graph** so the system behaves as one connected
intelligence rather than six chatbots.

Core loop:

```
LEARN → PRACTICE DSA + SYSTEM DESIGN → BUILD PROJECT
      → CAPTURE REAL DEV ACTIVITY (Claude Code on the Mac)
      → PROVE SKILLS → MATCH BETTER JOBS → CREATE REAL CONTENT
      → FIND SMALL-BUSINESS OPPORTUNITIES → LEARN WHAT IS MISSING → (repeat)
```

---

## 1. High-level architecture

Modular monolith. One Next.js application (App Router) deployed to Vercel;
Supabase for Postgres, Auth, Realtime, Storage. An optional local Node.js
"activity collector" runs on the Mac and is invoked by Claude Code hooks.

```
                     YOUR MAC                       │        CLOUD (Vercel + Supabase)
                                                    │
 Claude Code ──hooks──▶ Local Activity Collector    │  Next.js app (modular monolith)
                            │ aggregate session     │  ├─ Dashboard + 8 pages (RSC)
                            ▼                        │  ├─ Server Actions / Route Handlers
                     JSONL offline queue             │  ├─ Agent Orchestrator (lifecycle FSM)
                            │ HTTPS + Bearer token   │  ├─ LLMProvider (Gemini | OpenAI)
                            └────▶ POST /api/activity/ingest ──▶ activity_events (RECEIVED)
                                                    │                    │
                                                    │       Vercel Cron ─▶ daily activity analysis
                                                    │                    ▼
                                                    │   activity_analyses + skill_evidence(SUGGESTED)
                                                    │                    │
                                                    │   Learning · Project · Career · Content · Business
                                                    │            agents  ─▶ shared skill graph
                                                    │                    │
                                                    │            Chief of Staff ─▶ daily_briefings
                                                    │            Approval Inbox (human-in-the-loop)
                                                    │            Supabase Realtime ─▶ agent status board
```

The Mac is optional: cloud agents work whether or not the collector is online.

---

## 2. Component responsibilities

| Component | Responsibility |
|---|---|
| `src/app` | Routing, pages, Server Actions, Route Handlers (`/api/activity/ingest`, `/api/agents/[name]/run`, `/api/cron/[job]`), auth callback routes |
| `src/proxy.ts` | Next 16 proxy (ex-middleware): refresh Supabase session, guard the `(app)` area |
| `src/modules/*` | Domain logic, framework-agnostic. One folder per domain: `skills`, `learning`, `dsa`, `projects`, `career`, `content`, `business`, `activity`, `agents`, `approvals`, `briefing` |
| `src/lib/db` | Drizzle client + schema (barrel at `src/lib/db/schema`) |
| `src/lib/llm` | `LLMProvider` interface, `GeminiProvider`, `OpenAIProvider`, `MockProvider`, response cache, usage recording |
| `src/lib/tools` | `Tool` interface + registry (MCP-ready; MCP not built) |
| `src/lib/scheduler` | `Scheduler` interface + `VercelCronScheduler` |
| `src/lib/supabase` | `server` / `client` / `middleware` Supabase helpers |
| `src/lib/realtime` | Supabase Realtime subscriptions for the dashboard |
| `collector/` | Standalone Mac companion (own `package.json`), invoked by Claude Code hooks |

Rules: `modules/*` and `lib/*` never import from `app/*`. An agent touches
another domain only through that domain's module service. Deterministic code
first; call an LLM only when the task needs language understanding.

---

## 3. Data flow

1. User logs learning / DSA / projects, or the collector posts a coding session.
2. Deterministic services normalize input and write domain rows + `skill_evidence`.
3. Scheduled (or manually triggered) agent runs read the shared graph
   (`gatherContext`), optionally call an LLM (`analyze`), and write
   recommendations (`buildRecommendations`).
4. Anything on the human-in-the-loop list becomes an `approvals` row instead of a
   direct change.
5. Chief of Staff aggregates the latest agent results + open approvals + recent
   activity analyses into a `daily_briefing`.
6. Dashboard reads current state; Supabase Realtime pushes agent status changes.

---

## 4. Agent execution lifecycle

Finite state machine, persisted to `agent_runs` / `agent_events`, idempotent per
`(agent_name, trigger_key, day)`:

```
triggered → running → gathering_context → analyzing → recommending
          → (waiting_for_approval)? → completed          ╲→ failed (logged)
```

Every concrete agent implements:

- `gatherContext()` — pure DB reads. No LLM.
- `analyze(context)` — `LLMProvider.generateStructured(zodSchema)` when needed;
  result cached in `llm_cache` by a stable hash of the context.
- `buildRecommendations(analysis)` — writes domain rows; creates `approvals` for
  human-in-the-loop actions.

`agent_runs` stores: agent name, status, trigger source, input/context summary,
current step, result, timestamps, model used, token counts, estimated cost.

---

## 5. Shared skill / proof graph

Levels: `INTERESTED → LEARNING → PRACTICED → IMPLEMENTED → PROVEN`.
Only `IMPLEMENTED` and `PROVEN` strongly influence the Career Agent.

`skill_evidence` is the join between raw signals and a skill. Each row has a
`source_type` (`learning_session | dsa_attempt | project_feature |
activity_analysis | manual | agent_suggestion`), a `strength`, the max level it
`supports_level`, and a `status` (`suggested | accepted | rejected`).

Deterministic progression rules (`modules/skills`):

| Evidence | May justify |
|---|---|
| User marks interest | `INTERESTED` |
| ≥1 linked `learning_session` | `LEARNING` |
| ≥1 solved `dsa_attempt` for the skill's pattern, or repeated practice | `PRACTICED` |
| ≥1 accepted `project_feature` **or** accepted `activity_analysis` evidence (confidence ≥ 0.7) | `IMPLEMENTED` |
| ≥2 distinct accepted project-feature evidences across ≥1 completed project, with corroborating activity evidence | `PROVEN` |

A skill's `level` is the highest level with **accepted** evidence. Raw Claude
Code activity alone can only produce a `suggested` evidence row supporting
`IMPLEMENTED`; nothing auto-promotes. Ambiguous changes (conflicting signals, a
≥2-level jump) create a `promote_skill` approval instead of applying.

---

## 6. Human-in-the-loop

Agents research, analyze, recommend and draft — but important actions require
approval. `approvals` row: agent, `action_type` (`promote_skill |
change_learning_priority | start_project | apply_job | publish_content |
contact_client`), title, reason, context, expected outcome, `status`
(`pending | approved | rejected`), feedback. Central Approval Inbox with
Approve / Reject / Provide Feedback (full UI in Phase 9).

---

## 7. Database design

Postgres via Drizzle. Every application table: `id uuid pk`,
`user_id uuid → auth.users`, `created_at`, RLS policy `user_id = auth.uid()`.
JSON columns for file lists, git metadata and AI structured blobs.

Tables by phase:

- **Phase 2** — `skills`, `skill_evidence`, `approvals`, `agent_runs`, `agent_events`
- **Phase 2.5** — `activity_events`, `activity_analyses`, `ingest_tokens`
- **Phase 3** — `learning_sessions` (+ `learning_session_skills`), `dsa_patterns`
  (seed), `dsa_problems`, `dsa_attempts`, `ai_usage`, `llm_cache`, `agent_model_config`
- **Phase 4** — `projects`, `project_features`, `project_skills`
- **Phase 5** — `career_opportunities`, `career_matches`
- **Phase 6** — `content_items`, `content_sources`
- **Phase 7** — `business_opportunities`
- **Phase 8** — `daily_briefings`

Simplifications vs the original entity list: `career_skill_gaps` is folded into
`career_matches` JSON (`missing_skills`, `suggested_actions`). Infra tables
(`ingest_tokens`, `ai_usage`, `llm_cache`, `agent_model_config`,
`activity_analyses`) are added because the described behavior needs them.

Each phase ships its own Drizzle migration under `drizzle/`.

---

## 8. AI provider abstraction

```ts
interface LLMProvider {
  generate(o: { system?: string; prompt: string; model?: string }):
    Promise<{ text: string; usage: Usage }>;
  generateStructured<T>(o: {
    system?: string; prompt: string; schema: ZodType<T>; model?: string;
  }): Promise<{ data: T; usage: Usage }>;
}
```

`GeminiProvider` (default for most agents), `OpenAIProvider` (complex analysis +
fallback), `MockProvider` (tests). `getProviderForAgent(name)` reads
`agent_model_config`. Every call records an `ai_usage` row. The app is never
coupled to one vendor.

---

## 9. Scheduling

`Scheduler` interface; MVP implementation is **Vercel Cron**. `vercel.json`
crons hit `/api/cron/{morning-briefing,daily-learning,daily-activity}`; each
route verifies `CRON_SECRET`. Every agent is also manually triggerable from the
UI via `/api/agents/[name]/run`. The abstraction lets us move to Supabase Cron /
Inngest / a queue later without touching agent code.

---

## 10. Failure handling

- Agent runs catch errors, set `agent_runs.status = failed`, and write an
  `agent_events` error row. Partial progress is visible via `current_step`.
- Runs are idempotent per `(agent_name, trigger_key, day)` so a retry is safe.
- The collector is offline-first: every event is appended to a local JSONL queue
  before the network call; a failed sync keeps the line for the next attempt.
- `/api/activity/ingest` validates with Zod and rejects unknown tokens; bad
  payloads never reach the database.
- No in-memory agent state — everything important is in Postgres.

---

## 11. Cost control

- Deterministic code first; no LLM call when rules suffice.
- `llm_cache` keyed on `hash(provider + model + prompt + schema)` skips repeat
  analysis of identical inputs.
- All AI results are stored.
- Per-agent model routing via `agent_model_config`.
- `ai_usage` tracks provider, model, token counts, estimated cost, cache hits.
- Claude Code activity is analyzed **once per day in a batch**, never per file
  edit or per event.

---

## 12. Claude Code activity capture architecture

| Spec concept | Claude Code hook | Collector action |
|---|---|---|
| SESSION_START | `SessionStart` | write session state: id, cwd, detected project, git branch/HEAD |
| FILE_ACTIVITY | `PostToolUse` (`Edit\|Write\|MultiEdit`) | append changed path to session state; aggregate locally, no network |
| SESSION_CHECKPOINT | `Stop` | capture `git diff --stat`, `git status --porcelain`, recent commits |
| SESSION_END | `SessionEnd` | consolidate into one `coding_session` record → enqueue → sync |

Only metadata is sent: files changed, project, git branch, commit messages,
`--stat` numbers, timestamps, duration, optional high-level summary. **No source
code, no full diffs, no prompts, no AI responses.**

Project detection: git repo root → `package.json` name → folder name; overridable
via `collector/config/config.json` (`{ "projects": { "<path>": "<projectId>" } }`).

Daily analysis (Vercel Cron): batch the day's `received` events per project →
`LLMProvider.generateStructured` → one `activity_analyses` row → create
`skill_evidence(status = suggested)` + content opportunities → mark events
`analyzed`.

---

## 13. Local collector and cloud sync flow

```
Claude Code hook → create local event → append to data/pending-events.jsonl
   → POST /api/activity/ingest  (Authorization: Bearer <INGEST_TOKEN>)
        ├─ 2xx  → remove the line
        └─ fail → keep the line; next hook invocation drains the queue
```

No Redis / DB / daemon — a plain append-only JSONL file. Auth: a dedicated
ingestion token, stored only in the collector's environment, hashed and checked
server-side against `ingest_tokens` (rotatable / revocable). The Supabase
service-role key is never on the Mac.

---

## 14. Future MCP integration path

Not in the MVP. The `src/lib/tools` registry (`Tool { name, description, schema,
execute }`) is the seam: a future MCP server wraps the **same** registry to
expose tools like `getCurrentSkills()`, `getCurrentProject()`,
`getLearningGoals()`, `recordMilestone()`, `getProjectContext()`. Hooks stay for
passive capture; MCP would add active pull.

---

## 15. Future scaling path

- Scheduling → Supabase Cron / Inngest / dedicated queue (swap `Scheduler` impl).
- Multi-provider LLM routing and richer cost budgets.
- Vector store + retrieval for long-term memory (explicitly out of MVP).
- More content platforms; job-source ingestion.
- If ever multi-user: RLS is already in place; add org/team scoping.
- The modular-monolith boundaries (`modules/*`) are the extract points if any
  part ever needs to become a separate service — not expected for a single user.
