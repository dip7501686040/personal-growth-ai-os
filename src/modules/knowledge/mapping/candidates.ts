import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { dsaPatterns, projects, skills } from "@/lib/db/schema";
import { type KnowledgeTargetType } from "../target-types";
import { docVector, toVectorLiteral } from "./doc-vector";

/**
 * Calibrated against real data, not guessed (K2 backfill v1 used 0.3 and
 * produced 18–23 "candidates" per doc — mostly noise). For this embedding
 * model, genuine matches on short entity texts cluster at 0.75–0.95; generic
 * technical-content similarity floats at 0.35–0.5 regardless of actual
 * relevance. 0.55 keeps the former, drops the latter.
 */
const EMBED_FLOOR = 0.55;
const EMBED_TOP_PER_TYPE = 3;
/** Skip name matches shorter than this — avoids noisy 1–2 char hits. */
const NAME_FLOOR = 3;

export interface DocContext {
  id: string;
  title: string;
  body: string;
  sourceKind: string;
  sourceRef: string | null;
}

export interface RawCandidate {
  targetType: KnowledgeTargetType;
  targetId: string;
  embedScore: number | null;
  /** the skill/pattern name literally found in the doc, if any */
  nameMatch: string | null;
  /** doc's github repo short name matches a project's name/slug (soft signal) */
  repoNameMatch: boolean;
  /** doc's sourceRef directly identifies this row (internal docs only) */
  sharedSource: boolean;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsName(haystack: string, name: string): boolean {
  const n = name.trim();
  if (n.length < NAME_FLOOR) return false;
  return new RegExp(`\\b${escapeRegex(n)}\\b`, "i").test(haystack);
}

function slugish(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

interface EmbedHit {
  target_type: KnowledgeTargetType;
  target_id: string;
  sim: number;
}

/** Top-K per target type over `entity_embeddings`, same-model cosine kNN. */
async function embeddingCandidates(
  userId: string,
  vector: number[],
  model: string,
): Promise<Map<string, number>> {
  const lit = toVectorLiteral(vector);
  const rows = await db.execute(sql`
    select target_type, target_id, 1 - (embedding <=> ${lit}::vector) as sim
    from entity_embeddings
    where user_id = ${userId} and embedding_model = ${model} and embedding is not null
    order by embedding <=> ${lit}::vector
  `);

  const perType = new Map<string, number>();
  const countByType = new Map<string, number>();
  for (const h of rows as unknown as EmbedHit[]) {
    const n = countByType.get(h.target_type) ?? 0;
    if (n >= EMBED_TOP_PER_TYPE) continue;
    const sim = Number(h.sim);
    if (sim < EMBED_FLOOR) continue;
    perType.set(`${h.target_type}:${h.target_id}`, sim);
    countByType.set(h.target_type, n + 1);
  }
  return perType;
}

/**
 * Every doc is checked against all target types in parallel (not a sequential
 * fallback) — three independent signals, merged by key:
 *   1. embedding kNN over entity_embeddings (same model as the doc's chunks)
 *   2. lexical: a skill/dsa_pattern name literally appears in the doc text
 *   3. shared source: an `internal` doc's sourceRef IS `skill:<id>` /
 *      `project:<id>` / `learning_session:<id>`; a `github_repo` doc's repo
 *      short name matches a project's name/slug (softer — not auto-accept eligible)
 */
export async function generateCandidates(
  userId: string,
  doc: DocContext,
): Promise<RawCandidate[]> {
  const dv = await docVector(doc.id);
  const embedHits = dv
    ? await embeddingCandidates(userId, dv.vector, dv.model)
    : new Map<string, number>();

  const text = `${doc.title}\n${doc.body}`;
  const byKey = new Map<string, RawCandidate>();
  const upsert = (
    targetType: KnowledgeTargetType,
    targetId: string,
    patch: Partial<RawCandidate>,
  ) => {
    const key = `${targetType}:${targetId}`;
    const cur = byKey.get(key) ?? {
      targetType,
      targetId,
      embedScore: null,
      nameMatch: null,
      repoNameMatch: false,
      sharedSource: false,
    };
    byKey.set(key, { ...cur, ...patch });
  };

  for (const [key, sim] of embedHits) {
    const [targetType, targetId] = key.split(":") as [KnowledgeTargetType, string];
    upsert(targetType, targetId, { embedScore: sim });
  }

  const userSkills = await db
    .select({ id: skills.id, name: skills.name })
    .from(skills)
    .where(eq(skills.userId, userId));
  for (const s of userSkills) {
    if (containsName(text, s.name)) upsert("skill", s.id, { nameMatch: s.name });
  }

  const patterns = await db
    .select({ id: dsaPatterns.id, name: dsaPatterns.name })
    .from(dsaPatterns);
  for (const p of patterns) {
    if (containsName(text, p.name)) upsert("dsa_pattern", p.id, { nameMatch: p.name });
  }

  if (doc.sourceKind === "internal" && doc.sourceRef) {
    const [kind, id] = doc.sourceRef.split(":");
    const map: Partial<Record<string, KnowledgeTargetType>> = {
      skill: "skill",
      project: "project",
      learning_session: "learning_session",
    };
    const targetType = map[kind];
    if (targetType && id) upsert(targetType, id, { sharedSource: true });
  }

  if (doc.sourceKind === "github_repo" && doc.sourceRef?.startsWith("github:")) {
    const full = doc.sourceRef.slice("github:".length).split(":")[0];
    const short = full.split("/").pop() ?? full;
    const shortSlug = slugish(short);
    if (shortSlug.length >= NAME_FLOOR) {
      const userProjects = await db
        .select({ id: projects.id, name: projects.name, slug: projects.slug })
        .from(projects)
        .where(eq(projects.userId, userId));
      for (const p of userProjects) {
        if (slugish(p.name) === shortSlug || slugish(p.slug) === shortSlug) {
          upsert("project", p.id, { repoNameMatch: true });
        }
      }
    }
  }

  return [...byKey.values()];
}
