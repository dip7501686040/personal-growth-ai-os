# Skill-Graph Manager + Single-Pipeline Knowledge

Plan of record for the work requested 2026-09-08. Companion to
`job-application-automation.md`. Built **one phase at a time** — after each
phase: stop, summarize, wait for "apply Phase N".

## Goal

Make `/sync-repo` the **only** extraction pipeline; give the owner full manual
control of the skill graph (skip / merge / group / relabel); and have
`apply-morning` search + rank jobs against the true, owner-validated graph and
knowledge base — while folder prep (already `get_proof_for_jd`) inherits the
same filtering for free.

## Decisions (from Q&A 2026-09-08)

1. **Retire everything extraction-related except `/sync-repo`.** Kill the Claude
   activity agent, transcript ingestion, and the nightly `github-sync` cron.
   `/sync-repo` is extended to also (idempotently) build the knowledge base.
2. **No hard delete of skills.** Removal happens only by **merge**: source
   skill's evidence/links re-point to the target, then the source row is
   deleted. A reversible **skip** switch hides an item from all AI/job/proof/
   public use without deleting it.
3. **Skill model gains:** a `label` (freely editable display name) separate
   from the read-only internal `name`/`slug`; a **one-level** parent/child
   grouping; `excluded_at`.
4. **Skills page gets an Edit-layout mode:** drag a skill onto another to merge;
   drag into a skill's child zone to nest; inline label editing; expand/collapse
   to see children + everything linked to a skill. A non-drag "Merge into… /
   Set parent…" fallback always works.
5. **Knowledge re-syncs on graph edits** — accept-evidence, merge, re-parent,
   relabel, feature edit, skip toggle, and every `/sync-repo` run.
6. **Job search = manual config ∪ knowledge-graph signal.** `job-search.json`
   stays hand-maintained; a graph/KB layer adds search terms and an embedding
   `skillMatch` alongside the substring one.

---

## Current architecture (what the phases touch)

- **Two repo pipelines today:** (a) `/sync-repo` skill → `pnpm sync-repo` →
  `applySyncProposal` writes `projects` + `project_features` + `project_skills`
  + **suggested** `skill_evidence` directly. (b) `github-sync` cron →
  `syncSources("github_repo")` → `ingestion_jobs` → Extraction Agent (LangGraph,
  LLM) → `knowledge_documents` + chunks + embeddings → `mapDocument` links them
  to entities. Phase 1–2 collapse (b) into (a).
- **How the graph feeds AI:** every agent calls `getPersonalContext(purpose)` →
  `buildCoreSlice` (`context/structured.ts`) reads `skills`, evidence, learning;
  `PURPOSES` config retrieves knowledge chunks. `career_match` purpose is the
  job one.
- **Deterministic JD match:** `matchSkillsAndFeatures` (`mapping/entity-
  candidates.ts`) — embedding kNN over `entity_embeddings` + literal name match
  over `skills.name` / `project_features.title` → `getProofForJd` → MCP
  `get_proof_for_jd` → `apply-prep.ts`.
- **Skills page:** `/skills` (grouped by 8 `skill_category` values, flat within);
  `/skills/[slug]` detail (level derivation, evidence timeline, change-level).
  `listSkills` also backs MCP `list_skills`.
- **Polymorphic skill references with NO FK** (must be handled in app code on
  merge): `knowledge_links` (targetType `skill`), `entity_skill_links`
  (targetType `skill`), `entity_embeddings` (targetType `skill`),
  `approvals.context->>'skillId'`. FK-cascaded already: `skill_evidence`,
  `project_skills`, `learning_session_skills` (composite PK — dedupe on repoint).

---

## Phase 1 — Retire activity + transcript + github-sync extraction

**STATUS: applied 2026-09-08.** typecheck + lint + 63 tests + `next build` all
green. Deviations from the scope below: (a) `/activity` page was *not* deleted —
it's dual-purpose; the Claude-Code cards (coding sessions, daily analysis,
collector token setup) were stripped, the Phase 9 agent status board + run
timeline kept, nav entry kept. (b) `knowledge-refresh` / `knowledge-map` cron
*handlers* were kept (unscheduled, manual curl stop-gap) — only their
`vercel.json` schedule entries were removed — since Phase 6 hasn't built
`resyncKnowledge()` yet. (c) Orphaned components (`token-manager`,
`sessions-list`, `analyses-list`) and `activity/actions.ts` were deleted;
`/knowledge` "System crons" panel trimmed to the 2 remaining jobs.

**Scope**
- `vercel.json`: remove `daily-activity`, `github-sync`, `ingest-drain`,
  **`knowledge-refresh`, and `knowledge-map`** crons. Only `daily-learning` and
  `morning-briefing` remain. Nothing re-reads repos or reconciles the knowledge
  base on a schedule anymore — Phase 6's `resyncKnowledge()` (inline, at every
  mutation) plus `pnpm knowledge:resync --all` are the whole mechanism.
- Delete routes `/api/ingest/transcripts` and `/api/activity/ingest` (or return
  410). Remove `/app/(app)/activity` page + its `src/lib/nav.ts` entry +
  dashboard widgets that read it.
- `modules/agents/index.ts`: drop `activity_analyzer` from `AGENTS`. Keep
  `extractor` (manual uploads only) but off-cron. Leave the agent files in tree,
  marked deprecated.
- `collector/`: README note — transcript/activity sync is retired; the package
  stays (zero-dep, harmless) but is no longer wired.
- `context/structured.ts` `fetchActivityEvidence`: repoint from
  `activity_analysis` → accepted `github_repo` + `project_feature` evidence
  (last 30d). Rename context section to "Evidence from synced repositories".
- `modules/skills/progression.ts`: wherever `activity_analysis` evidence gates
  IMPLEMENTED / PROVEN, accept `github_repo` evidence equivalently. Update the
  rationale strings. Update `test/progression.test.ts`.
- `career-agent.ts` (~L189): momentum filter includes `github_repo`.
- Tables `activity_events`, `activity_analyses`, `ingest_tokens`: **not
  dropped** (Postgres enum/table drops are costly; memory notes this). Add
  `-- deprecated (Phase 1, skill-graph-manager)` comments.
- Update `AGENTS.md` + memory.

**Migration:** none functional (optional comment-only).
**Risk:** PROVEN marginally harder to reach — mitigated by `github_repo`
evidence now counting. Verify `test/progression.test.ts` green.

---

## Phase 2 — `/sync-repo` also builds the knowledge base

**STATUS: applied 2026-09-08.** typecheck + lint + 63 tests + `next build` green,
plus a live end-to-end smoke test against the DB (create → embed → 23 links →
idempotent re-run → supersede-on-drop → cleaned up). Notes: (a) `sourceKind` is
`"github_repo"` (not a new kind); repo anchor = `repoUrl` (or `sync-repo:<slug>`
with no repoUrl), `sourceRef = "<anchor>#<slug>"`, `meta.via = "sync-repo"`.
(b) `SyncProposal.knowledge` is opt-in: omit the key → knowledge untouched;
`[]` → clears this repo's docs. (c) embed/link is per-doc best-effort — a failed
doc keeps its row (counted `embedErrors`) for a later resync.

**Scope**
- Extend `SyncProposal` (`modules/projects/sync.ts`) with optional
  `knowledge: { docType, title, body, sourceRef, meta? }[]` — distilled facts
  only (repo summary; 3–8 decisions/concepts; one per major feature). Never raw
  files.
- `applySyncProposal`: for each, reuse `@/lib/knowledge` —
  `checkCrossSourceDuplicate` → `upsertDocumentRow` (content-hash idempotent;
  supersede + replace chunks on change) → `embedDocument` → `mapDocument` to
  link to skills/features. `sourceKind:"github_repo"`,
  `sourceRef:"<repoUrl>#<path>"`.
- Stale: docs previously synced from this repo and absent this run →
  `supersededAt = now()`.
- `pnpm sync-repo --state <slug>`: also return synced knowledge `sourceRef`s for
  incremental runs.
- `scripts/sync-repo.ts` report: docs upserted / superseded / linked.
- `.claude/skills/sync-repo/SKILL.md`: new "4b. Knowledge" section — what to
  emit and the distillation bar.

**Migration:** none (schema already supports it).
**Risk:** embedding provider availability (Gemini free tier / local
Transformers.js) — `mapDocument` already degrades to lexical-only. Cross-source
dedupe false positives — already handled in `lib/knowledge/dedupe.ts`.

---

## Phase 3 — "Skip" switch (exclusion) across every read path

**STATUS: applied 2026-09-08.** Migration `0021` applied; typecheck + lint + 63
tests + `next build` green; two live DB smoke tests (skill exclude → dropped
from `getProofForJd` + `entity_embeddings` purged + `listSkills` default omits;
project exclude → its features stop contributing proof; both restored clean).
Notes: (a) `excluded_at timestamptz` on all 3 tables + partial `…_user_active_idx`.
(b) `matchSkillsAndFeatures` filters via a final `dropExcluded()` pass so stale
kNN hits can't leak. (c) `listSkills` / `listProjects` gained
`{ includeExcluded }` (default false); only `/skills` + `/projects` pages pass
true — dashboard, career-agent, `getProjectSnapshot`, `resolveSkillIdsByName`
use the default. (d) exclude also purges `entity_embeddings` + suggested
`knowledge_links` (+ `entity_skill_links` for a skill); un-skip relies on the
next backfill / `/sync-repo`. (e) `Switch` (Base UI) + `ExcludeToggle` shared
component; wired into `/skills` rows, `/projects` cards, `/projects/[slug]`
header + `FeatureManager` rows. (f) invariant documented in
`docs/system-design.md` §"Exclusion invariant".

**Scope**
- **Migration:** `excluded_at timestamptz` on `skills`, `projects`,
  `project_features`. Partial indexes `where excluded_at is null` on the hot
  reads.
- Filter `excluded_at IS NULL` (features also require `project.excluded_at IS
  NULL`) in:
  - `matchSkillsAndFeatures` — name-match loops **and** the `embeddingCandidates`
    join.
  - `getProofForJd`, `getProofOfWork`.
  - `context/structured.ts` — every fetcher.
  - `modules/skills/service.ts` `listSkills` — add `includeExcluded` (default
    false); `/skills` page passes `true`.
  - MCP `list_skills`.
  - `/api/public/features`, `/api/public/content`.
  - `jd-proof.ts` `entity_skill_links` reads (related content / learning).
  - Knowledge mapping entity candidates + `backfillEntityEmbeddings` — excluded
    entities are neither embedded nor linked.
- **UI:** shadcn/Base `Switch` on each row in `/skills`, `/projects`,
  `/projects/[slug]` features. Server actions `setSkillExcluded`,
  `setProjectExcluded`, `setFeatureExcluded` → set/clear `excluded_at`,
  `revalidatePath`, `recordContextEvent`.
- **Invariant** in `AGENTS.md`: any read feeding AI / job search / proof /
  public output filters `excluded_at IS NULL`; only management UIs pass
  `includeExcluded`.
- **Tests:** matcher, proof, and context each drop an excluded skill.

**Risk:** missing an enforcement site — the invariant doc + a grep checklist in
the phase summary mitigate.

---

## Phase 4 — Skill model: label/value split, one-level parent/child, merge

**STATUS: applied 2026-09-08.** Migration `0022` applied; typecheck + lint + 63
tests + `next build` green; live DB smoke test (label edit leaves name/slug +
matching untouched; both one-level guards reject; merge re-points evidence,
re-parents children, cancels approvals, deletes sources — verified & cleaned
up). Notes: (a) `skills.label` is **nullable** (no data backfill) — everything
reads `label ?? name`; (b) `mergeSkills` runs in a single `db.transaction`
with raw-SQL dedupe-then-repoint for the three unique-keyed tables
(`learning_session_skills` PK, `knowledge_links`, `entity_skill_links`);
(c) merged sources' children land under `target.parentId ?? target.id` to stay
one level; (d) `listSkills` gained `childCount`; still returns a **flat** list
(Phase 5 does the nested tree UI); (e) matchers + `resolveSkillIdsByName` +
context + MCP `list_skills` + `getProofForJd` now use `label` OR `name`.
Server actions added: `updateSkillLabelAction`, `setSkillParentAction`,
`createChildSkillAction`, `mergePreviewAction`, `mergeSkillsAction` (Phase 5
wires the drag-drop UI to these).

**Scope**
- **Migration:** `skills.label text` (backfill `= name`); `skills.parent_id uuid
  references skills(id) on delete set null`. App-level rule: a skill with
  `parent_id` set cannot be another skill's parent (one level).
- **Services (`modules/skills/service.ts`):**
  - `updateSkillLabel(userId, skillId, label)` — label only; never touches
    `name`/`slug`.
  - `setSkillParent(userId, skillId, parentId|null)` — validates one level;
    moving a parent moves nothing else (its ex-children stay top-level unless
    also moved).
  - `createChildSkill(userId, parentId, { label, category, name? })`.
  - `getMergePreview(userId, targetId, sourceIds[])` → counts of evidence,
    project-skill links, learning links, knowledge links, entity-skill links,
    child skills, pending approvals that will move.
  - `mergeSkills(userId, targetId, sourceIds[])` — one transaction:
    1. repoint `skill_evidence.skill_id`, `project_skills.skill_id`,
       `learning_session_skills.skill_id` → target (skip rows that would
       collide on a unique/PK — delete the duplicate source row instead).
    2. repoint `knowledge_links` + `entity_skill_links` where
       `target_type='skill' and target_id in (sources)` → target (dedupe on the
       unique key).
    3. delete `entity_embeddings` source rows (target re-embeds in Phase 6 —
       its text changed).
    4. re-parent any child whose `parent_id in (sources)` → target.
    5. repoint or cancel pending `promote_skill` approvals referencing a source.
    6. delete the source `skills` rows.
    7. `recomputeSkill(target)`; `recordContextEvent({ kind:'skill_changed',
       refId: target })`.
- **Matching:** `matchSkillsAndFeatures` + `getProofForJd` match a JD against
  `label` **or** `name` (plus child labels). Children are independent skills for
  scoring; the parent is UI grouping + optional roll-up display only.
- `listSkills`: return `label`, `value` (read-only `name`), `parentId`, and
  nest children; top level = `parent_id IS NULL`. `structured.ts` displays
  `label`.
- **Tests:** merge re-links every reference type and deletes sources;
  one-level constraint holds; a label edit changes neither `slug` nor
  name-based matching.

**Risk:** merge-time unique-constraint collisions on `learning_session_skills`
(composite PK) and `knowledge_links`/`entity_skill_links` unique keys — the
"dedupe on repoint" step handles each explicitly.

---

## Phase 5 — Skills page: edit mode, drag-merge, child groups, label editing

**STATUS: applied 2026-09-08.** typecheck + strict lint (react-hooks/refs,
react-compiler) + 63 tests + `next build` (23 routes) green; `/skills` route
runtime-smoked (auth-gated 307, no 500). Underlying actions were end-to-end
verified in Phase 4. Notes: (a) dep added: `@dnd-kit/core` only (transform
inlined, no `@dnd-kit/utilities`); (b) `/skills` page is now a thin server
component that builds the one-level tree + renders `<SkillManager>` (client);
(c) `MergeDialog` extracted to its own file, remounted per-intent via `key` so
no reset-in-effect; (d) `SkillManager` has an "Edit layout" toggle — off =
browse + expand/collapse + skip switches; on = drag grip (drag row → row =
merge w/ preview dialog; drag row → child drop-zone = nest), inline label
editor, per-row "Merge into…" / "Nest under…" / "Unnest" selects (the no-drag
fallback), and "Add child" inline form; (e) `/skills/[slug]` gained an
"Organize" card (`<SkillOrganize>`: label field, parent select, "Merge into…").
Interactive drag/dialog behaviour not headless-tested (auth wall) — relies on
lint + build + the Phase 4 action smoke.

**Scope**
- Add dep `@dnd-kit/core` + `@dnd-kit/sortable` (bundler dep — not a CDN
  concern; this is the Next app).
- `/skills` redesign (client components, Base UI):
  - Header: existing **Add skill**; new **Edit layout** toggle.
  - Category sections; each **top-level** skill row: inline-editable `label`
    (edit mode), muted read-only internal `value`, `LevelBadge`, **skip**
    switch, expand chevron.
  - Expand → child list (collapsible) + **Add child** + a drop zone.
  - Edit mode: drag row → drop on another row = **merge** (confirm dialog shows
    `getMergePreview` counts). Drop on a row's child zone = `setSkillParent`.
  - Add-skill flow gains "then merge existing into it": create → multi-select
    sources → `mergeSkills`.
  - Non-edit mode: browse + expand/collapse + skip switches only.
  - **Fallbacks (no drag needed):** per-row "Merge into…" select and "Set
    parent…" select — feature works without DnD.
- `/skills/[slug]`: label field, parent selector, "Merge into…" action,
  read-only internal value.
- Server actions → Phase 4 services; `revalidatePath` + optimistic UI.

**Risk:** DnD UX / a11y — the select fallbacks are the guarantee; DnD is
enhancement.

---

## Phase 6 — Inline knowledge re-sync on graph edits

**STATUS: applied 2026-09-08.** Migration `0023` applied; typecheck + lint + 63
tests + `next build` green; live smoke: `pnpm knowledge:resync --all` drained
the whole Phase 1–5 backlog (~130 context_events → 66 internal docs, all 37→73
docs re-mapped), steady-state `pnpm knowledge:resync` is a ~0-event no-op in
~3s, and an idempotent `pnpm sync-repo` now ends with a clean `resyncKnowledge`.
Notes:
- `src/modules/knowledge/resync.ts` — `resyncKnowledge({full?})`,
  `bestEffortResync` (swallows, awaited), `resyncEntity`,
  `purgePolymorphicRefs`, `remapStaleDocuments`.
- **Inline path is bounded**: drains ≤15 outbox rows, backfills only
  `DECISION_TARGET_TYPES` embeddings, 6s remap deadline, and **skips the remap
  entirely** when the drain produced no doc and no entity vector moved. `--all`
  drains ≤200, re-embeds every type, 120s deadline, always full sweep.
- **6c done**: `career_opportunity` + `business_opportunity` removed from
  `KNOWLEDGE_TARGET_TYPES` / `fetchEntities` / `RELATION_BY_TYPE` / the doc
  filter chips; `linkEntityToSkills` / `linkOpportunity` / `getRelatedEntities`
  calls stripped from career+business agents and their detail pages (`related`
  is now `{content:[],learning:[]}`); `EntitySkillSourceType` narrowed to
  `"content_item"`. Migration `0023` purged their `entity_embeddings` /
  `entity_skill_links` / `knowledge_links` rows. `content_item` enters the
  graph only on `markPublishedAction` (via `resyncEntity`); drafts don't; a
  now-unpublished / deleted content item is `purgePolymorphicRefs`'d;
  `get_proof_for_jd` related-content query filters `status='published'`.
- **Wired** `bestEffortResync` into every mutating action in
  `skills/actions.ts`, `projects/actions.ts`, `learning/actions.ts`
  (logSession); `applySyncProposal` ends with `resyncKnowledge`;
  `content/actions.ts` publish/edit/delete → `resyncEntity` /
  `purgePolymorphicRefs`; `knowledge/actions.ts` `uploadAction` kicks a bounded
  extractor drain, `drainNowAction` → full `resyncKnowledge`,
  `updateDocumentAction` → `relinkDocument`.
- `pnpm knowledge:resync [--all]` + the renamed "Re-sync knowledge" button.
- `specFor`'s `activity_analyzed` branch removed.

**No nightly backstop.** `knowledge-refresh`, `knowledge-map`, and `ingest-drain`
crons are all removed in Phase 1. `resyncKnowledge()` is the *only* mechanism —
so it must be comprehensive and durable. The `context_events` outbox stays as
the durable queue: a mutation appends a row (as today), then drains it
synchronously; a failed drain leaves `processed_at = NULL`, so the next mutation
or a manual re-sync picks it up. Nothing is lost, just possibly late.

**`resyncKnowledge(userId, opts)`** — `opts` = `{ eventIds? }` (scoped, the
common path), `{ skillIds?, featureIds?, learningIds?, entityRefs? }`, or
`{ all: true }` (the catch-up). It folds together everything the two retired
crons did:
1. **Drain the outbox** — refactor `drainContextEvents` / `specFor` into
   `refreshInternalDoc(userId, kind, refId)`: rebuild the `internal`
   knowledge_document for the changed skill / project / learning session
   (`upsertDocumentRow` → `embedDocument` → `checkCrossSourceDuplicate` →
   `mapDocument`), content-hash idempotent.
2. **Re-embed entities** — scoped `backfillEntityEmbeddings` (or `embedEntity`)
   for the changed `skill` / `project_feature` / `content_item` /
   `career_opportunity` / `business_opportunity` / `learning_session` targets.
3. **Re-map affected documents** — `relinkDocument` for every doc currently
   linked to a changed entity; for a new/renamed/merged entity also run a
   bounded kNN "find candidate docs" pass so brand-new matches surface. Accepted/
   rejected links are never touched (human decisions).
4. **Re-link reverse edges** — `linkEntityToSkills` for any career/content/
   business item whose text changed, and (on skill merge/relabel) for items
   whose `entity_skill_links` pointed at the affected skill.
5. **Purge on delete** — remove orphaned `entity_embeddings`, `entity_skill_links`,
   and suggested `knowledge_links` rows for a deleted polymorphic target
   (skill-merge already repoints these; this covers content/career/business
   deletes, which today leak these rows).

**Call sites** (every mutation that the nightly sweeps used to reconcile):

| Module / file | Trigger | Currently | Add |
|---|---|---|---|
| `skills/service.ts` `recomputeSkill` | level change | `recordContextEvent` only | drain that event |
| `skills/service.ts` `addEvidence` (accepted) | manual evidence | recompute only | `resync({skillIds})` |
| `skills/service.ts` `setEvidenceStatus` | accept / reject suggested | recompute only | `resync({skillIds})` |
| `skills/service.ts` `acceptAllSuggestedEvidence` | post-sync "Accept all" | recompute loop | `resync({skillIds: affected})` |
| `skills/service.ts` `createSkill` / `upsertSkillByName` | new skill (UI, extractor, sync) | nothing | `resync({skillIds})` |
| `skills/service.ts` **Phase 4** `mergeSkills` / `setSkillParent` / `updateSkillLabel` / `createChildSkill` | graph edit | — | `resync({skillIds})` + delete-purge for merge |
| `projects/service.ts` create/update project, create/update feature, `setFeatureStatus`, delete feature, `linkSkill` (L135–300) | project/feature write | `recordContextEvent` only | drain + `resync({featureIds\|projectId})` |
| `projects/sync.ts` `applySyncProposal` (L367) | every `/sync-repo` | `recordContextEvent` only | `resync` for all touched skills+features + the Phase 2 knowledge docs |
| `learning/service.ts` log session (L81) + attach skills | learning write | `recordContextEvent` only | drain + `resync({learningIds, skillIds})` |
| `content/actions.ts` `markPublishedAction` | content **publish** (has `publishedUrls`) | **nothing** (relied on nightly) | `resyncEntity(content_item, id)` — the only time content enters the graph |
| `content/actions.ts` `deleteContentAction`, unpublish | content leaves published state | **nothing** | `purgePolymorphicRefs(content_item, id)` |
| `content/actions.ts` `createIdeaAction`, `updateContentAction` (draft) | draft add / edit | nothing | **stays nothing** — drafts are derivative, never embedded/linked |
| `career-agent.ts` / `business-agent.ts` `linkEntityToSkills(...)` calls | agent create/analyze | writes `entity_skill_links` for the opp | **remove the call** — outputs don't re-enter the graph |
| `career/actions.ts`, `business/actions.ts` delete | opp delete | nothing | `purgePolymorphicRefs` once (cleanup); nothing to maintain after |
| `content-agent.ts` `linkEntityToSkills(...)` | agent drafts content | links the draft | gate to run only once the item is `published` |
| **Phase 3** skip toggles (skill/project/feature) | exclude / re-include | — | `resync` (excluded ⇒ drop embeddings+links; re-included ⇒ rebuild) |
| `knowledge/actions.ts` `uploadAction` (paste / LinkedIn Shares.csv / doc) | manual knowledge add | enqueue only; sat until a cron | kick a **bounded** extractor drain immediately, then `resync` the new docs |
| `knowledge/actions.ts` `drainNowAction` | manual button | `drainContextEvents` + extractor | becomes "Re-sync knowledge" → `resync({all})` |
| `knowledge/actions.ts` `updateDocumentAction` / `deleteDocumentAction` | doc body edit / delete | `relinkDocument` on edit? verify | `relinkDocument` + re-embed on edit; purge links on delete |

### 6c. Scope — outputs never re-enter the knowledge graph

`career_opportunity` and `business_opportunity` are **terminal outputs**: an
agent produces them by reasoning over skills + features + knowledge + published
content. Embedding/linking them back creates a self-referential loop
(`getRelatedKnowledge` feeds an opp its own linked knowledge on the next run) —
no new ground truth, retrieval diluted with derivative text.

- Drop `career_opportunity` / `business_opportunity` from
  `KNOWLEDGE_TARGET_TYPES` and `fetchEntities` (app-level only; the Postgres
  enum values stay, same precedent as the dead `project` / `dsa_pattern`
  values). Remove the `linkEntityToSkills` calls from `career-agent.ts` /
  `business-agent.ts`.
- **One-time migration:** `DELETE FROM entity_embeddings`, `entity_skill_links`,
  `knowledge_links` where the type is `career_opportunity` or
  `business_opportunity`.
- They remain **pure consumers** — still retrieve context to be generated, never
  feed back in.

`content_item` is the exception: a **published** post/article is a real external
artifact (URL, provable — same tier as a repo) and legitimate proof. A **draft**
is derivative. So content enters the graph **only at `status='published'`**:
- `resyncEntity(content_item, id)` fires from `markPublishedAction`, not
  `createIdea` / draft edits.
- `content-agent.ts`'s `linkEntityToSkills` call is gated to published items.
- `get_proof_for_jd`'s related-content query gains `status = 'published'`
  (today it doesn't filter — drafts leak into proof bundles).
- Unpublish / delete → `purgePolymorphicRefs`.

`learning_session` stays in the graph — it's an input.

### 6d. Polymorphic-ref helpers

- `resyncEntity(userId, targetType, id)` — `embedEntity` (current text) +
  `linkEntityToSkills` (wholesale replace). Used for published `content_item`
  and reused by `resyncKnowledge` for `skill` / `project_feature`.
- `purgePolymorphicRefs(userId, type, id)` — `DELETE` from `entity_embeddings`,
  `entity_skill_links`, and suggested `knowledge_links` for `(type, id)`, called
  **before** the row delete in `deleteContentItem` / `deleteOpportunity` (×2)
  and by `resyncKnowledge` step 5 (skill-merge). Fixes a pre-existing leak —
  those deletes are bare `DELETE FROM <table>` today and orphan every
  polymorphic row.

### 6e. External writing → knowledge (LinkedIn posts, articles)

The path stays: `/knowledge` upload → category `linkedin_shares` (LinkedIn's
`Shares.csv`, columns `Date` / `ShareCommentary`) or `doc` (paste) →
`ingestUpload` → `ingestion_jobs` (`evidenceSourceType:"linkedin"`) → Extraction
Agent distils → `knowledge_documents` + **suggested** `skill_evidence(linkedin)`
+ inline `mapDocument`. The Extraction Agent is **kept** (off-cron, run by the
"Re-sync knowledge" button and `uploadAction`'s immediate bounded drain), not
retired. Accepting the suggested `linkedin` evidence on `/skills` then triggers
`resyncKnowledge` for those skills. Net: manual add is fully covered — embed +
skill-map + feature-map + doc build all happen inline — it just needs the button
click (or the auto-drain on upload) instead of an overnight sweep.

- **Manual catch-up:** `pnpm knowledge:resync [--all]` (drains stuck outbox rows,
  full re-embed, re-map all docs) + the `/knowledge` button.
- Remove the `activity_analyzed` branch from `specFor` (dead after Phase 1).
- Make every `resync` call **best-effort** (same contract as `recordContextEvent`
  — a resync failure never breaks the originating write; the outbox row remains
  undrained for the next pass).

**Risk:** edit-path latency — a skill edit now does embed + re-map inline. Keep
step 3 bounded (linked docs + a small kNN, not "all docs"); `{all:true}` is the
only unbounded path and it's manual. If latency bites, move the drain to a
`waitUntil`/`after()` post-response hook, keeping the outbox as the guarantee.

---

## Phase 7 — Job search uses the knowledge base too

**STATUS: applied 2026-09-08.** typecheck + lint + 63 tests + `next build` green;
**live smoke** — `pnpm jobs` (310 fetched → 283 deduped) graph-scored 62 of the
top jobs, 59 rose on `max(substring, graph)` (e.g. Astoria AI "Founding AI
Engineer" 0.61→0.97 on LangChain/RAG/multi-agent matches the keyword list
missed; Product Genius 0.39→0.72 on pgvector/OpenAI-API). `search-provenance.md`
generated correctly. Notes:
- `resume/job-search.json` stays 100% manual; added `useGraphMatch` (default
  true) + `graphMatchLimit` (50).
- New `src/modules/jobs/graph.ts` — `deriveGraphSearchTerms(userId)` (implemented/
  proven non-excluded skill labels first, then top-4 knowledge-taxonomy tags,
  ≤8) and `makeGraphMatcher(userId)` (per-JD `matchSkillsAndFeatures`, names
  cached; `score = min(1, Σ skill scores / 3)`).
- `runJobSearch(cfg, opts)` gained `extraTerms` (ride alongside `titles` in the
  4 term-driven sources, bounded) + `graphMatch` (top `graphMatchLimit` jobs by
  substring score get `applyGraphMatch` → `skillMatch = max(substring, graph)`,
  score recomputed, group unchanged since it's flag-based). `ScoredJob` now
  carries `substringSkillMatch` / `graphMatch` / `graphSkills` / `graphFeatures`;
  `JobSearchResult` carries `graphTerms` / `graphMatched`.
- `scripts/jobs.ts` builds the matcher from `getOwnerUserId()`, `--no-graph`
  disables, output shows a `graph:` line + per-row `skill`/`graph` scores.
- `scripts/apply-prep.ts` writes **`search-provenance.md`** per folder (manual
  layer: titles + which keywords hit + filters; graph layer: matched skills/
  features w/ scores, graph vs substring; sources; score math) and the new
  fields flow through `job.json`.
- `apply-morning` SKILL.md updated (§1 + folder contents).

**Scope**
- `resume/job-search.json` stays fully manual.
- `src/lib/jobs/`:
  - `deriveGraphSearchTerms(userId)` — extra query terms from canonical,
    non-excluded skills at level ≥ `implemented` + top knowledge taxonomy
    labels; unioned (bounded) with `cfg.titles` for the keyed sources.
  - `score.ts`: `skillMatch = max(substringMatch, graphMatch)` where
    `graphMatch` = normalized sum of `matchSkillsAndFeatures(jdText)` skill
    scores (cap 1). New `cfg.useGraphMatch` (default `true`); cache the JD
    embedding per job.
  - `pnpm jobs` output notes the graph's contribution.
- **Per-job `search-provenance.md`** written into every application folder by
  `apply-prep.ts`:
  - **Manual layer** (`resume/job-search.json`): which `titles` matched, which
    `skills` substrings hit this JD, and the `minLpa` / `remoteOnly` /
    `adzunaCountries` filters applied.
  - **App / knowledge-graph layer**: which `deriveGraphSearchTerms()` terms were
    used to query sources; which canonical skills + project features
    `matchSkillsAndFeatures(jd)` matched, with scores; `graphMatch` vs the
    substring `skillMatch`; which sources returned this posting.
  - **Final score** breakdown: `replyLikelihood × (0.4 + 0.6·skillMatch)` and the
    scorer flags.
  Also surfaced in `pnpm jobs --json` per row so the pick step can show it.
- `.claude/skills/apply-morning/SKILL.md`: note the blended search + the new
  provenance file; folder prep already benefits via `get_proof_for_jd` (now
  exclusion + merge aware).

**Risk:** ~30–60 embedding calls per morning run — acceptable and documented;
`useGraphMatch:false` disables.

---

## Order & dependencies

`1 → 2 → 3 → 4 → 5 → 6 → 7`. Phase 3 may run parallel to Phase 2. Phase 6 needs
2 + 4. Phase 7 needs 3 + 4.
