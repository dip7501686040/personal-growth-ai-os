import {
  levelRank,
  SKILL_LEVELS,
  type EvidenceStrength,
  type SkillLevel,
} from "./levels";

/**
 * Deterministic skill-progression engine. No LLM. Given the set of *accepted*
 * evidence for a skill, it derives the level that evidence actually justifies —
 * which may be lower than what an individual piece of evidence claims.
 *
 * Rules (see docs/system-design.md §5):
 *  - level = highest `supportsLevel` among accepted evidence, then capped:
 *  - IMPLEMENTED needs a project_feature or activity_analysis evidence
 *    (strength ≥ moderate), OR a strong manual/agent override.
 *  - PROVEN needs ≥2 distinct project_feature evidences plus corroborating
 *    activity evidence (or ≥3 project_feature), OR a strong manual/agent
 *    override that explicitly reached PROVEN.
 */

export type EvidenceSourceType =
  | "learning_session"
  | "dsa_attempt"
  | "project_feature"
  | "activity_analysis"
  | "manual"
  | "agent_suggestion";

export interface EvidenceLike {
  id: string;
  sourceType: EvidenceSourceType;
  sourceId: string | null;
  supportsLevel: SkillLevel;
  strength: EvidenceStrength;
}

export interface DerivedLevel {
  /** Level justified by the rules. */
  level: SkillLevel;
  /** Highest level any single accepted evidence claims. */
  claimed: SkillLevel;
  /** claimed > level — evidence over-claims relative to the rules. */
  ambiguous: boolean;
  confidence: number;
  rationale: string[];
}

const notWeak = (e: EvidenceLike) => e.strength !== "weak";

function hasImplementedProof(evidence: EvidenceLike[]): boolean {
  const fromWork = evidence.some(
    (e) =>
      (e.sourceType === "project_feature" ||
        e.sourceType === "activity_analysis") &&
      notWeak(e) &&
      levelRank(e.supportsLevel) >= levelRank("implemented"),
  );
  const override = evidence.some(
    (e) =>
      (e.sourceType === "manual" || e.sourceType === "agent_suggestion") &&
      e.strength === "strong" &&
      levelRank(e.supportsLevel) >= levelRank("implemented"),
  );
  return fromWork || override;
}

function hasProvenProof(evidence: EvidenceLike[]): boolean {
  const features = evidence.filter(
    (e) => e.sourceType === "project_feature" && notWeak(e),
  );
  const distinctFeatures = new Set(features.map((e) => e.sourceId ?? e.id)).size;
  const hasActivity = evidence.some(
    (e) => e.sourceType === "activity_analysis" && notWeak(e),
  );
  const override = evidence.some(
    (e) =>
      (e.sourceType === "manual" || e.sourceType === "agent_suggestion") &&
      e.strength === "strong" &&
      levelRank(e.supportsLevel) >= levelRank("proven"),
  );
  return (
    override ||
    distinctFeatures >= 3 ||
    (distinctFeatures >= 2 && hasActivity)
  );
}

const STRENGTH_WEIGHT: Record<EvidenceStrength, number> = {
  weak: 1,
  moderate: 2,
  strong: 3,
};

export function computeConfidence(
  level: SkillLevel,
  evidence: EvidenceLike[],
): number {
  const base = levelRank(level) * 18; // 0, 18, 36, 54, 72
  const weight = evidence.reduce((s, e) => s + STRENGTH_WEIGHT[e.strength], 0);
  const evidenceScore = Math.min(28, weight * 4);
  return Math.max(0, Math.min(100, Math.round(base + evidenceScore)));
}

export function deriveLevel(accepted: EvidenceLike[]): DerivedLevel {
  if (accepted.length === 0) {
    return {
      level: "interested",
      claimed: "interested",
      ambiguous: false,
      confidence: 0,
      rationale: ["No accepted evidence yet."],
    };
  }

  const claimed = accepted.reduce<SkillLevel>(
    (m, e) => (levelRank(e.supportsLevel) > levelRank(m) ? e.supportsLevel : m),
    "interested",
  );

  let level = claimed;
  const rationale: string[] = [];

  if (
    levelRank(level) >= levelRank("proven") &&
    !hasProvenProof(accepted)
  ) {
    level = "implemented";
    rationale.push(
      "Capped at IMPLEMENTED: PROVEN needs ≥2 project-feature evidences with corroborating activity (or ≥3 project features), or an approved strong override.",
    );
  }

  if (
    levelRank(level) >= levelRank("implemented") &&
    !hasImplementedProof(accepted)
  ) {
    level = "practiced";
    rationale.push(
      "Capped at PRACTICED: IMPLEMENTED needs project or development-activity evidence, or an approved strong override.",
    );
  }

  const ambiguous = levelRank(claimed) > levelRank(level);
  rationale.unshift(
    `Highest evidence claims ${claimed.toUpperCase()}; rules justify ${level.toUpperCase()}.`,
  );

  return {
    level,
    claimed,
    ambiguous,
    confidence: computeConfidence(level, accepted),
    rationale,
  };
}

export type LevelChangePlan =
  | { kind: "apply"; note: string }
  | { kind: "needs_approval"; note: string };

/**
 * Decides whether a user-requested level change can be applied directly or must
 * go through an approval. A change needs approval when it would jump more than
 * one rank above what current evidence justifies, or when it targets
 * IMPLEMENTED/PROVEN without the qualifying evidence types.
 */
export function planLevelChange(
  accepted: EvidenceLike[],
  targetLevel: SkillLevel,
): LevelChangePlan {
  const derived = deriveLevel(accepted);
  const targetRank = levelRank(targetLevel);
  const derivedRank = levelRank(derived.level);

  // Demotion or a level already justified by evidence: apply directly.
  if (targetRank <= derivedRank) {
    return {
      kind: "apply",
      note: `${targetLevel.toUpperCase()} is at or below what evidence already justifies.`,
    };
  }

  const hasWorkEvidence = accepted.some(
    (e) =>
      (e.sourceType === "project_feature" ||
        e.sourceType === "activity_analysis") &&
      e.strength !== "weak",
  );

  // Reaching IMPLEMENTED / PROVEN always needs project or development-activity
  // evidence. A self-report can't get there without review.
  if (targetRank >= levelRank("implemented") && !hasWorkEvidence) {
    return {
      kind: "needs_approval",
      note: `${targetLevel.toUpperCase()} needs project features or captured development activity, which isn't on record yet.`,
    };
  }

  // Otherwise allow a single-rank promotion; anything bigger goes to review.
  if (targetRank - derivedRank <= 1) {
    return {
      kind: "apply",
      note: `One-step promotion to ${targetLevel.toUpperCase()}, backed by your justification.`,
    };
  }

  return {
    kind: "needs_approval",
    note: `Skips ${targetRank - derivedRank} levels above what evidence justifies (${derived.level.toUpperCase()}).`,
  };
}

export { SKILL_LEVELS };
