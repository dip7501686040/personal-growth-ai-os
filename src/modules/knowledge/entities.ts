import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  businessOpportunities,
  careerOpportunities,
  contentItems,
  dsaPatterns,
  entityEmbeddings,
  learningSessions,
  projects,
  skills,
} from "@/lib/db/schema";
import { getEmbeddingProvider } from "@/lib/embeddings";
import { KNOWLEDGE_TARGET_TYPES, type KnowledgeTargetType } from "./target-types";

interface EntityRow {
  id: string;
  text: string;
}

/**
 * Canonical text per link-target type — what gets embedded and compared
 * against a knowledge document's chunks. Kept short and factual (name +
 * the fields that actually describe what the thing is), not the full row.
 */
async function fetchEntities(
  userId: string,
  type: KnowledgeTargetType,
): Promise<EntityRow[]> {
  switch (type) {
    case "skill": {
      const rows = await db
        .select({
          id: skills.id,
          name: skills.name,
          category: skills.category,
          notes: skills.notes,
        })
        .from(skills)
        .where(eq(skills.userId, userId));
      return rows.map((r) => ({
        id: r.id,
        text: [`${r.name} (${r.category})`, r.notes].filter(Boolean).join(". "),
      }));
    }
    case "project": {
      const rows = await db
        .select({
          id: projects.id,
          name: projects.name,
          description: projects.description,
          problemSolved: projects.problemSolved,
          architecture: projects.architecture,
        })
        .from(projects)
        .where(eq(projects.userId, userId));
      return rows.map((r) => ({
        id: r.id,
        text: [r.name, r.description, r.problemSolved, r.architecture]
          .filter(Boolean)
          .join(". "),
      }));
    }
    case "career_opportunity": {
      const rows = await db
        .select({
          id: careerOpportunities.id,
          role: careerOpportunities.role,
          company: careerOpportunities.company,
          description: careerOpportunities.description,
        })
        .from(careerOpportunities)
        .where(eq(careerOpportunities.userId, userId));
      return rows.map((r) => ({
        id: r.id,
        text: `${r.role} at ${r.company}. ${r.description}`,
      }));
    }
    case "content_item": {
      const rows = await db
        .select({
          id: contentItems.id,
          title: contentItems.title,
          hook: contentItems.hook,
          angle: contentItems.angle,
        })
        .from(contentItems)
        .where(eq(contentItems.userId, userId));
      return rows.map((r) => ({
        id: r.id,
        text: [r.title, r.hook, r.angle].filter(Boolean).join(". "),
      }));
    }
    case "business_opportunity": {
      const rows = await db
        .select({
          id: businessOpportunities.id,
          title: businessOpportunities.title,
          problem: businessOpportunities.problem,
          proposedSolution: businessOpportunities.proposedSolution,
        })
        .from(businessOpportunities)
        .where(eq(businessOpportunities.userId, userId));
      return rows.map((r) => ({
        id: r.id,
        text: `${r.title}. ${r.problem} ${r.proposedSolution}`,
      }));
    }
    case "learning_session": {
      const rows = await db
        .select({
          id: learningSessions.id,
          topic: learningSessions.topic,
          category: learningSessions.category,
          description: learningSessions.description,
        })
        .from(learningSessions)
        .where(eq(learningSessions.userId, userId));
      return rows.map((r) => ({
        id: r.id,
        text: [`${r.topic} (${r.category})`, r.description]
          .filter(Boolean)
          .join(". "),
      }));
    }
    case "dsa_pattern": {
      // global reference table — same rows for every user, embedded once per
      // owner (entity_embeddings is still keyed by userId, like everything else)
      const rows = await db
        .select({
          id: dsaPatterns.id,
          name: dsaPatterns.name,
          description: dsaPatterns.description,
        })
        .from(dsaPatterns);
      return rows.map((r) => ({
        id: r.id,
        text: [r.name, r.description].filter(Boolean).join(". "),
      }));
    }
  }
}

/** Text up to the first "." or "(", falling back to a 60-char clip. */
function toLabel(text: string): string {
  return text.split(/[.(]/)[0].trim() || text.slice(0, 60);
}

/**
 * Friendly label + full canonical text for a set of entities of one type —
 * used to render a link's target ("Sliding Window") and to build an LLM
 * rationale prompt.
 */
export async function fetchEntityLabels(
  userId: string,
  type: KnowledgeTargetType,
  ids: string[],
): Promise<Map<string, { label: string; text: string }>> {
  const map = new Map<string, { label: string; text: string }>();
  if (ids.length === 0) return map;

  const wanted = new Set(ids);
  const rows = await fetchEntities(userId, type);
  for (const row of rows) {
    if (!wanted.has(row.id)) continue;
    map.set(row.id, { label: toLabel(row.text), text: row.text });
  }
  return map;
}

/** Every entity of one type, labeled — used for the "Add mapping" picker. */
export async function listAllEntities(
  userId: string,
  type: KnowledgeTargetType,
): Promise<{ id: string; label: string; text: string }[]> {
  const rows = await fetchEntities(userId, type);
  return rows.map((r) => ({ id: r.id, label: toLabel(r.text), text: r.text }));
}

const hashOf = (s: string): string =>
  createHash("sha256").update(s).digest("hex");

/** Embed one entity and upsert its cached vector. Idempotent by text hash;
 *  returns false when the text hasn't changed since the last embed. */
export async function embedEntity(
  userId: string,
  targetType: KnowledgeTargetType,
  targetId: string,
  text: string,
): Promise<boolean> {
  const textHash = hashOf(text);
  const [existing] = await db
    .select({ textHash: entityEmbeddings.textHash })
    .from(entityEmbeddings)
    .where(
      and(
        eq(entityEmbeddings.userId, userId),
        eq(entityEmbeddings.targetType, targetType),
        eq(entityEmbeddings.targetId, targetId),
      ),
    )
    .limit(1);
  if (existing?.textHash === textHash) return false;

  const provider = getEmbeddingProvider();
  const [vector] = await provider.embed([text]);

  await db
    .insert(entityEmbeddings)
    .values({
      userId,
      targetType,
      targetId,
      textHash,
      embedding: vector,
      embeddingModel: provider.id,
    })
    .onConflictDoUpdate({
      target: [
        entityEmbeddings.userId,
        entityEmbeddings.targetType,
        entityEmbeddings.targetId,
      ],
      set: {
        textHash,
        embedding: vector,
        embeddingModel: provider.id,
        updatedAt: new Date(),
      },
    });
  return true;
}

export interface BackfillResult {
  type: KnowledgeTargetType;
  total: number;
  embedded: number;
}

/** (Re-)embed every link-target entity for a user. One embed() call per type
 *  (batched), skipping rows whose canonical text hasn't changed. */
export async function backfillEntityEmbeddings(
  userId: string,
  types: readonly KnowledgeTargetType[] = KNOWLEDGE_TARGET_TYPES,
): Promise<BackfillResult[]> {
  const provider = getEmbeddingProvider();
  const results: BackfillResult[] = [];

  for (const type of types) {
    const rows = await fetchEntities(userId, type);
    if (rows.length === 0) {
      results.push({ type, total: 0, embedded: 0 });
      continue;
    }

    const existing = await db
      .select({
        targetId: entityEmbeddings.targetId,
        textHash: entityEmbeddings.textHash,
      })
      .from(entityEmbeddings)
      .where(
        and(
          eq(entityEmbeddings.userId, userId),
          eq(entityEmbeddings.targetType, type),
        ),
      );
    const existingHash = new Map(existing.map((e) => [e.targetId, e.textHash]));
    const toEmbed = rows.filter((r) => existingHash.get(r.id) !== hashOf(r.text));

    if (toEmbed.length > 0) {
      const vectors = await provider.embed(toEmbed.map((r) => r.text));
      for (let i = 0; i < toEmbed.length; i++) {
        const row = toEmbed[i];
        await db
          .insert(entityEmbeddings)
          .values({
            userId,
            targetType: type,
            targetId: row.id,
            textHash: hashOf(row.text),
            embedding: vectors[i],
            embeddingModel: provider.id,
          })
          .onConflictDoUpdate({
            target: [
              entityEmbeddings.userId,
              entityEmbeddings.targetType,
              entityEmbeddings.targetId,
            ],
            set: {
              textHash: hashOf(row.text),
              embedding: vectors[i],
              embeddingModel: provider.id,
              updatedAt: new Date(),
            },
          });
      }
    }
    results.push({ type, total: rows.length, embedded: toEmbed.length });
  }
  return results;
}
