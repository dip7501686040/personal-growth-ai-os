import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  approvals,
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
};

export async function listSkills(userId: string): Promise<SkillWithCounts[]> {
  const rows = await db
    .select({
      skill: skills,
      evidenceCount: sql<number>`count(${skillEvidence.id})::int`,
      acceptedCount: sql<number>`count(*) filter (where ${skillEvidence.status} = 'accepted')::int`,
      suggestedCount: sql<number>`count(*) filter (where ${skillEvidence.status} = 'suggested')::int`,
    })
    .from(skills)
    .leftJoin(skillEvidence, eq(skillEvidence.skillId, skills.id))
    .where(eq(skills.userId, userId))
    .groupBy(skills.id)
    .orderBy(skills.category, desc(skills.level), skills.name);

  return rows.map((r) => ({
    ...r.skill,
    evidenceCount: r.evidenceCount,
    acceptedCount: r.acceptedCount,
    suggestedCount: r.suggestedCount,
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
    .select({ id: skills.id, name: skills.name })
    .from(skills)
    .where(eq(skills.userId, userId));
  const byLower = new Map(rows.map((r) => [r.name.toLowerCase(), r.id]));
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
