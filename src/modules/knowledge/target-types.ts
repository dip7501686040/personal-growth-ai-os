/**
 * What a `knowledge_links` row can point at — a subset of the DB enum
 * `knowledge_target_type` (see schema/_shared.ts): the enum also still
 * defines `project` and `dsa_pattern` (Postgres can't cheaply drop an enum
 * value), but this app-level list is what actually drives candidate
 * generation, entity embeddings, and the UI — both are deliberately excluded
 * here. `project` (the whole project) was a grouping label duplicating
 * `project_feature`, the concrete thing; `dsa_pattern` duplicated a skill's
 * own `category`. Kept as a TS const so app code gets a real union type
 * without re-deriving it from Drizzle's enum column metadata everywhere.
 */
export const KNOWLEDGE_TARGET_TYPES = [
  "skill",
  "project_feature",
  "career_opportunity",
  "content_item",
  "business_opportunity",
  "learning_session",
] as const;

export type KnowledgeTargetType = (typeof KNOWLEDGE_TARGET_TYPES)[number];

export const TARGET_TYPE_LABEL: Record<KnowledgeTargetType, string> = {
  skill: "Skill",
  project_feature: "Project feature",
  career_opportunity: "Career opportunity",
  content_item: "Content",
  business_opportunity: "Business opportunity",
  learning_session: "Learning session",
};

/** Which agent's domain a target type belongs to (for future "agents" filtering). */
export const TARGET_TYPE_AGENT: Record<KnowledgeTargetType, string> = {
  skill: "learning",
  project_feature: "project",
  career_opportunity: "career",
  content_item: "content",
  business_opportunity: "business",
  learning_session: "learning",
};

/** The two target types whose accumulated links produce a knowledge-depth
 *  weight and are meant to drive decisions elsewhere in the app. */
export const DECISION_TARGET_TYPES: readonly KnowledgeTargetType[] = [
  "skill",
  "project_feature",
];

/**
 * The DB enum (`knowledge_target_type`) is wider than this app-level list —
 * it still carries `project`/`dsa_pattern` for legacy rows (see the comment
 * above). Use this to narrow a raw DB value before treating it as one of the
 * six types the app actually knows how to render/score.
 */
export function isKnowledgeTargetType(t: string): t is KnowledgeTargetType {
  return (KNOWLEDGE_TARGET_TYPES as readonly string[]).includes(t);
}
