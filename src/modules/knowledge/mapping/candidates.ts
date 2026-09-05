import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { projectFeatures, projects, skills } from "@/lib/db/schema";
import { type KnowledgeTargetType } from "../target-types";
import { docVector, toVectorLiteral } from "./doc-vector";

/**
 * Calibrated against real data, not guessed (K2 backfill v1 used 0.3 and
 * produced 18–23 "candidates" per doc — mostly noise). For this embedding
 * model, genuine matches on short entity texts cluster at 0.75–0.95; generic
 * technical-content similarity floats at 0.35–0.5 regardless of actual
 * relevance. 0.55 keeps the former, drops the latter.
 */
export const EMBED_FLOOR = 0.55;
const EMBED_TOP_PER_TYPE = 3;
/** Skip name matches shorter than this — avoids noisy 1–2 char hits. */
export const NAME_FLOOR = 3;

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
  /** the skill/feature name literally found in the doc, if any */
  nameMatch: string | null;
  /** doc's github repo short name matches the feature's project (soft signal) */
  repoNameMatch: boolean;
  /** doc's sourceRef directly identifies this row, or its parent project (internal docs only) */
  sharedSource: boolean;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function containsName(haystack: string, name: string): boolean {
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

/**
 * Top-K per target type over `entity_embeddings`, same-model cosine kNN.
 * `restrictTypes` narrows the scan to a subset (e.g. just `skill` and
 * `project_feature` for the entity-skill-link bridge, Phase 7) instead of
 * every link-target type a knowledge document could match.
 */
export async function embeddingCandidates(
  userId: string,
  vector: number[],
  model: string,
  restrictTypes?: readonly KnowledgeTargetType[],
): Promise<Map<string, number>> {
  const lit = toVectorLiteral(vector);
  const rows = await db.execute(sql`
    select target_type, target_id, 1 - (embedding <=> ${lit}::vector) as sim
    from entity_embeddings
    where user_id = ${userId} and embedding_model = ${model} and embedding is not null
    ${restrictTypes?.length ? sql`and target_type in ${restrictTypes}` : sql``}
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
 *   2. lexical: a skill/project-feature name literally appears in the doc text
 *   3. shared source: an `internal` doc's sourceRef IS `skill:<id>` /
 *      `learning_session:<id>` directly, or `project:<id>` — which fans out to
 *      every feature currently under that project (project itself isn't a
 *      target type; its features are the concrete thing). A `github_repo`
 *      doc's repo name matching a project similarly fans out to that
 *      project's features (softer signal — not auto-accept eligible).
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

  const userFeatures = await db
    .select({ id: projectFeatures.id, title: projectFeatures.title })
    .from(projectFeatures)
    .where(eq(projectFeatures.userId, userId));
  for (const f of userFeatures) {
    if (containsName(text, f.title)) upsert("project_feature", f.id, { nameMatch: f.title });
  }

  /** Every current feature of one project — used to fan a project-level
   *  signal (shared source, repo-name match) out to the concrete things. */
  const featuresOfProject = (projectId: string) =>
    db
      .select({ id: projectFeatures.id })
      .from(projectFeatures)
      .where(
        and(eq(projectFeatures.userId, userId), eq(projectFeatures.projectId, projectId)),
      );

  if (doc.sourceKind === "internal" && doc.sourceRef) {
    const [kind, id] = doc.sourceRef.split(":");
    if (kind === "skill" && id) {
      upsert("skill", id, { sharedSource: true });
    } else if (kind === "learning_session" && id) {
      upsert("learning_session", id, { sharedSource: true });
    } else if (kind === "project" && id) {
      for (const f of await featuresOfProject(id)) {
        upsert("project_feature", f.id, { sharedSource: true });
      }
    }
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
          for (const f of await featuresOfProject(p.id)) {
            upsert("project_feature", f.id, { repoNameMatch: true });
          }
        }
      }
    }
  }

  return [...byKey.values()];
}
