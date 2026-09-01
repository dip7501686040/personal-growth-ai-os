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
