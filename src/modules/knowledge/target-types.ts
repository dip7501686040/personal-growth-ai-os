/**
 * What a `knowledge_links` row can point at — mirrors the DB enum
 * `knowledge_target_type` (see schema/_shared.ts). Kept as a TS const here so
 * app code gets a real union type without re-deriving it from Drizzle's enum
 * column metadata everywhere.
 */
export const KNOWLEDGE_TARGET_TYPES = [
  "skill",
  "project",
  "career_opportunity",
  "content_item",
  "business_opportunity",
  "learning_session",
  "dsa_pattern",
] as const;

export type KnowledgeTargetType = (typeof KNOWLEDGE_TARGET_TYPES)[number];

export const TARGET_TYPE_LABEL: Record<KnowledgeTargetType, string> = {
  skill: "Skill",
  project: "Project",
  career_opportunity: "Career opportunity",
  content_item: "Content",
  business_opportunity: "Business opportunity",
  learning_session: "Learning session",
  dsa_pattern: "DSA pattern",
};

/** Which agent's domain a target type belongs to (for future "agents" filtering). */
export const TARGET_TYPE_AGENT: Record<KnowledgeTargetType, string> = {
  skill: "learning",
  project: "project",
  career_opportunity: "career",
  content_item: "content",
  business_opportunity: "business",
  learning_session: "learning",
  dsa_pattern: "learning",
};
