# Knowledge Page — Browsable Knowledge, Queue & Live Extraction Log

**Status: ✅ IMPLEMENTED** (all items complete — `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test` 60/60, `pnpm build` all pass)
**Date:** 2026-09-04
**Scope:** `/knowledge` overview + two new detail routes + shared skeleton loading. No DB migration (read-side only + reuse of the existing `extractor` agent plumbing).

---

## Goal

Turn `/knowledge` from a counts-only page into one where you can browse every stored
knowledge item, see how each was processed (job → run → document → chunks → vectors),
inspect the extraction queue, and watch the extractor's live log — the same run console
every other agent already has.

---

## Delivered

### 1. Data layer — ✅ implemented

**`src/modules/ingestion/queue.ts`**
- ✅ `countJobsByStatus(userId)` → `{ pending, running, failed, done }` (all keys always present).
- ✅ `listJobs(userId, { statuses?, limit=50 })` → newest-first, left-joined to `ingestion_sources`
  for `externalRef`. Derives `title` (`payload.title` → `payload.sourceRef` → `kind`), `preview`
  (first ~240 chars of `payload.text`, whitespace-collapsed), `charCount`, `sourceKind`, `sourceRef`,
  `agentRunId`, timestamps.
- ✅ `getJobDetail(userId, id)` → `listJobs` shape + `fullText`, `dedupeKey`, raw `payload`.
- Shared `summarizeJob()` helper.

**`src/lib/knowledge/documents.ts`**
- ✅ `listKnowledgeDocuments(userId, { limit=100, docType?, sourceKind?, includeSuperseded? })`
  → rows + `chunkCount` per doc.
  **Chunk count fix:** originally a correlated scalar subquery
  `(select count(*) from knowledge_chunks where document_id = knowledge_documents.id)` — this
  silently returned `0` for every row (Drizzle `sql`-template interpolation does not correlate
  a sub-SELECT properly). Rewritten to the idiomatic
  `leftJoin(knowledgeChunks, eq(documentId, id)) + groupBy(knowledgeDocuments.id) + count(knowledgeChunks.id)::int`.
  Verified against the live DB (41 docs / 41 chunks → 1 each).
- ✅ `getKnowledgeDocument(userId, id)` → full row (`body`, `meta`, `contentHash`, …) + its chunks:
  `chunkIndex`, `content`, `tokenCount`, `embeddingModel`, `embedded` (`embedding IS NOT NULL`),
  `dims` (`vector_dims(embedding)`, null-guarded). Raw 768-float vectors are never rendered.
- ✅ `listDocumentsByJob(userId, jobId)` → documents whose `meta ->> 'jobId'` matches (same
  join+groupBy form).

**`src/lib/knowledge/stats.ts`**
- ✅ `KnowledgeStats` gains `byModel: { model: string | null; n: number }[]` — chunk counts grouped
  by `embedding_model`.

**`src/lib/knowledge/index.ts`**
- ✅ Re-exports `listKnowledgeDocuments`, `getKnowledgeDocument`, `listDocumentsByJob` and their types.

**`src/modules/agents/runs.ts`**
- ✅ `"extractor"` added to `ALL_AGENT_NAMES` so the Agent Activity status board also lists it.

### 2. Overview page — ✅ implemented

**`src/app/(app)/knowledge/page.tsx`** — restructured into sections:

- ✅ **Two stat tiles** (was three — the separate "Embedded chunks" tile was merged in):
  - **Knowledge documents** (`stats.documents`) with a sub-line `41 embedded chunks · gemini-embedding-001`.
  - **Queued for extraction** (`countPendingJobs`) with a sub-line `running · failed · done`.
  - Both tiles are anchor links (`#documents` / `#queue`) with hover state.
- ✅ Retained the one-line `byType | bySource` breakdown.
- ✅ **Extraction queue card** (`id="queue"`): `<QueueControls>` + a list of `pending`/`running`/`failed`
  jobs. Each row: status badge, derived title, `kind` badge, char count, 2-line preview, source,
  queued-time, attempts, truncated error. Row → `/knowledge/queue/[id]`.
- ✅ **Knowledge documents card** (`id="documents"`): header
  `Knowledge documents (N) · M embedded chunks`; documents grouped by `docType`
  (concept / decision / learning / repo_summary …). Each row: title, `sourceKind` badge,
  `superseded` badge, `N chunks embedded · <date>`. Row → `/knowledge/documents/[id]`.
- ✅ **Sources card**: unchanged `<KnowledgePanel>` (add repo / sync / upload).
- Local helpers: `groupBy`, `StatLink`, `StatusBadge`.

### 3. Document detail — ✅ implemented (new route)

**`src/app/(app)/knowledge/documents/[id]/page.tsx`**
- ✅ Header: title + `docType` / `sourceKind` / `superseded` badges, `sourceRef`, created/updated.
- ✅ **Body** card — full distilled text.
- ✅ **Provenance** card — `content_hash`; link back to the originating `ingestion_jobs` row
  (`/knowledge/queue/[id]`); the extractor `agent_runs` summary (status, model, in/out tokens,
  ~cost, finishedAt); raw `meta` JSON.
- ✅ **pgvector chunks** table — index, content, token count, and `✓ <dims>-dim` embedded status
  per chunk; caption notes `knowledge_chunks.embedding` holds the raw 768-dim cosine-HNSW vectors.

### 4. Queue item detail — ✅ implemented (new route)

**`src/app/(app)/knowledge/queue/[id]/page.tsx`**
- ✅ Header: title + status / kind badges, source, queued/finished times.
- ✅ **Job** card — kind, status, attempts, char count, dedupe_key, source_ref, full error.
- ✅ **Extract this job** card (hidden once `status === "done"`) —
  `<AgentRunConsole agent="extractor" input={{ jobId }} label="Extract this job">`
  streams that single job's LangGraph steps live.
- ✅ **Produced documents** card — documents with `meta.jobId === job.id`, linking to their detail pages.
- ✅ **Source text** card — the raw `payload.text` (scrollable), noted 24k-char cap at extraction time.

### 5. Live extraction log — ✅ implemented

**`src/components/knowledge/queue-controls.tsx`** (new) — thin wrapper around the shared console:
- ✅ Primary: `<AgentRunConsole agent="extractor" userId initial={getAgentConsole(userId,"extractor")} label="Process queue now">`
  — **one queued job per click**, streaming `classify → extract → validate → reconcile → persist → embed`
  over Supabase realtime (`agent_runs` / `agent_events`), identical UX to every other agent.
- ✅ Secondary: **"Process all (no log)"** button — keeps the bounded `drainNowAction`
  (up to 3 jobs + `drainContextEvents`), no live log.
- ✅ Explanatory caption.

**`src/components/knowledge/knowledge-panel.tsx`**
- ✅ Removed the inline "Process queue" `<section>` and the now-unused `drainNowAction` import
  (moved into `QueueControls`).

`src/app/(app)/knowledge/actions.ts` — unchanged; `drainNowAction` kept as-is.

### 6. Skeleton loading for all pages — ✅ implemented

- ✅ **`src/components/ui/skeleton.tsx`** (new) — `Skeleton` primitive (`animate-pulse rounded-md bg-muted`).
- ✅ **`src/app/(app)/loading.tsx`** (new) — one route-level `loading.js` at the `(app)` route-group
  root. Next 16 wraps every page under `(app)/` in `<Suspense>` with this as the fallback, so any
  navigation or first render shows a skeleton (heading + 3-up stat row + two card blocks) until the
  page's server data resolves. Sidebar/nav stays interactive; `role="status"` + `aria-busy` +
  `sr-only` "Loading…". Covers the dynamic detail routes too — no per-page file needed.
- Not covered by design: server actions / `router.refresh()` (they already show their own pending
  state); `(auth)/login` (static client component, nothing suspends).

---

## Data flow (unchanged, now fully browsable)

```
Sources (GitHub / uploads / Claude transcripts / internal activity)
  → ingestion_jobs                         ── /knowledge  #queue  +  /knowledge/queue/[id]
  → ExtractionAgent  ("extractor", LangGraph, live log via AgentRunConsole)
  → knowledge_documents (structured, Postgres)   ── /knowledge  #documents
  → knowledge_chunks   (pgvector 768-dim cosine) ── /knowledge/documents/[id]  chunks table
  → getPersonalContext() → every in-app agent + MCP server
```

---

## Files

| File | Change |
|---|---|
| `src/lib/knowledge/documents.ts` | + `listKnowledgeDocuments`, `getKnowledgeDocument`, `listDocumentsByJob` (join+groupBy chunk count) |
| `src/lib/knowledge/index.ts` | re-export the new helpers + types |
| `src/lib/knowledge/stats.ts` | + `byModel` chunk breakdown |
| `src/modules/ingestion/queue.ts` | + `listJobs`, `getJobDetail`, `countJobsByStatus` |
| `src/modules/agents/runs.ts` | + `extractor` in `ALL_AGENT_NAMES` |
| `src/app/(app)/knowledge/page.tsx` | restructured: 2 tiles + Queue / Documents / Sources sections |
| `src/app/(app)/knowledge/documents/[id]/page.tsx` | **new** — body + provenance + pgvector chunks |
| `src/app/(app)/knowledge/queue/[id]/page.tsx` | **new** — job detail + per-job extract console |
| `src/components/knowledge/queue-controls.tsx` | **new** — live extractor console + "process all" |
| `src/components/knowledge/knowledge-panel.tsx` | removed inline "Process queue" section |
| `src/components/ui/skeleton.tsx` | **new** — `Skeleton` primitive |
| `src/app/(app)/loading.tsx` | **new** — shared route-level skeleton for all `(app)` pages |

## Verification

- `pnpm tsc --noEmit` — clean
- `pnpm lint` — clean
- `pnpm test` — 60/60
- `pnpm build` — clean; routes `/knowledge`, `/knowledge/documents/[id]`, `/knowledge/queue/[id]` registered
- Live-DB check confirmed the chunk-count fix (subquery form returned all `0`; join+groupBy returns real counts).

## Decisions (locked for MVP)

1. **Chunks** live only inside document detail — no dedicated flat chunks list on the overview
   (fragments out of context aren't actionable). The overview tile + per-row count carry the numbers.
2. **Extractor** added to the Agent Activity status board (one line; it's a real agent).
3. **Queue processing** is strictly one-job-per-click (reuses `AgentRunConsole` with zero new
   streaming code); `drainNowAction` retained as the no-log bulk path.
4. **Skeleton loading** is one shared `(app)/loading.tsx`, not per-page.
