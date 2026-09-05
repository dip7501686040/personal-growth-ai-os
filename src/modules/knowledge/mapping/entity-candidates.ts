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
): Promise<ScoredCandidate[]> {
  const provider = getEmbeddingProvider();
  const [vector] = await provider.embed([text]);
  const embedHits = await embeddingCandidates(
    userId,
    vector,
    provider.id,
    DECISION_TARGET_TYPES,
  );

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

  return [...byKey.values()].map(scoreCandidate).filter((c) => c.score >= SCORE_FLOOR);
}
