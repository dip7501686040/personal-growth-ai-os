import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { ingestionJobs, type IngestionJob } from "@/lib/db/schema";

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
