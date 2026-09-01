# MVP Scope — NOW vs FUTURE

## MVP NOW

### Platform
- Next.js 16 (App Router, TypeScript strict), React 19.
- Tailwind CSS v4 + shadcn/ui.
- Supabase: Postgres, Auth (email magic link), Realtime, Storage.
- Drizzle ORM (SQL-first, thin runtime, plain-SQL migrations).
- Zod validation at every external boundary.
- LLM abstraction with Gemini + OpenAI providers, per-agent model routing.
- Vercel Cron for scheduling (behind a `Scheduler` interface).
- Single repo; standalone `collector/` package for the Mac.
- Deployed to Vercel + Supabase.

### Product
- Log learning sessions and DSA practice (manual entry).
- DSA module focused on **pattern recognition** (not random LeetCode picks).
- AI analysis of DSA pattern weaknesses.
- Shared skill graph: `INTERESTED → LEARNING → PRACTICED → IMPLEMENTED → PROVEN`
  with deterministic progression rules and an evidence trail.
- Projects with features mapped to skills.
- Automatic capture of meaningful Claude Code development activity from the Mac
  (session metadata, files changed, git info — no source, no diffs).
- Offline-safe local JSONL queue with retry.
- Daily batch analysis turning activity into **suggested** skill evidence.
- Career Agent: analyze a manually entered job vs real proof of skills; honest
  YES / MAYBE / NO with gaps.
- Content Agent: LinkedIn drafts from real events (drafts only).
- Business Agent: realistic small solo-buildable opportunities from real skills.
- Chief of Staff: daily prioritized briefing that connects the agents.
- Approval Inbox: approve / reject / feedback for important actions.
- Agent Activity: status board + run timeline + recent dev activity.
- Runs as a single-user app at minimal infra cost.

---

## FUTURE (explicitly NOT in the MVP)

### Infrastructure / architecture
- Microservices, Kubernetes, Docker orchestration.
- Redis, RabbitMQ, Kafka, BullMQ, or any external queue/broker.
- Vector database, RAG pipeline, long-term autonomous memory.
- Complex distributed tracing / workflow engine.
- Multi-device sync; multi-user collaboration; mobile app.

### Agents / AI
- Complex autonomous multi-agent conversations.
- Automatic skill promotion (evidence + approval always gate it).
- Automatic project-completion detection.
- Per-file-edit AI analysis (batched daily instead).
- MCP implementation (tool layer is designed for it; not built).

### Integrations
- Job scraping / browser automation / automatic job applications.
- Social media publishing (LinkedIn or otherwise); Instagram / YouTube / Twitter.
- GitHub integration.
- Payment system; business-client outreach automation / lead scraping.
- Complex notification system.

### Claude Code capture
- Full Claude conversation sync; prompt history; AI-response history.
- Source-code upload; full git-diff upload.
- Continuous filesystem-monitoring daemon; real-time keystroke tracking.
- Any always-on background service.

---

## Build phases

| Phase | Delivers |
|---|---|
| 0 | System design + MVP scope (this doc + `system-design.md`) |
| 1 | Scaffold, Supabase wiring, magic-link auth, app shell + 8 stub pages, deploy to Vercel |
| 2 | Shared skill graph + evidence engine + Skills UI |
| 2.5 | Claude Code activity capture: ingest API, collector, hooks, offline queue, daily analysis |
| 3 | Learning + DSA Agent, LLM providers, first cron |
| 4 | Project Agent |
| 5 | Career Agent |
| 6 | Content Agent |
| 7 | Business Opportunity Agent |
| 8 | Chief of Staff + Daily Briefing |
| 9 | Full Approval Inbox + Realtime agent status + assembled Dashboard |

Each phase ends with a summary (what shipped, decisions, limitations, tests) and
waits for explicit approval before the next.
