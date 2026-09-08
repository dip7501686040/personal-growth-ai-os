import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  approvals,
  entityEmbeddings,
  entitySkillLinks,
  knowledgeLinks,
  skillEvidence,
  skills,
  type Skill,
  type SkillEvidence,
} from "@/lib/db/schema";
import { slugify } from "@/lib/slug";
import { recordContextEvent } from "@/modules/context/events";
import { LEVEL_LABEL, type SkillCategory, type SkillLevel } from "./levels";
import {
  deriveLevel,
  planLevelChange,
  type EvidenceLike,
  type EvidenceSourceType,
} from "./progression";
import type { EvidenceStrength } from "./levels";

function toEvidenceLike(rows: SkillEvidence[]): EvidenceLike[] {
  return rows.map((r) => ({
    id: r.id,
    sourceType: r.sourceType as EvidenceSourceType,
    sourceId: r.sourceId,
    supportsLevel: r.supportsLevel as SkillLevel,
    strength: r.strength as EvidenceStrength,
  }));
}

export type SkillWithCounts = Skill & {
  evidenceCount: number;
  acceptedCount: number;
  suggestedCount: number;
  /** how many skills have this one as their `parentId` */
  childCount: number;
};

/**
 * @param opts.includeExcluded  include "skipped" skills (`excluded_at` set).
 *   Default false — only management UIs (the /skills page) pass true. Every
 *   read that feeds AI / job search / proof / public output must use the
 *   default. See docs/system-design.md §"Exclusion invariant".
 */
export async function listSkills(
  userId: string,
  opts?: { includeExcluded?: boolean },
): Promise<SkillWithCounts[]> {
  const child = sql<number>`(select count(*) from ${skills} c where c.parent_id = ${skills.id})::int`;
  const rows = await db
    .select({
      skill: skills,
      evidenceCount: sql<number>`count(${skillEvidence.id})::int`,
      acceptedCount: sql<number>`count(*) filter (where ${skillEvidence.status} = 'accepted')::int`,
      suggestedCount: sql<number>`count(*) filter (where ${skillEvidence.status} = 'suggested')::int`,
      childCount: child,
    })
    .from(skills)
    .leftJoin(skillEvidence, eq(skillEvidence.skillId, skills.id))
    .where(
      and(
        eq(skills.userId, userId),
        opts?.includeExcluded ? undefined : isNull(skills.excludedAt),
      ),
    )
    .groupBy(skills.id)
    .orderBy(skills.category, desc(skills.level), skills.name);

  return rows.map((r) => ({
    ...r.skill,
    evidenceCount: r.evidenceCount,
    acceptedCount: r.acceptedCount,
    suggestedCount: r.suggestedCount,
    childCount: r.childCount,
  }));
}

/**
 * Resolve loosely-named skill mentions (e.g. a business opportunity's
 * `tech_stack`, or a career match's `provenMatches`/`implementedMatches`,
 * both string[] of skill *names*, not ids) to real skill ids — the first
 * step before `getProofOfWork` can do anything with them. Case-insensitive;
 * names with no matching skill are simply absent from the result.
 */
export async function resolveSkillIdsByName(
  userId: string,
  names: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (names.length === 0) return out;
  const rows = await db
    .select({ id: skills.id, name: skills.name, label: skills.label })
    .from(skills)
    .where(and(eq(skills.userId, userId), isNull(skills.excludedAt)));
  const byLower = new Map<string, string>();
  for (const r of rows) {
    byLower.set(r.name.toLowerCase(), r.id);
    if (r.label) byLower.set(r.label.toLowerCase(), r.id);
  }
  for (const name of names) {
    const id = byLower.get(name.toLowerCase());
    if (id) out.set(name, id);
  }
  return out;
}

export async function getSkillById(
  userId: string,
  skillId: string,
): Promise<Skill | null> {
  const [row] = await db
    .select()
    .from(skills)
    .where(and(eq(skills.userId, userId), eq(skills.id, skillId)))
    .limit(1);
  return row ?? null;
}

export async function getSkillBySlug(
  userId: string,
  slug: string,
): Promise<{ skill: Skill; evidence: SkillEvidence[] } | null> {
  const [skill] = await db
    .select()
    .from(skills)
    .where(and(eq(skills.userId, userId), eq(skills.slug, slug)))
    .limit(1);
  if (!skill) return null;

  const evidence = await db
    .select()
    .from(skillEvidence)
    .where(
      and(
        eq(skillEvidence.userId, userId),
        eq(skillEvidence.skillId, skill.id),
      ),
    )
    .orderBy(desc(skillEvidence.createdAt));

  return { skill, evidence };
}

export async function createSkill(
  userId: string,
  input: { name: string; category: SkillCategory; notes?: string },
): Promise<Skill> {
  const slug = slugify(input.name);
  const [existing] = await db
    .select({ id: skills.id })
    .from(skills)
    .where(and(eq(skills.userId, userId), eq(skills.slug, slug)))
    .limit(1);
  if (existing) {
    throw new Error(`A skill "${input.name}" already exists.`);
  }

  const [row] = await db
    .insert(skills)
    .values({
      userId,
      name: input.name.trim(),
      slug,
      category: input.category,
      notes: input.notes?.trim() || null,
      level: "interested",
      confidence: 0,
    })
    .returning();
  return row;
}

/** Returns the skill with this name (by slug), creating it if absent. */
export async function upsertSkillByName(
  userId: string,
  name: string,
  category: SkillCategory,
): Promise<Skill> {
  const slug = slugify(name);
  const [existing] = await db
    .select()
    .from(skills)
    .where(and(eq(skills.userId, userId), eq(skills.slug, slug)))
    .limit(1);
  if (existing) return existing;

  const [row] = await db
    .insert(skills)
    .values({ userId, name: name.trim(), slug, category })
    .onConflictDoNothing({ target: [skills.userId, skills.slug] })
    .returning();
  if (row) return row;

  const [after] = await db
    .select()
    .from(skills)
    .where(and(eq(skills.userId, userId), eq(skills.slug, slug)))
    .limit(1);
  return after;
}

/** Recomputes level + confidence from accepted evidence. */
export async function recomputeSkill(
  userId: string,
  skillId: string,
): Promise<Skill> {
  const [before] = await db
    .select({ level: skills.level })
    .from(skills)
    .where(and(eq(skills.userId, userId), eq(skills.id, skillId)))
    .limit(1);

  const accepted = await db
    .select()
    .from(skillEvidence)
    .where(
      and(
        eq(skillEvidence.userId, userId),
        eq(skillEvidence.skillId, skillId),
        eq(skillEvidence.status, "accepted"),
      ),
    );

  const derived = deriveLevel(toEvidenceLike(accepted));
  const [row] = await db
    .update(skills)
    .set({
      level: derived.level,
      confidence: derived.confidence,
      updatedAt: new Date(),
      lastActivityAt: new Date(),
    })
    .where(and(eq(skills.userId, userId), eq(skills.id, skillId)))
    .returning();

  if (before && before.level !== row.level) {
    await recordContextEvent({
      userId,
      kind: "skill_changed",
      refId: skillId,
      payload: { from: before.level, to: row.level },
    });
  }
  return row;
}

/**
 * "Skip" / un-skip a skill. A skipped skill (`excluded_at` set) drops out of
 * every read that feeds AI, job search, proof-of-work, or public output — only
 * the /skills management view still shows it. On skip we also purge its cached
 * graph edges (`entity_embeddings` + not-yet-reviewed `knowledge_links`) so
 * stale kNN hits can't leak it; on un-skip the next embedding backfill /
 * `/sync-repo` run rebuilds them.
 */
export async function setSkillExcluded(
  userId: string,
  skillId: string,
  excluded: boolean,
): Promise<void> {
  const [row] = await db
    .update(skills)
    .set({ excludedAt: excluded ? new Date() : null, updatedAt: new Date() })
    .where(and(eq(skills.userId, userId), eq(skills.id, skillId)))
    .returning({ id: skills.id });
  if (!row) throw new Error("Skill not found.");

  if (excluded) {
    await db
      .delete(entityEmbeddings)
      .where(
        and(
          eq(entityEmbeddings.userId, userId),
          eq(entityEmbeddings.targetType, "skill"),
          eq(entityEmbeddings.targetId, skillId),
        ),
      );
    await db
      .delete(knowledgeLinks)
      .where(
        and(
          eq(knowledgeLinks.userId, userId),
          eq(knowledgeLinks.targetType, "skill"),
          eq(knowledgeLinks.targetId, skillId),
          eq(knowledgeLinks.status, "suggested"),
        ),
      );
    await db
      .delete(entitySkillLinks)
      .where(
        and(
          eq(entitySkillLinks.userId, userId),
          eq(entitySkillLinks.targetType, "skill"),
          eq(entitySkillLinks.targetId, skillId),
        ),
      );
  }

  await recordContextEvent({
    userId,
    kind: "skill_changed",
    refId: skillId,
    payload: { excluded },
  });
}

// ── Label / parent / merge (skill-graph-manager Phase 4) ──────────────────

/** Rename the *display* label only. Never touches `name`/`slug` or any link,
 *  so name-matching and evidence joins are unaffected. `label = null` reverts
 *  to showing `name`. */
export async function updateSkillLabel(
  userId: string,
  skillId: string,
  label: string | null,
): Promise<void> {
  const clean = label?.trim() || null;
  const [row] = await db
    .update(skills)
    .set({ label: clean, updatedAt: new Date() })
    .where(and(eq(skills.userId, userId), eq(skills.id, skillId)))
    .returning({ id: skills.id });
  if (!row) throw new Error("Skill not found.");
}

/** Move a skill to a different category (browsing/grouping only — category is
 *  part of the entity's embed text, so this records a context event). */
export async function updateSkillCategory(
  userId: string,
  skillId: string,
  category: SkillCategory,
): Promise<void> {
  const [row] = await db
    .update(skills)
    .set({ category, updatedAt: new Date() })
    .where(and(eq(skills.userId, userId), eq(skills.id, skillId)))
    .returning({ id: skills.id });
  if (!row) throw new Error("Skill not found.");
  await recordContextEvent({ userId, kind: "skill_changed", refId: skillId });
}

/**
 * Set (or clear, with `null`) a skill's parent. Grouping is **one level only**:
 * the parent must itself be top-level, and a skill that already has children
 * cannot be made a child.
 */
export async function setSkillParent(
  userId: string,
  skillId: string,
  parentId: string | null,
): Promise<void> {
  if (parentId === skillId) throw new Error("A skill can't be its own parent.");

  const ids = parentId ? [skillId, parentId] : [skillId];
  const rows = await db
    .select({ id: skills.id, parentId: skills.parentId })
    .from(skills)
    .where(and(eq(skills.userId, userId), inArray(skills.id, ids)));
  const self = rows.find((r) => r.id === skillId);
  if (!self) throw new Error("Skill not found.");

  if (parentId) {
    const parent = rows.find((r) => r.id === parentId);
    if (!parent) throw new Error("Parent skill not found.");
    if (parent.parentId) {
      throw new Error("Grouping is one level deep — that parent is itself a child.");
    }
    const [{ n: kids }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(skills)
      .where(and(eq(skills.userId, userId), eq(skills.parentId, skillId)));
    if (kids > 0) {
      throw new Error("This skill has children — move them out before nesting it.");
    }
  }

  await db
    .update(skills)
    .set({ parentId, updatedAt: new Date() })
    .where(and(eq(skills.userId, userId), eq(skills.id, skillId)));

  await recordContextEvent({ userId, kind: "skill_changed", refId: skillId });
}

/** Create a new skill already nested under `parentId` (one level). */
export async function createChildSkill(
  userId: string,
  parentId: string,
  input: { name: string; label?: string; category: SkillCategory },
): Promise<Skill> {
  const [parent] = await db
    .select({ id: skills.id, parentId: skills.parentId })
    .from(skills)
    .where(and(eq(skills.userId, userId), eq(skills.id, parentId)))
    .limit(1);
  if (!parent) throw new Error("Parent skill not found.");
  if (parent.parentId) {
    throw new Error("Grouping is one level deep — that parent is itself a child.");
  }

  const slug = slugify(input.name);
  const [existing] = await db
    .select({ id: skills.id })
    .from(skills)
    .where(and(eq(skills.userId, userId), eq(skills.slug, slug)))
    .limit(1);
  if (existing) throw new Error(`A skill "${input.name}" already exists.`);

  const [row] = await db
    .insert(skills)
    .values({
      userId,
      name: input.name.trim(),
      slug,
      label: input.label?.trim() || null,
      category: input.category,
      parentId,
    })
    .returning();
  await recordContextEvent({ userId, kind: "skill_changed", refId: row.id });
  return row;
}

export interface MergePreview {
  target: { id: string; name: string };
  sources: { id: string; name: string }[];
  evidence: number;
  projectLinks: number;
  learningLinks: number;
  knowledgeLinks: number;
  entitySkillLinks: number;
  children: number;
  pendingApprovals: number;
}

/** Counts of what `mergeSkills(target, sources)` will move, for a confirm dialog. */
export async function getMergePreview(
  userId: string,
  targetId: string,
  sourceIds: string[],
): Promise<MergePreview> {
  const sources = [...new Set(sourceIds)].filter((id) => id && id !== targetId);
  if (sources.length === 0) throw new Error("Pick at least one other skill to merge.");

  const rows = await db
    .select({ id: skills.id, name: skills.name })
    .from(skills)
    .where(and(eq(skills.userId, userId), inArray(skills.id, [targetId, ...sources])));
  const target = rows.find((r) => r.id === targetId);
  if (!target) throw new Error("Target skill not found.");
  const foundSources = rows.filter((r) => r.id !== targetId);
  if (foundSources.length !== sources.length) throw new Error("Some skills not found.");

  const one = async (n: ReturnType<typeof sql<number>>) =>
    (await db.select({ n }).from(skills).where(eq(skills.id, targetId)).limit(1))[0]?.n ?? 0;

  const inSrc = sql.join(sources.map((s) => sql`${s}`), sql`, `);
  const [ev, pl, ll, kl, esl, kids, appr] = await Promise.all([
    one(sql<number>`(select count(*) from skill_evidence where user_id = ${userId} and skill_id in (${inSrc}))::int`),
    one(sql<number>`(select count(*) from project_skills where user_id = ${userId} and skill_id in (${inSrc}))::int`),
    one(sql<number>`(select count(*) from learning_session_skills where skill_id in (${inSrc}))::int`),
    one(sql<number>`(select count(*) from knowledge_links where user_id = ${userId} and target_type = 'skill' and target_id in (${inSrc}))::int`),
    one(sql<number>`(select count(*) from entity_skill_links where user_id = ${userId} and target_type = 'skill' and target_id in (${inSrc}))::int`),
    one(sql<number>`(select count(*) from skills where user_id = ${userId} and parent_id in (${inSrc}))::int`),
    one(sql<number>`(select count(*) from approvals where user_id = ${userId} and status = 'pending' and action_type = 'promote_skill' and (context->>'skillId') in (${inSrc}))::int`),
  ]);

  return {
    target: { id: target.id, name: target.name },
    sources: foundSources,
    evidence: ev,
    projectLinks: pl,
    learningLinks: ll,
    knowledgeLinks: kl,
    entitySkillLinks: esl,
    children: kids,
    pendingApprovals: appr,
  };
}

/**
 * Fold `sourceIds` into `targetId`: every evidence row, project-skill link,
 * learning link, knowledge link and entity-skill link that pointed at a source
 * is re-pointed to the target (de-duped where a unique key would collide),
 * the sources' child skills are re-parented, pending promote_skill approvals
 * for a source are cancelled, and the source `skills` rows are deleted.
 * One transaction. Then the target's level is recomputed.
 */
export async function mergeSkills(
  userId: string,
  targetId: string,
  sourceIds: string[],
): Promise<{ merged: number }> {
  const sources = [...new Set(sourceIds)].filter((id) => id && id !== targetId);
  if (sources.length === 0) throw new Error("Pick at least one other skill to merge.");

  const rows = await db
    .select({ id: skills.id, parentId: skills.parentId })
    .from(skills)
    .where(and(eq(skills.userId, userId), inArray(skills.id, [targetId, ...sources])));
  const target = rows.find((r) => r.id === targetId);
  if (!target) throw new Error("Target skill not found.");
  if (rows.length !== sources.length + 1) throw new Error("Some skills not found.");

  // keep grouping one level deep: children land under the target's own parent
  // if the target is itself a child, else under the target.
  const childParent = target.parentId ?? targetId;
  const inSrc = sql.join(sources.map((s) => sql`${s}`), sql`, `);

  await db.transaction(async (tx) => {
    // 1a. skill_evidence — no unique key on (skill, …); straight re-point
    await tx.execute(
      sql`update skill_evidence set skill_id = ${targetId} where user_id = ${userId} and skill_id in (${inSrc})`,
    );
    // 1b. project_skills — re-point, then drop rows duplicated on (project, feature, skill)
    await tx.execute(
      sql`update project_skills set skill_id = ${targetId} where user_id = ${userId} and skill_id in (${inSrc})`,
    );
    await tx.execute(sql`
      delete from project_skills a using project_skills b
      where a.user_id = ${userId} and a.skill_id = ${targetId} and b.skill_id = ${targetId}
        and a.project_id = b.project_id
        and a.feature_id is not distinct from b.feature_id
        and a.id > b.id
    `);
    // 1c. learning_session_skills — composite PK (session, skill): drop collisions, then re-point
    await tx.execute(sql`
      delete from learning_session_skills where skill_id in (${inSrc})
        and session_id in (select session_id from learning_session_skills where skill_id = ${targetId})
    `);
    await tx.execute(
      sql`update learning_session_skills set skill_id = ${targetId} where skill_id in (${inSrc})`,
    );
    // 2a. knowledge_links — unique (document_id, target_type, target_id)
    await tx.execute(sql`
      delete from knowledge_links where user_id = ${userId} and target_type = 'skill' and target_id in (${inSrc})
        and document_id in (
          select document_id from knowledge_links
          where user_id = ${userId} and target_type = 'skill' and target_id = ${targetId}
        )
    `);
    await tx.execute(sql`
      update knowledge_links set target_id = ${targetId}
      where user_id = ${userId} and target_type = 'skill' and target_id in (${inSrc})
    `);
    // 2b. entity_skill_links — unique (source_type, source_id, target_type, target_id)
    await tx.execute(sql`
      delete from entity_skill_links where user_id = ${userId} and target_type = 'skill' and target_id in (${inSrc})
        and (source_type, source_id) in (
          select source_type, source_id from entity_skill_links
          where user_id = ${userId} and target_type = 'skill' and target_id = ${targetId}
        )
    `);
    await tx.execute(sql`
      update entity_skill_links set target_id = ${targetId}
      where user_id = ${userId} and target_type = 'skill' and target_id in (${inSrc})
    `);
    // 3. entity_embeddings — just drop the source rows (target keeps its own)
    await tx.execute(sql`
      delete from entity_embeddings where user_id = ${userId} and target_type = 'skill' and target_id in (${inSrc})
    `);
    // 4. re-parent the sources' children (one level deep, see childParent)
    await tx.execute(sql`
      update skills set parent_id = ${childParent}, updated_at = now()
      where user_id = ${userId} and parent_id in (${inSrc})
    `);
    // 5. cancel pending promote_skill approvals that referenced a source
    await tx.execute(sql`
      update approvals set status = 'rejected', decided_at = now(),
        feedback = coalesce(feedback, '') || ' [auto: skill merged away]'
      where user_id = ${userId} and status = 'pending' and action_type = 'promote_skill'
        and (context->>'skillId') in (${inSrc})
    `);
    // 6. delete the source skills
    await tx.execute(
      sql`delete from skills where user_id = ${userId} and id in (${inSrc})`,
    );
  });

  await recomputeSkill(userId, targetId);
  await recordContextEvent({
    userId,
    kind: "skill_changed",
    refId: targetId,
    payload: { merged: sources.length },
  });
  return { merged: sources.length };
}

export async function addEvidence(
  userId: string,
  skillId: string,
  input: {
    summary: string;
    detail?: string;
    sourceType?: EvidenceSourceType;
    sourceId?: string | null;
    supportsLevel: SkillLevel;
    strength: EvidenceStrength;
    status?: "suggested" | "accepted";
    createdBy?: "user" | "agent";
    agentRunId?: string | null;
  },
): Promise<SkillEvidence> {
  const status = input.status ?? "accepted";
  const [row] = await db
    .insert(skillEvidence)
    .values({
      userId,
      skillId,
      sourceType: input.sourceType ?? "manual",
      sourceId: input.sourceId ?? null,
      summary: input.summary.trim(),
      detail: input.detail?.trim() || null,
      strength: input.strength,
      supportsLevel: input.supportsLevel,
      status,
      createdBy: input.createdBy ?? "user",
      agentRunId: input.agentRunId ?? null,
      decidedAt: status === "accepted" ? new Date() : null,
    })
    .returning();

  if (status === "accepted") {
    await recomputeSkill(userId, skillId);
  }
  return row;
}

export async function setEvidenceStatus(
  userId: string,
  evidenceId: string,
  status: "accepted" | "rejected",
): Promise<void> {
  const [row] = await db
    .update(skillEvidence)
    .set({ status, decidedAt: new Date() })
    .where(
      and(
        eq(skillEvidence.userId, userId),
        eq(skillEvidence.id, evidenceId),
      ),
    )
    .returning({ skillId: skillEvidence.skillId });
  if (row) await recomputeSkill(userId, row.skillId);
}

/** Count of not-yet-reviewed evidence across all skills (drives the /skills banner). */
export async function countSuggestedEvidence(userId: string): Promise<number> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(skillEvidence)
    .where(
      and(
        eq(skillEvidence.userId, userId),
        eq(skillEvidence.status, "suggested"),
      ),
    );
  return n;
}

/** Accept every suggested evidence row (used after a repo sync). Recomputes
 *  each affected skill's level once. Returns how many were accepted. */
export async function acceptAllSuggestedEvidence(
  userId: string,
): Promise<number> {
  const rows = await db
    .update(skillEvidence)
    .set({ status: "accepted", decidedAt: new Date() })
    .where(
      and(
        eq(skillEvidence.userId, userId),
        eq(skillEvidence.status, "suggested"),
      ),
    )
    .returning({ skillId: skillEvidence.skillId });
  for (const skillId of new Set(rows.map((r) => r.skillId))) {
    await recomputeSkill(userId, skillId);
  }
  return rows.length;
}

export type LevelChangeResult =
  | { applied: true }
  | { applied: false; approvalId: string };

export async function requestLevelChange(
  userId: string,
  skillId: string,
  targetLevel: SkillLevel,
  justification: string,
): Promise<LevelChangeResult> {
  const skill = await getSkillById(userId, skillId);
  if (!skill) throw new Error("Skill not found.");

  const acceptedRows = await db
    .select()
    .from(skillEvidence)
    .where(
      and(
        eq(skillEvidence.userId, userId),
        eq(skillEvidence.skillId, skillId),
        eq(skillEvidence.status, "accepted"),
      ),
    );

  const plan = planLevelChange(toEvidenceLike(acceptedRows), targetLevel);
  const note = justification.trim();

  if (plan.kind === "apply") {
    await addEvidence(userId, skillId, {
      summary: `Level set to ${LEVEL_LABEL[targetLevel]}`,
      detail: note || plan.note,
      sourceType: "manual",
      supportsLevel: targetLevel,
      strength: "strong",
      status: "accepted",
      createdBy: "user",
    });
    return { applied: true };
  }

  // Needs approval: park a suggested evidence row and raise an approval.
  const [ev] = await db
    .insert(skillEvidence)
    .values({
      userId,
      skillId,
      sourceType: "manual",
      summary: `Requested level: ${LEVEL_LABEL[targetLevel]}`,
      detail: note || null,
      strength: "strong",
      supportsLevel: targetLevel,
      status: "suggested",
      createdBy: "user",
    })
    .returning();

  const [ap] = await db
    .insert(approvals)
    .values({
      userId,
      actionType: "promote_skill",
      title: `Promote "${skill.name}" to ${LEVEL_LABEL[targetLevel]}`,
      reason: note ? `${plan.note}\n\nYour note: ${note}` : plan.note,
      context: {
        skillId,
        evidenceId: ev.id,
        fromLevel: skill.level,
        toLevel: targetLevel,
      },
      expectedOutcome: `"${skill.name}" becomes ${LEVEL_LABEL[targetLevel]} once this evidence is accepted.`,
      status: "pending",
    })
    .returning();

  return { applied: false, approvalId: ap.id };
}
