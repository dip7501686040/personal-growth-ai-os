import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  actorEnum,
  createdAt,
  evidenceSourceTypeEnum,
  evidenceStatusEnum,
  evidenceStrengthEnum,
  skillCategoryEnum,
  skillLevelEnum,
  updatedAt,
  userId,
} from "./_shared";
import { agentRuns } from "./agents";

/** A single skill in the shared Proof-of-Skills graph. */
export const skills = pgTable(
  "skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    category: skillCategoryEnum("category").notNull(),
    /** Derived from accepted evidence by the progression engine. */
    level: skillLevelEnum("level").notNull().default("interested"),
    confidence: integer("confidence").notNull().default(0),
    notes: text("notes"),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex("skills_user_slug_idx").on(t.userId, t.slug),
    index("skills_user_category_idx").on(t.userId, t.category),
    check("skills_confidence_range", sql`${t.confidence} between 0 and 100`),
  ],
).enableRLS();

/**
 * Evidence linking a real signal to a skill. `status` is the "suggested →
 * accepted → rejected" mechanism; only `accepted` rows influence the level.
 */
export const skillEvidence = pgTable(
  "skill_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    sourceType: evidenceSourceTypeEnum("source_type").notNull(),
    /** Optional pointer to the originating row (learning_session, project_feature, ...). */
    sourceId: uuid("source_id"),
    summary: text("summary").notNull(),
    detail: text("detail"),
    strength: evidenceStrengthEnum("strength").notNull().default("moderate"),
    /** Max skill level this piece of evidence can justify. */
    supportsLevel: skillLevelEnum("supports_level").notNull(),
    status: evidenceStatusEnum("status").notNull().default("suggested"),
    createdBy: actorEnum("created_by").notNull().default("user"),
    agentRunId: uuid("agent_run_id").references(() => agentRuns.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt,
  },
  (t) => [
    index("skill_evidence_skill_idx").on(t.userId, t.skillId),
    index("skill_evidence_status_idx").on(t.userId, t.status),
  ],
).enableRLS();

export type Skill = typeof skills.$inferSelect;
export type NewSkill = typeof skills.$inferInsert;
export type SkillEvidence = typeof skillEvidence.$inferSelect;
export type NewSkillEvidence = typeof skillEvidence.$inferInsert;
