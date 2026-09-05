import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  contentItems,
  entitySkillLinks,
  learningSessions,
  learningSessionSkills,
  projectFeatures,
  projects,
  projectSkills,
  type EntitySkillLink,
} from "@/lib/db/schema";
import { resolveSkillIdsByName } from "@/modules/skills/service";
import { matchSkillsAndFeatures } from "./mapping/entity-candidates";

export type EntitySkillSourceType =
  | "career_opportunity"
  | "content_item"
  | "business_opportunity";

export interface LinkEntityResult {
  candidates: number;
  inserted: number;
  updated: number;
  removed: number;
}

/**
 * (Re)compute one career/content/business item's matches against the user's
 * skills and project features, and replace its rows wholesale. Unlike
 * `mapDocument` (which never touches a link once a human has reviewed it),
 * this table is a fully derived cache with no review state — safe, and
 * intended, to fully recompute every time the source's own text changes.
 */
export async function linkEntityToSkills(
  userId: string,
  sourceType: EntitySkillSourceType,
  sourceId: string,
  text: string,
): Promise<LinkEntityResult> {
  const scored = await matchSkillsAndFeatures(userId, text);

  const existing = await db
    .select({
      id: entitySkillLinks.id,
      targetType: entitySkillLinks.targetType,
      targetId: entitySkillLinks.targetId,
    })
    .from(entitySkillLinks)
    .where(
      and(
        eq(entitySkillLinks.sourceType, sourceType),
        eq(entitySkillLinks.sourceId, sourceId),
      ),
    );
  const existingByKey = new Map(
    existing.map((e) => [`${e.targetType}:${e.targetId}`, e.id]),
  );

  let inserted = 0;
  let updated = 0;
  const freshKeys = new Set<string>();
  for (const c of scored) {
    const key = `${c.targetType}:${c.targetId}`;
    freshKeys.add(key);
    const existingId = existingByKey.get(key);
    if (existingId) {
      await db
        .update(entitySkillLinks)
        .set({ score: c.score, method: c.method, updatedAt: new Date() })
        .where(eq(entitySkillLinks.id, existingId));
      updated++;
    } else {
      await db
        .insert(entitySkillLinks)
        .values({
          userId,
          sourceType,
          sourceId,
          targetType: c.targetType,
          targetId: c.targetId,
          score: c.score,
          method: c.method,
        })
        .onConflictDoNothing({
          target: [
            entitySkillLinks.sourceType,
            entitySkillLinks.sourceId,
            entitySkillLinks.targetType,
            entitySkillLinks.targetId,
          ],
        });
      inserted++;
    }
  }

  const staleIds = existing
    .filter((e) => !freshKeys.has(`${e.targetType}:${e.targetId}`))
    .map((e) => e.id);
  if (staleIds.length > 0) {
    await db.delete(entitySkillLinks).where(inArray(entitySkillLinks.id, staleIds));
  }

  return { candidates: scored.length, inserted, updated, removed: staleIds.length };
}

export function getEntitySkillLinks(
  userId: string,
  sourceType: EntitySkillSourceType,
  sourceId: string,
): Promise<EntitySkillLink[]> {
  return db
    .select()
    .from(entitySkillLinks)
    .where(
      and(
        eq(entitySkillLinks.userId, userId),
        eq(entitySkillLinks.sourceType, sourceType),
        eq(entitySkillLinks.sourceId, sourceId),
      ),
    );
}

export interface ProofOfWorkItem {
  featureId: string;
  featureTitle: string;
  projectName: string;
  projectSlug: string;
  status: string;
  role: string;
}

/**
 * Pure join over `project_skills` — the exact, structural "this feature
 * proves this skill" link (no matching needed, unlike entity_skill_links).
 * Only `used`/`demonstrated` roles count as proof; `planned` doesn't.
 */
export async function getProofOfWork(
  userId: string,
  skillIds: string[],
): Promise<Map<string, ProofOfWorkItem[]>> {
  const out = new Map<string, ProofOfWorkItem[]>();
  if (skillIds.length === 0) return out;

  const rows = await db
    .select({
      skillId: projectSkills.skillId,
      role: projectSkills.role,
      featureId: projectFeatures.id,
      featureTitle: projectFeatures.title,
      status: projectFeatures.status,
      projectName: projects.name,
      projectSlug: projects.slug,
    })
    .from(projectSkills)
    .innerJoin(projectFeatures, eq(projectFeatures.id, projectSkills.featureId))
    .innerJoin(projects, eq(projects.id, projectFeatures.projectId))
    .where(
      and(
        eq(projectSkills.userId, userId),
        inArray(projectSkills.skillId, skillIds),
        inArray(projectSkills.role, ["used", "demonstrated"]),
      ),
    );

  for (const r of rows) {
    const arr = out.get(r.skillId) ?? [];
    arr.push({
      featureId: r.featureId,
      featureTitle: r.featureTitle,
      projectName: r.projectName,
      projectSlug: r.projectSlug,
      status: r.status,
      role: r.role,
    });
    out.set(r.skillId, arr);
  }
  return out;
}

export interface ProofOfWorkBySkill {
  skillName: string;
  features: ProofOfWorkItem[];
}

/** `getProofOfWork`, but starting from loose skill *names* (career's
 *  provenMatches/implementedMatches, business's tech_stack) — the display
 *  version used on the opportunity detail pages. */
export async function getProofOfWorkByNames(
  userId: string,
  skillNames: string[],
): Promise<ProofOfWorkBySkill[]> {
  const ids = await resolveSkillIdsByName(userId, skillNames);
  const proof = await getProofOfWork(userId, [...ids.values()]);
  return [...ids.entries()].map(([name, id]) => ({
    skillName: name,
    features: proof.get(id) ?? [],
  }));
}

export interface RelatedEntities {
  content: { id: string; title: string; status: string }[];
  learning: { id: string; topic: string; category: string }[];
}

/**
 * Cross-module relevance bridge (HLD §6): two entities that share a row in
 * `entity_skill_links` (or, for learning, `learning_session_skills`) share a
 * skill or project feature — surfaced here as "related content" / "related
 * learning" for a career or business opportunity. `sourceType`/`sourceId`
 * identify the entity being looked up *from*; it's excluded from its own
 * "related content" when that happens to be a content item too.
 */
export async function getRelatedEntities(
  userId: string,
  sourceType: EntitySkillSourceType,
  sourceId: string,
): Promise<RelatedEntities> {
  const own = await getEntitySkillLinks(userId, sourceType, sourceId);
  if (own.length === 0) return { content: [], learning: [] };

  const targetConds = own.map((l) =>
    and(eq(entitySkillLinks.targetType, l.targetType), eq(entitySkillLinks.targetId, l.targetId)),
  );
  const skillIds = own.filter((l) => l.targetType === "skill").map((l) => l.targetId);

  const contentRows = await db
    .select({ id: contentItems.id, title: contentItems.title, status: contentItems.status })
    .from(entitySkillLinks)
    .innerJoin(contentItems, eq(contentItems.id, entitySkillLinks.sourceId))
    .where(
      and(
        eq(entitySkillLinks.userId, userId),
        eq(entitySkillLinks.sourceType, "content_item"),
        or(...targetConds),
      ),
    );
  const contentById = new Map(
    contentRows
      .filter((r) => !(sourceType === "content_item" && r.id === sourceId))
      .map((r) => [r.id, r]),
  );

  const learning: RelatedEntities["learning"] = [];
  if (skillIds.length > 0) {
    const learningRows = await db
      .select({
        id: learningSessions.id,
        topic: learningSessions.topic,
        category: learningSessions.category,
        occurredAt: learningSessions.occurredAt,
      })
      .from(learningSessionSkills)
      .innerJoin(learningSessions, eq(learningSessions.id, learningSessionSkills.sessionId))
      .where(
        and(
          eq(learningSessions.userId, userId),
          inArray(learningSessionSkills.skillId, skillIds),
        ),
      );
    const byId = new Map(learningRows.map((r) => [r.id, r]));
    learning.push(
      ...[...byId.values()]
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
        .slice(0, 10)
        .map((r) => ({ id: r.id, topic: r.topic, category: r.category })),
    );
  }

  return { content: [...contentById.values()].slice(0, 10), learning };
}
