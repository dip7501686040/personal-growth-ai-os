import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  contentItems,
  contentSources,
  dsaAttempts,
  dsaProblems,
  learningSessions,
  projectFeatures,
  projects,
  skillEvidence,
  skills,
  type ContentItem,
  type ContentSource,
} from "@/lib/db/schema";

export type ContentStatus =
  | "idea"
  | "draft"
  | "ready_for_review"
  | "approved"
  | "published";

export type SourceType =
  | "learning_session"
  | "project_feature"
  | "dsa_attempt"
  | "dsa_weakness"
  | "skill_levelup"
  | "activity_analysis"
  | "manual";

export type ContentListItem = ContentItem & { sourceCount: number };

export async function listContentItems(
  userId: string,
): Promise<ContentListItem[]> {
  const rows = await db
    .select({
      item: contentItems,
      sourceCount: sql<number>`count(${contentSources.id})::int`,
    })
    .from(contentItems)
    .leftJoin(contentSources, eq(contentSources.contentItemId, contentItems.id))
    .where(eq(contentItems.userId, userId))
    .groupBy(contentItems.id)
    .orderBy(desc(contentItems.updatedAt));
  return rows.map((r) => ({ ...r.item, sourceCount: r.sourceCount }));
}

export async function getContentItem(
  userId: string,
  id: string,
): Promise<{ item: ContentItem; sources: ContentSource[] } | null> {
  const [item] = await db
    .select()
    .from(contentItems)
    .where(and(eq(contentItems.userId, userId), eq(contentItems.id, id)))
    .limit(1);
  if (!item) return null;
  const sources = await db
    .select()
    .from(contentSources)
    .where(eq(contentSources.contentItemId, id))
    .orderBy(contentSources.createdAt);
  return { item, sources };
}

export async function hasItemForSource(
  userId: string,
  sourceType: SourceType,
  sourceId: string | null,
): Promise<boolean> {
  if (!sourceId) return false;
  const [row] = await db
    .select({ id: contentSources.id })
    .from(contentSources)
    .where(
      and(
        eq(contentSources.userId, userId),
        eq(contentSources.sourceType, sourceType),
        eq(contentSources.sourceId, sourceId),
      ),
    )
    .limit(1);
  return !!row;
}

export async function createIdea(
  userId: string,
  input: {
    title: string;
    hook?: string;
    angle?: string;
    agentRunId?: string | null;
    sources?: {
      sourceType: SourceType;
      sourceId?: string | null;
      note?: string;
    }[];
  },
): Promise<ContentItem> {
  const [item] = await db
    .insert(contentItems)
    .values({
      userId,
      title: input.title.trim(),
      hook: input.hook?.trim() || null,
      angle: input.angle?.trim() || null,
      status: "idea",
      agentRunId: input.agentRunId ?? null,
    })
    .returning();

  if (input.sources?.length) {
    await db.insert(contentSources).values(
      input.sources.map((s) => ({
        userId,
        contentItemId: item.id,
        sourceType: s.sourceType,
        sourceId: s.sourceId ?? null,
        note: s.note ?? null,
      })),
    );
  }
  return item;
}

export async function updateContentItem(
  userId: string,
  id: string,
  patch: Partial<{
    title: string;
    hook: string;
    angle: string;
    body: string;
    status: ContentStatus;
  }>,
): Promise<void> {
  await db
    .update(contentItems)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(contentItems.userId, userId), eq(contentItems.id, id)));
}

export async function deleteContentItem(
  userId: string,
  id: string,
): Promise<void> {
  await db
    .delete(contentItems)
    .where(and(eq(contentItems.userId, userId), eq(contentItems.id, id)));
}

// ── Context for the Content agent (scan mode) ─────────────────────────────

export async function getContentSnapshot(userId: string) {
  const since = new Date(Date.now() - 21 * 864e5);

  const [sessions, features, dsa, levelups] = await Promise.all([
    db
      .select({
        id: learningSessions.id,
        topic: learningSessions.topic,
        category: learningSessions.category,
        description: learningSessions.description,
        confidenceBefore: learningSessions.confidenceBefore,
        confidenceAfter: learningSessions.confidenceAfter,
      })
      .from(learningSessions)
      .where(
        and(
          eq(learningSessions.userId, userId),
          gte(learningSessions.occurredAt, since),
        ),
      )
      .orderBy(desc(learningSessions.occurredAt))
      .limit(15),
    db
      .select({
        id: projectFeatures.id,
        title: projectFeatures.title,
        description: projectFeatures.description,
        project: projects.name,
      })
      .from(projectFeatures)
      .innerJoin(projects, eq(projects.id, projectFeatures.projectId))
      .where(
        and(
          eq(projectFeatures.userId, userId),
          eq(projectFeatures.status, "done"),
          gte(projectFeatures.completedAt, since),
        ),
      )
      .orderBy(desc(projectFeatures.completedAt))
      .limit(15),
    db
      .select({
        id: dsaAttempts.id,
        title: dsaProblems.title,
        solved: dsaAttempts.solved,
        failureReason: dsaAttempts.failureReason,
        notes: dsaAttempts.notes,
      })
      .from(dsaAttempts)
      .innerJoin(dsaProblems, eq(dsaProblems.id, dsaAttempts.problemId))
      .where(
        and(
          eq(dsaAttempts.userId, userId),
          gte(dsaAttempts.attemptedAt, since),
        ),
      )
      .orderBy(desc(dsaAttempts.attemptedAt))
      .limit(15),
    db
      .select({
        id: skillEvidence.id,
        skill: skills.name,
        summary: skillEvidence.summary,
        supportsLevel: skillEvidence.supportsLevel,
      })
      .from(skillEvidence)
      .innerJoin(skills, eq(skills.id, skillEvidence.skillId))
      .where(
        and(
          eq(skillEvidence.userId, userId),
          eq(skillEvidence.status, "accepted"),
          eq(skillEvidence.sourceType, "project_feature"),
          gte(skillEvidence.decidedAt, since),
        ),
      )
      .orderBy(desc(skillEvidence.decidedAt))
      .limit(15),
  ]);

  return { sessions, features, dsa, levelups };
}
