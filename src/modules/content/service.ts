import { and, desc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
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
import { slugify } from "@/lib/slug";

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

// ── Portfolio cards (Group C) — curated visual-proof, platform "portfolio" ──

export type CardKind = "diagram" | "screenshot" | "video";

export interface PortfolioCardInput {
  title: string;
  caption?: string;
  kind: CardKind;
  cloudinaryPublicId: string;
  cloudinaryResourceType: "image" | "video";
  cloudinaryFormat: string;
  featureId?: string | null;
  isPublic?: boolean;
}

/** A portfolio card is a content_item — no separate table, no idea/draft
 *  Kanban: picking the asset + feature is itself the curation act. */
export async function createPortfolioCard(
  userId: string,
  input: PortfolioCardInput,
): Promise<ContentItem> {
  const [item] = await db
    .insert(contentItems)
    .values({
      userId,
      platform: "portfolio",
      status: "published",
      title: input.title.trim(),
      body: input.caption?.trim() || null,
      assetType: input.kind,
      cloudinaryPublicId: input.cloudinaryPublicId,
      cloudinaryResourceType: input.cloudinaryResourceType,
      cloudinaryFormat: input.cloudinaryFormat,
      isPublic: input.isPublic ?? true,
    })
    .returning();
  if (input.featureId) {
    await db.insert(contentSources).values({
      userId,
      contentItemId: item.id,
      sourceType: "project_feature",
      sourceId: input.featureId,
    });
  }
  return item;
}

export type PortfolioCardListItem = ContentItem & {
  featureId: string | null;
  featureTitle: string | null;
  projectName: string | null;
  projectSlug: string | null;
};

export async function listPortfolioCards(
  userId: string,
): Promise<PortfolioCardListItem[]> {
  const rows = await db
    .select()
    .from(contentItems)
    .where(and(eq(contentItems.userId, userId), eq(contentItems.platform, "portfolio")))
    .orderBy(desc(contentItems.createdAt));
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const sources = await db
    .select({
      contentItemId: contentSources.contentItemId,
      featureId: contentSources.sourceId,
    })
    .from(contentSources)
    .where(
      and(
        eq(contentSources.userId, userId),
        eq(contentSources.sourceType, "project_feature"),
        inArray(contentSources.contentItemId, ids),
      ),
    );
  const featureIds = [...new Set(sources.map((s) => s.featureId).filter((x): x is string => !!x))];
  const features = featureIds.length
    ? await db
        .select({
          id: projectFeatures.id,
          title: projectFeatures.title,
          projectName: projects.name,
          projectSlug: projects.slug,
        })
        .from(projectFeatures)
        .innerJoin(projects, eq(projects.id, projectFeatures.projectId))
        .where(inArray(projectFeatures.id, featureIds))
    : [];
  const featureById = new Map(features.map((f) => [f.id, f]));
  const sourceByContentId = new Map(sources.map((s) => [s.contentItemId, s.featureId]));

  return rows.map((r) => {
    const featureId = sourceByContentId.get(r.id) ?? null;
    const f = featureId ? featureById.get(featureId) : undefined;
    return {
      ...r,
      featureId,
      featureTitle: f?.title ?? null,
      projectName: f?.projectName ?? null,
      projectSlug: f?.projectSlug ?? null,
    };
  });
}

export async function updatePortfolioCard(
  userId: string,
  id: string,
  patch: Partial<{
    title: string;
    caption: string;
    isPublic: boolean;
    featureId: string | null;
  }>,
): Promise<void> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.caption !== undefined) set.body = patch.caption;
  if (patch.isPublic !== undefined) set.isPublic = patch.isPublic;
  await db
    .update(contentItems)
    .set(set)
    .where(and(eq(contentItems.userId, userId), eq(contentItems.id, id)));

  if (patch.featureId !== undefined) {
    await db
      .delete(contentSources)
      .where(
        and(
          eq(contentSources.userId, userId),
          eq(contentSources.contentItemId, id),
          eq(contentSources.sourceType, "project_feature"),
        ),
      );
    if (patch.featureId) {
      await db.insert(contentSources).values({
        userId,
        contentItemId: id,
        sourceType: "project_feature",
        sourceId: patch.featureId,
      });
    }
  }
}

/** Every active feature, for the portfolio-card picker (any project, not just
 *  already-public ones — isPublic on the card is a separate later choice). */
export async function listFeaturesForPicker(
  userId: string,
): Promise<{ id: string; title: string; projectName: string; projectSlug: string }[]> {
  const rows = await db
    .select({
      id: projectFeatures.id,
      title: projectFeatures.title,
      projectName: projects.name,
      projectSlug: projects.slug,
    })
    .from(projectFeatures)
    .innerJoin(projects, eq(projects.id, projectFeatures.projectId))
    .where(
      and(
        eq(projects.userId, userId),
        isNull(projects.excludedAt),
        isNull(projectFeatures.excludedAt),
      ),
    )
    .orderBy(projects.name, projectFeatures.title);
  return rows;
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

// ── Group A — feature resolution + idempotency check ────────────────────────

export interface ResolvedFeature {
  id: string;
  title: string;
  description: string | null;
  projectId: string;
  projectName: string;
  projectSlug: string;
  repoUrl: string | null;
  codePaths: Record<string, string> | null;
}

/** (projectSlug, featureKey) -> the real feature row, matching by
 *  slugify(title) the same way the public API derives featureSlug. */
export async function findFeature(
  userId: string,
  projectSlug: string,
  featureKey: string,
): Promise<ResolvedFeature | null> {
  const rows = await db
    .select({
      id: projectFeatures.id,
      title: projectFeatures.title,
      description: projectFeatures.description,
      codePaths: projectFeatures.codePaths,
      projectId: projects.id,
      projectName: projects.name,
      projectSlug: projects.slug,
      repoUrl: projects.repoUrl,
    })
    .from(projectFeatures)
    .innerJoin(projects, eq(projects.id, projectFeatures.projectId))
    .where(
      and(
        eq(projects.userId, userId),
        eq(projects.slug, projectSlug),
        isNull(projectFeatures.excludedAt),
      ),
    );
  const match = rows.find((r) => slugify(r.title) === featureKey);
  return match
    ? { ...match, codePaths: match.codePaths as Record<string, string> | null }
    : null;
}

/** Idempotency check — an existing portfolio card already covering this
 *  feature, if any. `ensureVisualProof` (scripts/content.ts) never
 *  regenerates when this returns non-null. */
export async function findCardForFeature(
  userId: string,
  featureId: string,
): Promise<ContentItem | null> {
  const [row] = await db
    .select({ item: contentItems })
    .from(contentSources)
    .innerJoin(contentItems, eq(contentItems.id, contentSources.contentItemId))
    .where(
      and(
        eq(contentSources.userId, userId),
        eq(contentSources.sourceType, "project_feature"),
        eq(contentSources.sourceId, featureId),
        eq(contentItems.platform, "portfolio"),
      ),
    )
    .limit(1);
  return row?.item ?? null;
}

/** Every portfolio card covering this feature — a feature can have more than
 *  one (a UI-view card + a terminal/code-view card forming one "cycle"). */
export async function findCardsForFeature(
  userId: string,
  featureId: string,
): Promise<ContentItem[]> {
  const rows = await db
    .select({ item: contentItems })
    .from(contentSources)
    .innerJoin(contentItems, eq(contentItems.id, contentSources.contentItemId))
    .where(
      and(
        eq(contentSources.userId, userId),
        eq(contentSources.sourceType, "project_feature"),
        eq(contentSources.sourceId, featureId),
        eq(contentItems.platform, "portfolio"),
      ),
    );
  return rows.map((r) => r.item);
}

export type CardRole = "ui" | "terminal";

/** UI-view cards are tagged by a `-ui` cloudinaryPublicId suffix (see
 *  scripts/content.ts's `browser` command); everything else (diagram,
 *  register, the original terminal command) counts as "terminal" — no
 *  schema migration needed, just a naming convention. Lets a UI card and a
 *  terminal card coexist per feature without either command re-triggering
 *  the other. */
export async function findCardForFeatureRole(
  userId: string,
  featureId: string,
  role: CardRole,
): Promise<ContentItem | null> {
  const cards = await findCardsForFeature(userId, featureId);
  const isUi = (c: ContentItem) => (c.cloudinaryPublicId ?? "").endsWith("-ui");
  return cards.find((c) => (role === "ui" ? isUi(c) : !isUi(c))) ?? null;
}

export interface MissingVisualProof {
  featureId: string;
  featureKey: string;
  title: string;
  description: string | null;
  projectSlug: string;
  projectName: string;
}

/** Every shipped, public feature that has no portfolio card yet — the
 *  "what's missing" scan behind `pnpm content missing`. */
export async function listMissingVisualProof(
  userId: string,
  projectSlug?: string,
): Promise<MissingVisualProof[]> {
  const rows = await db
    .select({
      featureId: projectFeatures.id,
      title: projectFeatures.title,
      description: projectFeatures.description,
      projectSlug: projects.slug,
      projectName: projects.name,
    })
    .from(projectFeatures)
    .innerJoin(projects, eq(projects.id, projectFeatures.projectId))
    .where(
      and(
        eq(projects.userId, userId),
        eq(projects.isPublic, true),
        eq(projectFeatures.status, "done"),
        isNull(projects.excludedAt),
        isNull(projectFeatures.excludedAt),
        projectSlug ? eq(projects.slug, projectSlug) : undefined,
      ),
    );
  if (rows.length === 0) return [];

  const featureIds = rows.map((r) => r.featureId);
  const covered = await db
    .select({ featureId: contentSources.sourceId })
    .from(contentSources)
    .innerJoin(contentItems, eq(contentItems.id, contentSources.contentItemId))
    .where(
      and(
        eq(contentSources.userId, userId),
        eq(contentSources.sourceType, "project_feature"),
        inArray(contentSources.sourceId, featureIds),
        eq(contentItems.platform, "portfolio"),
      ),
    );
  const coveredIds = new Set(covered.map((c) => c.featureId).filter((x): x is string => !!x));

  return rows
    .filter((r) => !coveredIds.has(r.featureId))
    .map((r) => ({ ...r, featureKey: slugify(r.title) }));
}

/** Shipped features whose project has a `liveUrl` set (the deterministic
 *  "does this project have a real UI to screenshot" signal) but that only
 *  have a terminal/code card so far — the other half of each proof cycle. */
export async function listMissingUiProof(
  userId: string,
  projectSlug?: string,
): Promise<MissingVisualProof[]> {
  const rows = await db
    .select({
      featureId: projectFeatures.id,
      title: projectFeatures.title,
      description: projectFeatures.description,
      projectSlug: projects.slug,
      projectName: projects.name,
    })
    .from(projectFeatures)
    .innerJoin(projects, eq(projects.id, projectFeatures.projectId))
    .where(
      and(
        eq(projects.userId, userId),
        eq(projects.isPublic, true),
        eq(projectFeatures.status, "done"),
        isNotNull(projects.liveUrl),
        isNull(projects.excludedAt),
        isNull(projectFeatures.excludedAt),
        projectSlug ? eq(projects.slug, projectSlug) : undefined,
      ),
    );
  if (rows.length === 0) return [];

  const withUi: MissingVisualProof[] = [];
  for (const r of rows) {
    const cards = await findCardsForFeature(userId, r.featureId);
    if (cards.length === 0) continue; // listMissingVisualProof already covers "no card at all"
    const hasUi = cards.some((c) => (c.cloudinaryPublicId ?? "").endsWith("-ui"));
    if (!hasUi) withUi.push({ ...r, featureKey: slugify(r.title) });
  }
  return withUi;
}
