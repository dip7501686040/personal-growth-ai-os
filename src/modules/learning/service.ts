import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  dsaAttempts,
  dsaPatterns,
  dsaProblemPatterns,
  dsaProblems,
  learningSessionSkills,
  learningSessions,
  type DsaAttempt,
  type DsaPattern,
  type LearningSession,
} from "@/lib/db/schema";
import { recordContextEvent } from "@/modules/context/events";
import { addEvidence, upsertSkillByName } from "@/modules/skills/service";
import {
  computePatternStats,
  rankWeakPatterns,
  type AttemptForStats,
  type PatternStat,
} from "./pattern-stats";

// ── DSA patterns ───────────────────────────────────────────────────────────

export function listPatterns(): Promise<DsaPattern[]> {
  return db.select().from(dsaPatterns).orderBy(dsaPatterns.sortOrder);
}

// ── Learning sessions ──────────────────────────────────────────────────────

export async function createLearningSession(
  userId: string,
  input: {
    topic: string;
    category: "technology" | "system_design" | "dsa" | "revision";
    description?: string;
    resourceUrl?: string;
    durationMinutes?: number;
    confidenceBefore?: number;
    confidenceAfter?: number;
    notes?: string;
    occurredAt?: Date;
  },
  skillIds: string[] = [],
): Promise<LearningSession> {
  const [session] = await db
    .insert(learningSessions)
    .values({
      userId,
      topic: input.topic.trim(),
      category: input.category,
      description: input.description?.trim() || null,
      resourceUrl: input.resourceUrl?.trim() || null,
      durationMinutes: input.durationMinutes ?? null,
      confidenceBefore: input.confidenceBefore ?? null,
      confidenceAfter: input.confidenceAfter ?? null,
      notes: input.notes?.trim() || null,
      occurredAt: input.occurredAt ?? new Date(),
    })
    .returning();

  if (skillIds.length > 0) {
    await db
      .insert(learningSessionSkills)
      .values(skillIds.map((skillId) => ({ sessionId: session.id, skillId })))
      .onConflictDoNothing();

    for (const skillId of skillIds) {
      await addEvidence(userId, skillId, {
        summary: `Studied: ${session.topic}`,
        detail: input.description,
        sourceType: "learning_session",
        sourceId: session.id,
        supportsLevel: "learning",
        strength: "moderate",
        status: "accepted",
      });
    }
  }

  await recordContextEvent({
    userId,
    kind: "learning_logged",
    refId: session.id,
  });

  return session;
}

export function listLearningSessions(
  userId: string,
  limit = 20,
): Promise<LearningSession[]> {
  return db
    .select()
    .from(learningSessions)
    .where(eq(learningSessions.userId, userId))
    .orderBy(desc(learningSessions.occurredAt))
    .limit(limit);
}

// ── DSA problems + attempts ────────────────────────────────────────────────

export type DsaProblemWithPatterns = {
  id: string;
  title: string;
  sourceUrl: string | null;
  difficulty: "easy" | "medium" | "hard";
  topic: string | null;
  patterns: { id: string; slug: string; name: string }[];
};

export async function createDsaProblem(
  userId: string,
  input: {
    title: string;
    sourceUrl?: string;
    difficulty: "easy" | "medium" | "hard";
    topic?: string;
    notes?: string;
  },
  patternIds: string[] = [],
): Promise<{ id: string }> {
  const [problem] = await db
    .insert(dsaProblems)
    .values({
      userId,
      title: input.title.trim(),
      sourceUrl: input.sourceUrl?.trim() || null,
      difficulty: input.difficulty,
      topic: input.topic?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .returning({ id: dsaProblems.id });

  if (patternIds.length > 0) {
    await db
      .insert(dsaProblemPatterns)
      .values(patternIds.map((patternId) => ({ problemId: problem.id, patternId })))
      .onConflictDoNothing();
  }
  return problem;
}

export async function listDsaProblems(
  userId: string,
): Promise<DsaProblemWithPatterns[]> {
  const problems = await db
    .select()
    .from(dsaProblems)
    .where(eq(dsaProblems.userId, userId))
    .orderBy(desc(dsaProblems.createdAt));
  if (problems.length === 0) return [];

  const links = await db
    .select({
      problemId: dsaProblemPatterns.problemId,
      id: dsaPatterns.id,
      slug: dsaPatterns.slug,
      name: dsaPatterns.name,
    })
    .from(dsaProblemPatterns)
    .innerJoin(dsaPatterns, eq(dsaPatterns.id, dsaProblemPatterns.patternId))
    .where(
      inArray(
        dsaProblemPatterns.problemId,
        problems.map((p) => p.id),
      ),
    );

  return problems.map((p) => ({
    id: p.id,
    title: p.title,
    sourceUrl: p.sourceUrl,
    difficulty: p.difficulty,
    topic: p.topic,
    patterns: links
      .filter((l) => l.problemId === p.id)
      .map((l) => ({ id: l.id, slug: l.slug, name: l.name })),
  }));
}

export async function recordAttempt(
  userId: string,
  input: {
    problemId: string;
    solved: boolean;
    timeTakenMinutes?: number;
    hintsUsed?: number;
    confidenceBefore?: number;
    confidenceAfter?: number;
    failureReason?: AttemptForStats["failureReason"];
    notes?: string;
    attemptedAt?: Date;
  },
): Promise<DsaAttempt> {
  const [problem] = await db
    .select()
    .from(dsaProblems)
    .where(
      and(eq(dsaProblems.userId, userId), eq(dsaProblems.id, input.problemId)),
    )
    .limit(1);
  if (!problem) throw new Error("Problem not found.");

  const [attempt] = await db
    .insert(dsaAttempts)
    .values({
      userId,
      problemId: input.problemId,
      solved: input.solved,
      timeTakenMinutes: input.timeTakenMinutes ?? null,
      hintsUsed: input.hintsUsed ?? 0,
      confidenceBefore: input.confidenceBefore ?? null,
      confidenceAfter: input.confidenceAfter ?? null,
      failureReason: input.failureReason ?? "none",
      notes: input.notes?.trim() || null,
      attemptedAt: input.attemptedAt ?? new Date(),
    })
    .returning();

  // A clean solve feeds the shared skill graph: each pattern becomes a
  // dsa_pattern skill with practiced-level evidence.
  if (input.solved) {
    const patterns = await db
      .select({ name: dsaPatterns.name })
      .from(dsaProblemPatterns)
      .innerJoin(dsaPatterns, eq(dsaPatterns.id, dsaProblemPatterns.patternId))
      .where(eq(dsaProblemPatterns.problemId, input.problemId));

    for (const { name } of patterns) {
      const skill = await upsertSkillByName(userId, name, "dsa_pattern");
      await addEvidence(userId, skill.id, {
        summary: `Solved "${problem.title}"${
          (input.hintsUsed ?? 0) === 0 ? " unaided" : ` with ${input.hintsUsed} hint(s)`
        }`,
        sourceType: "dsa_attempt",
        sourceId: attempt.id,
        supportsLevel: "practiced",
        strength: (input.hintsUsed ?? 0) === 0 ? "moderate" : "weak",
        status: "accepted",
      });
    }
  }

  return attempt;
}

// ── Aggregation used by the UI and the Learning agent ──────────────────────

export async function getPatternStats(userId: string): Promise<PatternStat[]> {
  const patterns = await db
    .select({ slug: dsaPatterns.slug, name: dsaPatterns.name })
    .from(dsaPatterns);

  const rows = await db
    .select({
      attemptId: dsaAttempts.id,
      solved: dsaAttempts.solved,
      hintsUsed: dsaAttempts.hintsUsed,
      timeTakenMinutes: dsaAttempts.timeTakenMinutes,
      failureReason: dsaAttempts.failureReason,
      attemptedAt: dsaAttempts.attemptedAt,
      patternSlug: dsaPatterns.slug,
    })
    .from(dsaAttempts)
    .innerJoin(
      dsaProblemPatterns,
      eq(dsaProblemPatterns.problemId, dsaAttempts.problemId),
    )
    .innerJoin(dsaPatterns, eq(dsaPatterns.id, dsaProblemPatterns.patternId))
    .where(eq(dsaAttempts.userId, userId));

  const byAttempt = new Map<string, AttemptForStats>();
  for (const r of rows) {
    const cur = byAttempt.get(r.attemptId) ?? {
      patternSlugs: [],
      solved: r.solved,
      hintsUsed: r.hintsUsed,
      timeTakenMinutes: r.timeTakenMinutes,
      failureReason: r.failureReason,
      attemptedAt: r.attemptedAt.toISOString(),
    };
    cur.patternSlugs.push(r.patternSlug);
    byAttempt.set(r.attemptId, cur);
  }

  return computePatternStats(patterns, [...byAttempt.values()]);
}

export async function listRecentAttempts(userId: string, limit = 30) {
  return db
    .select({
      id: dsaAttempts.id,
      title: dsaProblems.title,
      difficulty: dsaProblems.difficulty,
      solved: dsaAttempts.solved,
      hintsUsed: dsaAttempts.hintsUsed,
      timeTakenMinutes: dsaAttempts.timeTakenMinutes,
      failureReason: dsaAttempts.failureReason,
      attemptedAt: dsaAttempts.attemptedAt,
    })
    .from(dsaAttempts)
    .innerJoin(dsaProblems, eq(dsaProblems.id, dsaAttempts.problemId))
    .where(eq(dsaAttempts.userId, userId))
    .orderBy(desc(dsaAttempts.attemptedAt))
    .limit(limit);
}

export async function countLearningActivity(userId: string): Promise<number> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(dsaAttempts)
    .where(eq(dsaAttempts.userId, userId));
  const [{ m }] = await db
    .select({ m: sql<number>`count(*)::int` })
    .from(learningSessions)
    .where(eq(learningSessions.userId, userId));
  return n + m;
}

export { rankWeakPatterns };
