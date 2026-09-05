# Knowledge Spine — High-Level Architecture

**Status:** Approved — ready to build (phases 0–7)
**Date:** 2026-09-05
**Also published as an artifact** (diagrams + visual version): ask Claude to re-open "Knowledge Spine" from this session's artifact list if the link has been lost — this file is the durable, in-repo copy of record.

How every module — Skills, Projects, Learning, Career, Content, Business — connects through one shared knowledge layer.

---

## 1. Overview

Seven domain modules each track a slice of one person's real work. A knowledge layer distills evidence from what actually happened — code, transcripts, uploaded docs, and the app's own state changes — and links each distilled fact back to whichever **skill** or **project feature** it demonstrates. Everything downstream — career matching, content ideas, business scans, learning plans — reads from that link graph instead of guessing from raw text each time.

At a glance: 7 domain modules · 8 agents (incl. Extractor) · 2 decision-tier target types · 4 reference-tier target types · 7 nightly cron jobs · 8 build phases (0–7).

## 2. Domain modules

| Module | Core tables | Structural proof-of-work link | Feeds the knowledge layer |
|---|---|---|---|
| **Skills** | `skills`, `skill_evidence` | Level is derived from *accepted* evidence; manual evidence is accepted on submit, agent-suggested evidence waits for review. | On a level change, via `context_events` |
| **Projects** | `projects`, `project_features`, `project_skills` | `project_skills.role` (*used* / *demonstrated*) is the exact, structural "this feature proves this skill" link — no inference needed. | On create/edit, via `context_events` — features are not yet included in the snapshot (Phase 1 fixes this) |
| **Learning** | `learning_sessions`, `learning_session_skills`, `dsa_*` | `learning_session_skills` links a session directly to skills — also exact, no inference. | On every session logged, via `context_events` (no threshold) |
| **Career** | `career_opportunities`, `career_matches` | No structural link yet — matching is a dedicated agent analysis (score, proven/implemented/partial/missing skills). | Reference tier only — never becomes a document itself |
| **Content** | `content_items`, `content_sources` | No structural skill link exists today — Phase 7 adds one via the same embedding match used for documents. | Reference tier only |
| **Business** | `business_opportunities` | `tech_stack` names skills loosely (by text, not id) — drawn from proven/implemented skills at generation time. | Reference tier only |
| **Activity** | `activity_events`, `activity_analyses` | Coding sessions from the local collector; an agent turns them into skill evidence. | On each analysis, via `context_events` |

## 3. The knowledge layer

Two independent paths feed the same store:

```
EXTERNAL: GitHub/uploads/transcripts → ingestion_jobs → Extraction Agent
             (classify→extract→validate→persist→embed→link)
INTERNAL: Skill/Project/Learning changes → context_events → knowledge-refresh
             (deterministic, no LLM)

  both converge on →  knowledge_documents + knowledge_chunks (pgvector, embedded)
                   →  knowledge-map (embedding kNN + lexical match + shared-source rules)
                   →  knowledge_links, split into two tiers (§4)
                   →  getPersonalContext() → agents
```

External material goes through extraction because it's unstructured; internal state changes go through a cheap, deterministic refresh because they're already structured facts. `knowledge-map` is the only place `knowledge_links` rows get created.

## 4. The two-tier target model

A `knowledge_links` row always points from one document to one target entity. Which tier the target falls in decides whether that link can drive a decision elsewhere in the app, or is purely informational.

**Decision tier — skill, project feature.** The only two target types whose accumulated links produce a **knowledge-depth weight**: link volume/score combined with the skill's level or the feature's status. A "proven" skill with ten linked documents outweighs an "interested" skill with ten — level and evidence both count. This weight is what other modules read when making a decision.

**Reference tier — career opportunity, content item, business opportunity, learning session.** These can still receive links (a document can be mapped to a specific opportunity or content idea), but no ranking or weight is computed for them, and nothing decides based on link count alone.

**Removed, not added — `dsa_pattern` and whole-`project`.** Both were grouping labels duplicating a concrete thing that already exists (a skill's `category`; a project's `project_features`). Every "Sliding Window" document was linking to both the skill *and* the pattern for the same fact. The database enum values stay defined (Postgres can't cheaply drop one) but unused; the existing redundant rows for both are deleted, not just frozen.

## 5. Nightly pipeline

**Bug found and scheduled for Phase 1 fix:** the current schedule runs `knowledge-map` (01:30) *before* `knowledge-refresh` (01:45), so a document created by tonight's refresh doesn't get its first mapping pass until tomorrow night. Corrected order: refresh moves to 01:30, map to 01:45 — refresh also gets an inline `mapDocument()` call so new internal docs are mapped the same run they're created, not just the same night.

| Time | Job | Does | Run history visible? |
|---|---|---|---|
| 01:00 | `github-sync` | Pulls README / arch files / new commits per connected repo | No — Phase 5 adds it |
| 01:15 | `ingest-drain` | Runs the Extraction Agent on queued jobs | Yes — agent run, visible in Activity |
| 01:30 → 01:45 | `knowledge-map` | Re-derives `knowledge_links` for every current document | No — Phase 5 adds it |
| 01:45 → 01:30 | `knowledge-refresh` | Turns queued `context_events` into documents | No — Phase 5 adds it |
| 02:00 | `daily-activity` | Analyses yesterday's coding sessions | Yes — agent run |
| 02:30 | `daily-learning` | Builds the day's learning plan | Yes — agent run |
| 03:00 | `morning-briefing` | Chief-of-staff daily summary | Yes — agent run |

## 6. Cross-module relevance bridge — DECIDED

A career opportunity or business opportunity should surface related content and learning sessions — found by *sharing* matched skills or project features, not by a document linking them directly. Content has no skill-match today; career, business and learning each reach their skill matches through a different, already-existing mechanism.

**Decision: Option A — a new match table, `entity_skill_links`.**

```
entity_skill_links (source_type, source_id, target_type, target_id, score, method)
```

Content, career, and business each get rows here, computed the same embedding-match way documents already do — querying their own title/description text instead of a document body. The bridge itself is then one join: two entities sharing a row here share a skill or feature.

Options considered and rejected:
- **B — Generalize `knowledge_links`** (polymorphic on both ends, so a career opportunity could be a source row directly). Rejected: would have turned "a document's provenance" into something more general — every existing query assuming `document_id` is a document would need a second look.
- **C — Synthetic documents** (auto-generate an internal `knowledge_documents` row per career/content/business item). Rejected: directly contradicts keeping these three out of the knowledge corpus as sources.

## 7. Agents

Every agent besides the Extractor calls `getPersonalContext(purpose)` for its structured facts and retrieved knowledge. `focusEntities` (added for Career) pulls a specific entity's *accepted* links ahead of generic semantic search.

| Agent | Context purpose | Focus entity today | Proof-of-work (Phase 7) |
|---|---|---|---|
| Learning | `learning_plan` | — | Per linked skill, via `learning_session_skills` (exact, no matching needed) |
| Project | `project_ideas` | — | — |
| Career | `career_match` | `career_opportunity` | Per matched skill, via `entity_skill_links` (§6) |
| Content | `content_draft` | — | Per matched skill, via `entity_skill_links` (§6) |
| Business | `business_scan` | — | Per `tech_stack` skill, via `entity_skill_links` (§6) |
| Chief of Staff | `daily_briefing` | — | — |
| Activity Analyzer | — | — | — |
| Extractor | — | — | Writes the links every other agent reads |

## 8. Phase roadmap

All phases approved, ready to build in order. Each ships and verifies independently (`tsc`/`lint`/`test`/`build` + a live-data check), same discipline as the earlier K1–K5 mapping phases.

### Phase 0 — Mapping target model
- Migration: `ALTER TYPE knowledge_target_type ADD VALUE 'project_feature'` (additive, safe).
- `target-types.ts`: remove `dsa_pattern`/`project` from `KNOWLEDGE_TARGET_TYPES`, add `project_feature`.
- `entities.ts`: drop the `project`/`dsa_pattern` cases in `fetchEntities`, add `project_feature` (canonical text = feature title + status + parent project name + description).
- `candidates.ts`: drop the dsa_pattern lexical loop and the GitHub-repo-name→project heuristic (project's gone); add a lexical loop matching feature titles.
- Cleanup script: delete existing `knowledge_links`/`entity_embeddings` rows where `target_type` in `('dsa_pattern','project')`.
- New `getSkillDepth(userId)` / `getProjectFeatureDepth(userId)`: SQL-only, `sum(accepted link score) × level-or-status weight`, grouped by target.
- Re-run the backfill to populate `project_feature` embeddings and re-map existing docs.

### Phase 1 — Cron correctness
- `vercel.json`: swap `knowledge-refresh` to 01:30, `knowledge-map` to 01:45.
- `refresh.ts`: call `mapDocument()` right after `embedDocument()` inside `drainContextEvents`.
- `projects/service.ts`: add the missing `recordContextEvent` calls to `addFeature`, `createProjectFromIdea`, `upsertProjectByName`.
- `specFor`'s `project_updated` case: include the feature list in the snapshot body.

### Phase 2 — Stop paying for LLM calls
- `rationale.ts`: delete the LLM branch entirely — `rationaleFor` always returns the deterministic template. Drop the now-unused `budget`/`runStructured` plumbing from `link.ts` and every caller.
- `link.ts`: fetch a document's existing link keys once, filter candidates against them *before* generating a rationale or attempting an insert.

### Phase 3 — Incremental mapping
- Migration: `knowledge_documents.last_mapped_at`.
- Skip a document in the nightly sweep when it's been mapped since both its own last edit *and* the last entity-corpus change (`max(entity_embeddings.updated_at)`).
- Replace `.limit(200)` with real cursor pagination (reusing the `Page` pattern from K4), bounded by a wall-clock budget instead of a row-count cap.

### Phase 4 — Cross-source duplicate detection
- New `checkCrossSourceDuplicate(userId, documentId)`: compare the doc's vector against other recent (default 14-day) documents from a *different* source for the same user; above threshold, mark it `supersededAt` + `meta.duplicateOf`.
- Hooked in right after embedding, in both the Extraction Agent and `drainContextEvents` — a superseded doc skips mapping entirely.
- Threshold starts conservative (0.90) and gets checked against real data before being trusted, same as K2's recalibration.

### Phase 5 — Visibility
- Migration: `cron_runs` (job, status, summary, error, started_at, finished_at).
- All 7 cron jobs record to it. New pending-`context_events` count. A "System crons" card on `/knowledge`.

### Phase 6 — GitHub sync polish
- `setSourceStatus` (pause/resume), `resetSourceCursor` (resync from scratch) in `sources/index.ts`, wired to buttons in the Sources card.
- A per-sync drill-down using the existing `sourceId` FK already on `ingestion_jobs`.

### Phase 7 — Proof-of-work + cross-module bridge
- Migration: `entity_skill_links` (`source_type, source_id, target_type ∈ {skill, project_feature}, target_id, score, method`), unique on the four key columns.
- Generalize the candidate-generation logic so it can run against a content/career/business item's own text, not just a document body — populates `entity_skill_links` for those three.
- `getProofOfWork(userId, skillIds)` — pure join over `project_skills` (role used/demonstrated).
- Wire into Career, Content, Business (resolve `tech_stack` names → skill ids first), and Learning (already has `learning_session_skills` directly).

---

## Context this document assumes (from the same session)

- K1–K5 (taxonomy, entity embeddings, the linking pipeline, Mappings & Tags UI, server-side search/filter, `getPersonalContext.focusEntities`) are already built and committed — see `.claude/plans/knowledge-page-browsable-implemented.md` for that earlier phase of work.
- Career/Content/Business are deliberately excluded as knowledge *sources* (they never spawn their own `knowledge_documents` row) — only as link *targets*/reference tier. This was an explicit decision, not an oversight; Option C above would have reversed it, which is why it was rejected.
- "Minimize LLM calls" is a standing directive for the mapping pipeline specifically — Phase 2 removes the last LLM call in that pipeline entirely.
