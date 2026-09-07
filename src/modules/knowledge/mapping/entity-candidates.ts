import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projectFeatures, skills } from "@/lib/db/schema";
import { getEmbeddingProvider } from "@/lib/embeddings";
import { DECISION_TARGET_TYPES } from "../target-types";
import { containsName, embeddingCandidates, type RawCandidate } from "./candidates";
import { scoreCandidate, SCORE_FLOOR, type ScoredCandidate } from "./score";

/**
 * The same three-signal match `generateCandidates` runs for a knowledge
 * document — embedding kNN + literal name match — generalized to run against
 * any short piece of text instead of a document body. This is what gives
 * career/content/business items (which never become `knowledge_documents`
 * rows) a link to the skills/features they touch (Phase 7, HLD §6/§7).
 *
 * Always scoped to the decision tier (`skill`, `project_feature`) — the only
 * two types `entity_skill_links` points at. No shared-source / repo-name
 * signal: those are document-provenance concepts that don't apply here.
 */
export async function matchSkillsAndFeatures(
  userId: string,
  text: string,
  opts?: {
    /** Keep a candidate whose name literally appears in `text` even if its
     *  fused score is below `SCORE_FLOOR`. A JD that spells out "Kubernetes"
     *  is naming the skill on purpose — for `get_proof_for_jd` that's signal,
     *  not noise. Off by default so document/entity linking is unaffected. */
    keepNameMatches?: boolean;
  },
): Promise<ScoredCandidate[]> {
  // Embedding is best-effort: on a provider outage / rate-limit, fall back to
  // lexical-only matching rather than failing the whole call (the JD path
  // relies on `keepNameMatches` anyway).
  let embedHits = new Map<string, number>();
  try {
    const provider = getEmbeddingProvider();
    const [vector] = await provider.embed([text]);
    embedHits = await embeddingCandidates(
      userId,
      vector,
      provider.id,
      DECISION_TARGET_TYPES,
    );
  } catch (err) {
    console.warn(
      "[matchSkillsAndFeatures] embedding unavailable, lexical-only:",
      err instanceof Error ? err.message : err,
    );
  }

  const byKey = new Map<string, RawCandidate>();
  const upsert = (
    targetType: RawCandidate["targetType"],
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
    const [targetType, targetId] = key.split(":") as [RawCandidate["targetType"], string];
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

  return [...byKey.values()]
    .map(scoreCandidate)
    .filter(
      (c) =>
        c.score >= SCORE_FLOOR ||
        (opts?.keepNameMatches === true && !!c.nameMatch),
    );
}
