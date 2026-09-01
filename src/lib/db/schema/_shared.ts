import { pgEnum, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Owner of a row. References `auth.users(id)` (managed by Supabase Auth), which
 * lives in a different schema, so this is a plain uuid column — the app always
 * scopes queries by the authenticated user id, and RLS backs it up for any
 * access that goes through PostgREST.
 */
export const userId = uuid("user_id").notNull();

export const createdAt = timestamp("created_at", { withTimezone: true })
  .notNull()
  .defaultNow();

export const updatedAt = timestamp("updated_at", { withTimezone: true })
  .notNull()
  .defaultNow();

// ── Shared enums ────────────────────────────────────────────────────────────

export const skillLevelEnum = pgEnum("skill_level", [
  "interested",
  "learning",
  "practiced",
  "implemented",
  "proven",
]);

export const skillCategoryEnum = pgEnum("skill_category", [
  "language",
  "framework",
  "database",
  "infrastructure",
  "concept",
  "tool",
  "practice",
  "dsa_pattern",
]);

export const evidenceSourceTypeEnum = pgEnum("evidence_source_type", [
  "learning_session",
  "dsa_attempt",
  "project_feature",
  "activity_analysis",
  "manual",
  "agent_suggestion",
]);

export const evidenceStrengthEnum = pgEnum("evidence_strength", [
  "weak",
  "moderate",
  "strong",
]);

export const evidenceStatusEnum = pgEnum("evidence_status", [
  "suggested",
  "accepted",
  "rejected",
]);

export const actorEnum = pgEnum("actor", ["user", "agent"]);

export const agentNameEnum = pgEnum("agent_name", [
  "learning",
  "project",
  "career",
  "content",
  "business",
  "chief_of_staff",
  "activity_analyzer",
]);

export const agentStatusEnum = pgEnum("agent_status", [
  "triggered",
  "running",
  "gathering_context",
  "analyzing",
  "recommending",
  "waiting_for_approval",
  "completed",
  "failed",
]);

export const agentTriggerEnum = pgEnum("agent_trigger", [
  "schedule",
  "manual",
  "chain",
]);

export const agentEventLevelEnum = pgEnum("agent_event_level", [
  "info",
  "warn",
  "error",
]);

export const approvalStatusEnum = pgEnum("approval_status", [
  "pending",
  "approved",
  "rejected",
]);

export const approvalActionEnum = pgEnum("approval_action", [
  "promote_skill",
  "demote_skill",
  "change_learning_priority",
  "start_project",
  "apply_job",
  "publish_content",
  "contact_client",
]);

export const learningCategoryEnum = pgEnum("learning_category", [
  "technology",
  "system_design",
  "dsa",
  "revision",
]);

export const dsaDifficultyEnum = pgEnum("dsa_difficulty", [
  "easy",
  "medium",
  "hard",
]);

export const dsaFailureReasonEnum = pgEnum("dsa_failure_reason", [
  "none",
  "could_not_identify_pattern",
  "knew_pattern_impl_bug",
  "tle",
  "other",
]);

export const llmProviderEnum = pgEnum("llm_provider", ["gemini", "openai"]);

export const projectStatusEnum = pgEnum("project_status", [
  "idea",
  "planning",
  "building",
  "paused",
  "completed",
]);

export const featureStatusEnum = pgEnum("feature_status", [
  "planned",
  "in_progress",
  "done",
]);

export const projectSkillRoleEnum = pgEnum("project_skill_role", [
  "planned",
  "used",
  "demonstrated",
]);

export const careerStatusEnum = pgEnum("career_status", [
  "new",
  "analyzed",
  "applied",
  "rejected",
  "archived",
]);

export const careerRecommendationEnum = pgEnum("career_recommendation", [
  "yes",
  "maybe",
  "no",
]);

export const contentStatusEnum = pgEnum("content_status", [
  "idea",
  "draft",
  "ready_for_review",
  "approved",
  "published",
]);

export const contentPlatformEnum = pgEnum("content_platform", ["linkedin"]);

export const contentSourceTypeEnum = pgEnum("content_source_type", [
  "learning_session",
  "project_feature",
  "dsa_attempt",
  "dsa_weakness",
  "skill_levelup",
  "activity_analysis",
  "manual",
]);

export const businessComplexityEnum = pgEnum("business_complexity", [
  "low",
  "medium",
  "high",
]);

export const businessStatusEnum = pgEnum("business_status", [
  "idea",
  "exploring",
  "validated",
  "dropped",
]);
