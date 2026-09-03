import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { skillEvidence, skills } from "@/lib/db/schema";
import {
  countLearningActivity,
  getPatternStats,
  listLearningSessions,
  listRecentAttempts,
  rankWeakPatterns,
} from "@/modules/learning/service";
import { SKILL_LEVELS, type SkillLevel } from "@/modules/skills/levels";
import type {
  ActivityEvidenceItem,
  CoreSlice,
  InProgressSkill,
  LearningSlice,
  RecentAttempt,
  RecentSession,
  SkillsByLevel,
} from "./types";

const PER_LEVEL_CAP = 18;

async function fetchSkillsByLevel(userId: string): Promise<SkillsByLevel> {
  const rows = await db
    .select({ name: skills.name, level: skills.level })
    .from(skills)
    .where(eq(skills.userId, userId))
    .orderBy(desc(skills.confidence), skills.name);

  const byLevel = Object.fromEntries(
    SKILL_LEVELS.map((l) => [l, [] as string[]]),
  ) as SkillsByLevel;
  for (const r of rows) {
    const bucket = byLevel[r.level as SkillLevel];
    if (bucket && bucket.length < PER_LEVEL_CAP) bucket.push(r.name);
  }
  return byLevel;
}

async function fetchInProgressSkills(
  userId: string,
): Promise<InProgressSkill[]> {
  const rows = await db
    .select({
      name: skills.name,
      level: skills.level,
      category: skills.category,
    })
    .from(skills)
    .where(eq(skills.userId, userId))
    .orderBy(desc(skills.updatedAt))
    .limit(60);
  return rows
    .filter((s) => s.level === "learning" || s.level === "practiced")
    .slice(0, 12);
}

async function fetchRecentSessions(
  userId: string,
  limit: number,
): Promise<RecentSession[]> {
  const rows = await listLearningSessions(userId, limit);
  return rows.map((s) => ({
    topic: s.topic,
    category: s.category,
    confidenceAfter: s.confidenceAfter,
    occurredAt: s.occurredAt.toISOString().slice(0, 10),
  }));
}

async function fetchRecentAttempts(
  userId: string,
  limit: number,
): Promise<RecentAttempt[]> {
  const rows = await listRecentAttempts(userId, limit);
  return rows.map((a) => ({
    title: a.title,
    solved: a.solved,
    hintsUsed: a.hintsUsed,
    failureReason: a.failureReason,
    attemptedAt: a.attemptedAt.toISOString().slice(0, 10),
  }));
}

async function fetchActivityEvidence(
  userId: string,
): Promise<ActivityEvidenceItem[]> {
  return db
    .select({ skill: skills.name, summary: skillEvidence.summary })
    .from(skillEvidence)
    .innerJoin(skills, eq(skills.id, skillEvidence.skillId))
    .where(
      and(
        eq(skillEvidence.userId, userId),
        eq(skillEvidence.sourceType, "activity_analysis"),
        eq(skillEvidence.status, "accepted"),
        gte(skillEvidence.createdAt, new Date(Date.now() - 14 * 864e5)),
      ),
    )
    .limit(20);
}

/** The slice every purpose shares. */
export async function buildCoreSlice(userId: string): Promise<CoreSlice> {
  const [skillsByLevel, inProgressSkills, recentSessions, activityEvidence] =
    await Promise.all([
      fetchSkillsByLevel(userId),
      fetchInProgressSkills(userId),
      fetchRecentSessions(userId, 8),
      fetchActivityEvidence(userId),
    ]);
  return { skillsByLevel, inProgressSkills, recentSessions, activityEvidence };
}

/** learning_plan's slice — core plus DSA pattern stats + attempt log. */
export async function buildLearningSlice(
  userId: string,
): Promise<LearningSlice> {
  const [core, activityCount, patternStats, recentAttempts] = await Promise.all([
    buildCoreSlice(userId),
    countLearningActivity(userId),
    getPatternStats(userId),
    fetchRecentAttempts(userId, 20),
  ]);
  return {
    ...core,
    activityCount,
    patternStats,
    weakPatterns: rankWeakPatterns(patternStats).slice(0, 4),
    recentAttempts,
  };
}
