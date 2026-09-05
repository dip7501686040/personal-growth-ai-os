import type { RawCandidate } from "./candidates";
import type { KnowledgeTargetType } from "../target-types";

export interface ScoredCandidate extends RawCandidate {
  score: number;
  method: string[];
  relation: string;
  /** exact name match, a direct shared-source id, or score ≥ 0.85 */
  autoAccept: boolean;
}

/** Minimum fused score to keep a candidate at all (drops embedding-only noise). */
export const SCORE_FLOOR = 0.4;
export const AUTO_ACCEPT_SCORE = 0.85;

const RELATION_BY_TYPE: Record<
  KnowledgeTargetType,
  { matched: string; default: string }
> = {
  skill: { matched: "demonstrates", default: "relevant_to" },
  project_feature: { matched: "demonstrates", default: "used_in" },
  learning_session: { matched: "evidence_for", default: "relevant_to" },
  career_opportunity: { matched: "relevant_to", default: "relevant_to" },
  content_item: { matched: "relevant_to", default: "relevant_to" },
  business_opportunity: { matched: "relevant_to", default: "relevant_to" },
};

/**
 * Fuse the independent signals into one 0..1 score. No cross-encoder / Snorkel
 * — a hand-weighted sum is the right amount of machinery for this corpus size
 * and is trivial to recalibrate (see scripts/knowledge-map-eval.ts).
 *
 *   shared_source            → 1.0, always
 *   otherwise: 0.75×embedding + 0.35×(exact name match) + 0.15×(repo-name match)
 */
export function scoreCandidate(c: RawCandidate): ScoredCandidate {
  const method: string[] = [];
  let score: number;

  if (c.sharedSource) {
    method.push("shared_source");
    score = 1;
  } else {
    const embedPart = (c.embedScore ?? 0) * 0.75;
    const namePart = c.nameMatch ? 0.35 : 0;
    const repoPart = c.repoNameMatch ? 0.15 : 0;
    score = Math.min(1, embedPart + namePart + repoPart);
    if (c.embedScore != null) method.push("embedding");
    if (c.nameMatch) method.push("skill_name");
    if (c.repoNameMatch) method.push("shared_source_repo_name");
  }

  const rel = RELATION_BY_TYPE[c.targetType];
  const relation = c.sharedSource || c.nameMatch ? rel.matched : rel.default;
  const autoAccept = c.sharedSource || !!c.nameMatch || score >= AUTO_ACCEPT_SCORE;

  return { ...c, score, method, relation, autoAccept };
}
