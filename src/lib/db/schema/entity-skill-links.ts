import { sql } from "drizzle-orm";
import { index, pgTable, real, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import {
  createdAt,
  entitySkillSourceTypeEnum,
  knowledgeTargetTypeEnum,
  updatedAt,
  userId,
} from "./_shared";

/**
 * Cross-module relevance bridge (Phase 7, HLD §6) — Option A. Career, content,
 * and business opportunities have no structural link to the skills/features
 * they touch (unlike projects → `project_skills` or learning →
 * `learning_session_skills`, both exact). This table gives them one, computed
 * the same embedding-match way `knowledge_links` links a document: two
 * entities sharing a row here share a skill or project feature.
 *
 * `targetType` reuses `knowledge_target_type` — always `skill` or
 * `project_feature` in practice, enforced at the app level (see
 * modules/knowledge/entity-skill-links.ts), not by a narrower DB enum.
 * A fully recomputed cache, not a review queue: no status/rationale — a
 * source's rows are replaced wholesale each time it's relinked.
 */
export const entitySkillLinks = pgTable(
  "entity_skill_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    sourceType: entitySkillSourceTypeEnum("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    targetType: knowledgeTargetTypeEnum("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    /** fused 0..1 confidence, same formula as knowledge_links */
    score: real("score").notNull().default(0),
    /** embedding | skill_name — combined */
    method: text("method")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    updatedAt,
    createdAt,
  },
  (t) => [
    uniqueIndex("entity_skill_links_key_idx").on(
      t.sourceType,
      t.sourceId,
      t.targetType,
      t.targetId,
    ),
    // "what does this opportunity/content item match" (linkEntityToSkills)
    index("entity_skill_links_source_idx").on(t.userId, t.sourceType, t.sourceId),
    // "what else matches this skill/feature" (the cross-module bridge read)
    index("entity_skill_links_target_idx").on(t.userId, t.targetType, t.targetId),
  ],
).enableRLS();

export type EntitySkillLink = typeof entitySkillLinks.$inferSelect;
export type NewEntitySkillLink = typeof entitySkillLinks.$inferInsert;
