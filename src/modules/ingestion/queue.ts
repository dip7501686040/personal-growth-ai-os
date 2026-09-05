import { and, asc, desc, eq, inArray, lt, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  ingestionJobs,
  ingestionSources,
  type IngestionJob,
} from "@/lib/db/schema";
import { decodeCursor, encodeCursor, type Page } from "@/lib/paginate";

export const MAX_JOB_ATTEMPTS = 3;

export interface EnqueueInput {
  userId: string;
  sourceId?: string | null;
  /** github_file | github_commit | chatgpt_conversation | claude_transcript | upload_doc */
  kind: string;
  /** stable per (source, unit); re-enqueues with the same key are ignored */
  dedupeKey?: string | null;
  payload: Record<string, unknown>;
}

export interface EnqueueResult {
  job: IngestionJob;
  deduped: boolean;
}

export async function enqueueJob(input: EnqueueInput): Promise<EnqueueResult> {
  if (input.dedupeKey) {
    const [existing] = await db
      .select()
      .from(ingestionJobs)
      .where(
        and(
          eq(ingestionJobs.userId, input.userId),
          eq(ingestionJobs.dedupeKey, input.dedupeKey),
        ),
      )
      .limit(1);
    if (existing) return { job: existing, deduped: true };
  }

  const [job] = await db
    .insert(ingestionJobs)
    .values({
      userId: input.userId,
      sourceId: input.sourceId ?? null,
      kind: input.kind,
      dedupeKey: input.dedupeKey ?? null,
      payload: input.payload as object,
      status: "pending",
    })
    .returning();
  return { job, deduped: false };
}

export interface UpsertSessionJobInput {
  userId: string;
  kind: string;
  /** stable per logical unit (e.g. `claude:<sessionId>`) — the row is keyed on it */
  dedupeKey: string;
  payload: Record<string, unknown>;
}

export interface UpsertSessionJobResult {
  job: IngestionJob;
  /**
   * inserted – first time we've seen this unit
   * replaced – a not-yet-processed job's payload was swapped for the newer snapshot
   * reopened – a finished/failed job was flipped back to pending (content changed)
   * skipped  – nothing to do (identical content, or a run is in flight)
   */
  action: "inserted" | "replaced" | "reopened" | "skipped";
}

/**
 * Coalescing enqueue for units that get re-shipped as they grow (Claude Code
 * transcripts: every message produces a longer snapshot of the same session).
 * Instead of piling up one row per snapshot, we keep **one row per `dedupeKey`**
 * and fold the latest content into it:
 *
 *  - no row yet            → insert
 *  - pending, new content  → replace its payload (stays queued, keeps its place)
 *  - done/failed, new text → reopen it (re-extract; downstream supersede handles
 *                            the document churn)
 *  - identical content     → skip
 *  - a run is in flight    → skip (the next snapshot re-coalesces once it lands)
 */
export async function upsertSessionJob(
  input: UpsertSessionJobInput,
): Promise<UpsertSessionJobResult> {
  const [existing] = await db
    .select()
    .from(ingestionJobs)
    .where(
      and(
        eq(ingestionJobs.userId, input.userId),
        eq(ingestionJobs.dedupeKey, input.dedupeKey),
      ),
    )
    .limit(1);

  if (!existing) {
    const [job] = await db
      .insert(ingestionJobs)
      .values({
        userId: input.userId,
        kind: input.kind,
        dedupeKey: input.dedupeKey,
        payload: input.payload as object,
        status: "pending",
      })
      .returning();
    return { job, action: "inserted" };
  }

  const sameText =
    (existing.payload as { text?: unknown } | null)?.text ===
    input.payload.text;

  if (existing.status === "running" || sameText) {
    return { job: existing, action: "skipped" };
  }

  const reopening = existing.status === "done" || existing.status === "failed";
  const [job] = await db
    .update(ingestionJobs)
    .set({
      payload: input.payload as object,
      status: "pending",
      attempts: 0,
      error: null,
      startedAt: null,
      finishedAt: null,
      agentRunId: null,
    })
    .where(eq(ingestionJobs.id, existing.id))
    .returning();
  return { job, action: reopening ? "reopened" : "replaced" };
}

/**
 * Combine an explicit set of `pending` jobs into a single row.
 *
 * Survivor = the newest selected snapshot (transcripts grow, so newest ⊇ older),
 * tie-broken by longest text; the rest are deleted. If every combined job shares
 * one `payload.sourceRef`, the survivor adopts `dedupeKey` = that ref so future
 * snapshots of the same session fold onto it via `upsertSessionJob`.
 */
export async function combineJobs(
  userId: string,
  ids: string[],
): Promise<{ removed: number; survivorId: string | null }> {
  const uniq = [...new Set(ids)].filter(Boolean);
  if (uniq.length < 2) return { removed: 0, survivorId: null };

  const rows = await db
    .select()
    .from(ingestionJobs)
    .where(
      and(
        eq(ingestionJobs.userId, userId),
        inArray(ingestionJobs.id, uniq),
        eq(ingestionJobs.status, "pending"),
      ),
    );
  if (rows.length < 2) return { removed: 0, survivorId: null };

  const survivor = [...rows].sort((a, b) => {
    const t = b.createdAt.getTime() - a.createdAt.getTime();
    if (t !== 0) return t;
    const al = ((a.payload as { text?: string } | null)?.text ?? "").length;
    const bl = ((b.payload as { text?: string } | null)?.text ?? "").length;
    return bl - al;
  })[0];

  const loserIds = rows.filter((j) => j.id !== survivor.id).map((j) => j.id);
  await db.delete(ingestionJobs).where(inArray(ingestionJobs.id, loserIds));

  const refs = new Set(
    rows
      .map((j) => (j.payload as { sourceRef?: unknown } | null)?.sourceRef)
      .filter((r): r is string => typeof r === "string" && r.length > 0),
  );
  if (refs.size === 1) {
    const ref = [...refs][0];
    const [conflict] = await db
      .select({ id: ingestionJobs.id })
      .from(ingestionJobs)
      .where(
        and(eq(ingestionJobs.userId, userId), eq(ingestionJobs.dedupeKey, ref)),
      )
      .limit(1);
    if (!conflict || conflict.id === survivor.id) {
      await db
        .update(ingestionJobs)
        .set({ dedupeKey: ref })
        .where(eq(ingestionJobs.id, survivor.id));
    }
  }

  return { removed: loserIds.length, survivorId: survivor.id };
}

/** Atomically move the oldest pending job to `running` and return it. */
export async function claimNextJob(
  userId: string,
): Promise<IngestionJob | null> {
  const [next] = await db
    .select({ id: ingestionJobs.id })
    .from(ingestionJobs)
    .where(
      and(
        eq(ingestionJobs.userId, userId),
        eq(ingestionJobs.status, "pending"),
      ),
    )
    .orderBy(asc(ingestionJobs.createdAt))
    .limit(1);
  if (!next) return null;

  const [claimed] = await db
    .update(ingestionJobs)
    .set({
      status: "running",
      attempts: sql`${ingestionJobs.attempts} + 1`,
      startedAt: new Date(),
      error: null,
    })
    .where(
      and(eq(ingestionJobs.id, next.id), eq(ingestionJobs.status, "pending")),
    )
    .returning();
  return claimed ?? null;
}

/** Claim one specific job by id (used when a job id is passed explicitly). */
export async function claimJob(
  userId: string,
  id: string,
): Promise<IngestionJob | null> {
  const [claimed] = await db
    .update(ingestionJobs)
    .set({
      status: "running",
      attempts: sql`${ingestionJobs.attempts} + 1`,
      startedAt: new Date(),
      error: null,
    })
    .where(
      and(
        eq(ingestionJobs.userId, userId),
        eq(ingestionJobs.id, id),
        eq(ingestionJobs.status, "pending"),
      ),
    )
    .returning();
  return claimed ?? null;
}

export async function getJob(
  userId: string,
  id: string,
): Promise<IngestionJob | null> {
  const [row] = await db
    .select()
    .from(ingestionJobs)
    .where(and(eq(ingestionJobs.userId, userId), eq(ingestionJobs.id, id)))
    .limit(1);
  return row ?? null;
}

export async function completeJob(
  id: string,
  result: Record<string, unknown>,
): Promise<void> {
  await db
    .update(ingestionJobs)
    .set({
      status: "done",
      finishedAt: new Date(),
      error: null,
      payload: sql`${ingestionJobs.payload} || ${JSON.stringify({ result })}::jsonb`,
    })
    .where(eq(ingestionJobs.id, id));
}

/** Back to `pending` for another attempt, or `failed` once attempts run out. */
export async function failJob(id: string, error: string): Promise<void> {
  const [row] = await db
    .select({ attempts: ingestionJobs.attempts })
    .from(ingestionJobs)
    .where(eq(ingestionJobs.id, id))
    .limit(1);
  const exhausted = (row?.attempts ?? MAX_JOB_ATTEMPTS) >= MAX_JOB_ATTEMPTS;
  await db
    .update(ingestionJobs)
    .set({
      status: exhausted ? "failed" : "pending",
      error: error.slice(0, 2000),
      finishedAt: exhausted ? new Date() : null,
    })
    .where(eq(ingestionJobs.id, id));
}

export async function countPendingJobs(userId: string): Promise<number> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(ingestionJobs)
    .where(
      and(
        eq(ingestionJobs.userId, userId),
        eq(ingestionJobs.status, "pending"),
      ),
    );
  return n;
}

/** Counts keyed by status — { pending, running, failed, done } always present. */
export async function countJobsByStatus(
  userId: string,
): Promise<Record<string, number>> {
  const rows = await db
    .select({ status: ingestionJobs.status, n: sql<number>`count(*)::int` })
    .from(ingestionJobs)
    .where(eq(ingestionJobs.userId, userId))
    .groupBy(ingestionJobs.status);
  const out: Record<string, number> = {
    pending: 0,
    running: 0,
    failed: 0,
    done: 0,
  };
  for (const r of rows) out[r.status] = r.n;
  return out;
}

// ── queue browsing (read models for the Knowledge page) ────────────────────

export interface JobListItem {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  error: string | null;
  /** payload.title, else payload.sourceRef, else the job kind */
  title: string;
  /** first ~240 chars of the source text, whitespace-collapsed */
  preview: string;
  charCount: number;
  sourceKind: string | null;
  sourceRef: string | null;
  /** ingestion_sources.external_ref when the job came from a connected source */
  sourceExternalRef: string | null;
  agentRunId: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

interface RawJobPayload {
  text?: unknown;
  title?: unknown;
  sourceKind?: unknown;
  sourceRef?: unknown;
}

function summarizeJob(
  job: IngestionJob,
  sourceExternalRef: string | null,
): JobListItem {
  const p = (job.payload ?? {}) as RawJobPayload;
  const text = typeof p.text === "string" ? p.text : "";
  const title =
    (typeof p.title === "string" && p.title.trim()) ||
    (typeof p.sourceRef === "string" && p.sourceRef) ||
    job.kind;
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    attempts: job.attempts,
    error: job.error,
    title,
    preview: text.replace(/\s+/g, " ").trim().slice(0, 240),
    charCount: text.length,
    sourceKind: typeof p.sourceKind === "string" ? p.sourceKind : null,
    sourceRef: typeof p.sourceRef === "string" ? p.sourceRef : null,
    sourceExternalRef,
    agentRunId: job.agentRunId,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
  };
}

export async function listJobs(
  userId: string,
  opts?: { statuses?: string[]; limit?: number; cursor?: string | null },
): Promise<Page<JobListItem>> {
  const limit = opts?.limit ?? 10;
  const cur = decodeCursor(opts?.cursor);

  const rows = await db
    .select({ job: ingestionJobs, externalRef: ingestionSources.externalRef })
    .from(ingestionJobs)
    .leftJoin(
      ingestionSources,
      eq(ingestionJobs.sourceId, ingestionSources.id),
    )
    .where(
      and(
        eq(ingestionJobs.userId, userId),
        opts?.statuses?.length
          ? inArray(ingestionJobs.status, opts.statuses)
          : undefined,
        cur
          ? or(
              lt(ingestionJobs.createdAt, cur.createdAt),
              and(
                eq(ingestionJobs.createdAt, cur.createdAt),
                lt(ingestionJobs.id, cur.id),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(desc(ingestionJobs.createdAt), desc(ingestionJobs.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const last = pageRows.at(-1)?.job;
  return {
    items: pageRows.map((r) => summarizeJob(r.job, r.externalRef ?? null)),
    nextCursor:
      hasMore && last
        ? encodeCursor({ createdAt: last.createdAt, id: last.id })
        : null,
  };
}

/** Last N jobs a given source produced, any status — the per-source drill-down
 *  on the Sources card. Newest first, no pagination (bounded by `limit`). */
export async function listJobsForSource(
  userId: string,
  sourceId: string,
  limit = 20,
): Promise<JobListItem[]> {
  const rows = await db
    .select({ job: ingestionJobs, externalRef: ingestionSources.externalRef })
    .from(ingestionJobs)
    .leftJoin(ingestionSources, eq(ingestionJobs.sourceId, ingestionSources.id))
    .where(
      and(eq(ingestionJobs.userId, userId), eq(ingestionJobs.sourceId, sourceId)),
    )
    .orderBy(desc(ingestionJobs.createdAt))
    .limit(limit);
  return rows.map((r) => summarizeJob(r.job, r.externalRef ?? null));
}

/** Edit a not-yet-processed job's title / source text. Returns false if the job
 *  is missing or currently `running`. */
export async function updateJobPayload(
  userId: string,
  id: string,
  patch: { title?: string; text?: string },
): Promise<boolean> {
  const [job] = await db
    .select()
    .from(ingestionJobs)
    .where(and(eq(ingestionJobs.userId, userId), eq(ingestionJobs.id, id)))
    .limit(1);
  if (!job || job.status === "running") return false;

  const payload = { ...((job.payload ?? {}) as Record<string, unknown>) };
  if (patch.title !== undefined) payload.title = patch.title;
  if (patch.text !== undefined) payload.text = patch.text;

  await db
    .update(ingestionJobs)
    .set({ payload: payload as object })
    .where(and(eq(ingestionJobs.userId, userId), eq(ingestionJobs.id, id)));
  return true;
}

/** Delete a queue row (anything except one that's currently `running`). */
export async function deleteJob(userId: string, id: string): Promise<boolean> {
  const res = await db
    .delete(ingestionJobs)
    .where(
      and(
        eq(ingestionJobs.userId, userId),
        eq(ingestionJobs.id, id),
        ne(ingestionJobs.status, "running"),
      ),
    )
    .returning({ id: ingestionJobs.id });
  return res.length > 0;
}

export interface JobDetail extends JobListItem {
  fullText: string;
  dedupeKey: string | null;
  payload: Record<string, unknown>;
}

export async function getJobDetail(
  userId: string,
  id: string,
): Promise<JobDetail | null> {
  const [row] = await db
    .select({ job: ingestionJobs, externalRef: ingestionSources.externalRef })
    .from(ingestionJobs)
    .leftJoin(
      ingestionSources,
      eq(ingestionJobs.sourceId, ingestionSources.id),
    )
    .where(and(eq(ingestionJobs.userId, userId), eq(ingestionJobs.id, id)))
    .limit(1);
  if (!row) return null;
  const p = (row.job.payload ?? {}) as Record<string, unknown>;
  return {
    ...summarizeJob(row.job, row.externalRef ?? null),
    fullText: typeof p.text === "string" ? p.text : "",
    dedupeKey: row.job.dedupeKey,
    payload: p,
  };
}
