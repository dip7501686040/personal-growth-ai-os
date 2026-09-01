import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  activityAnalyses,
  activityEvents,
  ingestTokens,
  projects,
  type ActivityAnalysis,
  type ActivityEvent,
  type IngestToken,
} from "@/lib/db/schema";

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// ── Ingest tokens ─────────────────────────────────────────────────────────

/** Creates a token, returns the RAW value once (only its hash is stored). */
export async function createIngestToken(
  userId: string,
  label: string,
): Promise<{ token: string; row: IngestToken }> {
  const raw = `pgaios_${randomBytes(24).toString("hex")}`;
  const [row] = await db
    .insert(ingestTokens)
    .values({ userId, tokenHash: hashToken(raw), label: label.trim() || "collector" })
    .returning();
  return { token: raw, row };
}

export function listIngestTokens(userId: string): Promise<IngestToken[]> {
  return db
    .select()
    .from(ingestTokens)
    .where(eq(ingestTokens.userId, userId))
    .orderBy(desc(ingestTokens.createdAt));
}

export async function revokeIngestToken(
  userId: string,
  id: string,
): Promise<void> {
  await db
    .update(ingestTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(ingestTokens.userId, userId), eq(ingestTokens.id, id)));
}

/** Resolves a raw bearer token to a user id, or null. Touches last_used_at. */
export async function resolveIngestToken(raw: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(ingestTokens)
    .where(
      and(eq(ingestTokens.tokenHash, hashToken(raw)), isNull(ingestTokens.revokedAt)),
    )
    .limit(1);
  if (!row) return null;
  await db
    .update(ingestTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(ingestTokens.id, row.id));
  return row.userId;
}

// ── Ingest ───────────────────────────────────────────────────────────────

export interface IngestPayload {
  clientEventId: string;
  sessionId?: string;
  projectPath?: string;
  projectName?: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  files: { created: string[]; modified: string[]; deleted: string[] };
  git: {
    branch?: string;
    commits: { hash: string; message: string }[];
    stats: { filesChanged: number; insertions: number; deletions: number };
  };
  sessionSummary?: string;
}

export async function ingestActivity(
  userId: string,
  p: IngestPayload,
): Promise<{ deduped: boolean; id: string | null }> {
  let projectId: string | null = null;
  if (p.projectPath) {
    const [proj] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(eq(projects.userId, userId), eq(projects.repoPath, p.projectPath)),
      )
      .limit(1);
    projectId = proj?.id ?? null;
  }

  const [row] = await db
    .insert(activityEvents)
    .values({
      userId,
      projectId,
      clientEventId: p.clientEventId,
      sessionId: p.sessionId ?? null,
      projectName: p.projectName ?? null,
      startedAt: new Date(p.startedAt),
      endedAt: new Date(p.endedAt),
      durationSeconds: Math.max(0, Math.round(p.durationSeconds)),
      filesCreated: p.files.created,
      filesModified: p.files.modified,
      filesDeleted: p.files.deleted,
      gitBranch: p.git.branch ?? null,
      gitCommits: p.git.commits,
      gitStats: p.git.stats,
      sessionSummary: p.sessionSummary ?? null,
    })
    .onConflictDoNothing({
      target: [activityEvents.userId, activityEvents.clientEventId],
    })
    .returning({ id: activityEvents.id });

  return row ? { deduped: false, id: row.id } : { deduped: true, id: null };
}

// ── Reads ────────────────────────────────────────────────────────────────

export function listRecentEvents(
  userId: string,
  limit = 25,
): Promise<ActivityEvent[]> {
  return db
    .select()
    .from(activityEvents)
    .where(eq(activityEvents.userId, userId))
    .orderBy(desc(activityEvents.startedAt))
    .limit(limit);
}

export function listAnalyses(
  userId: string,
  limit = 14,
): Promise<ActivityAnalysis[]> {
  return db
    .select()
    .from(activityAnalyses)
    .where(eq(activityAnalyses.userId, userId))
    .orderBy(desc(activityAnalyses.analysisDate))
    .limit(limit);
}

/** `received` events whose session falls on `date` (UTC), grouped by project. */
export async function eventsForDate(
  userId: string,
  date: string,
): Promise<ActivityEvent[]> {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(`${date}T23:59:59.999Z`);
  return db
    .select()
    .from(activityEvents)
    .where(
      and(
        eq(activityEvents.userId, userId),
        eq(activityEvents.status, "received"),
        gte(activityEvents.startedAt, start),
        lte(activityEvents.startedAt, end),
      ),
    )
    .orderBy(activityEvents.startedAt);
}

export async function markEventsAnalyzed(
  userId: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(activityEvents)
    .set({ status: "analyzed" })
    .where(
      and(eq(activityEvents.userId, userId), inArray(activityEvents.id, ids)),
    );
}

export interface AnalysisData {
  analysisDate: string;
  activityEventIds: string[];
  agentRunId: string | null;
  summary: string;
  workCategories: string[];
  suggestedSkills: { skill: string; confidence: number; reason: string }[];
  potentialProof: string[];
  contentOpportunities: string[];
}

export async function upsertAnalysis(
  userId: string,
  data: AnalysisData,
): Promise<string> {
  await db
    .delete(activityAnalyses)
    .where(
      and(
        eq(activityAnalyses.userId, userId),
        eq(activityAnalyses.analysisDate, data.analysisDate),
      ),
    );
  const [row] = await db
    .insert(activityAnalyses)
    .values({
      userId,
      analysisDate: data.analysisDate,
      activityEventIds: data.activityEventIds,
      agentRunId: data.agentRunId,
      summary: data.summary,
      workCategories: data.workCategories,
      suggestedSkills: data.suggestedSkills,
      potentialProof: data.potentialProof,
      contentOpportunities: data.contentOpportunities,
    })
    .returning({ id: activityAnalyses.id });
  return row.id;
}

export async function countPendingEvents(userId: string): Promise<number> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(activityEvents)
    .where(
      and(
        eq(activityEvents.userId, userId),
        eq(activityEvents.status, "received"),
      ),
    );
  return n;
}
