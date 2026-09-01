import { sql } from "drizzle-orm";
import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  activityEventTypeEnum,
  activitySourceEnum,
  activityStatusEnum,
  createdAt,
  userId,
} from "./_shared";
import { agentRuns } from "./agents";
import { projects } from "./projects";

/** Raw development-activity metadata from the local Claude Code collector. */
export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    /** Collector-generated id — makes ingest idempotent. */
    clientEventId: text("client_event_id").notNull(),
    source: activitySourceEnum("source").notNull().default("claude_code"),
    eventType: activityEventTypeEnum("event_type")
      .notNull()
      .default("coding_session"),
    sessionId: text("session_id"),
    projectName: text("project_name"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
    durationSeconds: integer("duration_seconds").notNull().default(0),
    filesCreated: jsonb("files_created").notNull().default(sql`'[]'::jsonb`),
    filesModified: jsonb("files_modified").notNull().default(sql`'[]'::jsonb`),
    filesDeleted: jsonb("files_deleted").notNull().default(sql`'[]'::jsonb`),
    gitBranch: text("git_branch"),
    /** [{ hash, message }] */
    gitCommits: jsonb("git_commits").notNull().default(sql`'[]'::jsonb`),
    /** { filesChanged, insertions, deletions } */
    gitStats: jsonb("git_stats").notNull().default(sql`'{}'::jsonb`),
    sessionSummary: text("session_summary"),
    status: activityStatusEnum("status").notNull().default("received"),
    createdAt,
  },
  (t) => [
    uniqueIndex("activity_events_client_id_idx").on(t.userId, t.clientEventId),
    index("activity_events_user_status_idx").on(t.userId, t.status, t.startedAt),
  ],
).enableRLS();

/** One AI pass over a day's raw activity → suggested evidence + content hooks. */
export const activityAnalyses = pgTable(
  "activity_analyses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    analysisDate: date("analysis_date").notNull(),
    activityEventIds: uuid("activity_event_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    agentRunId: uuid("agent_run_id").references(() => agentRuns.id, {
      onDelete: "set null",
    }),
    summary: text("summary").notNull(),
    workCategories: jsonb("work_categories").notNull().default(sql`'[]'::jsonb`),
    /** [{ skill, confidence, reason }] */
    suggestedSkills: jsonb("suggested_skills")
      .notNull()
      .default(sql`'[]'::jsonb`),
    potentialProof: jsonb("potential_proof").notNull().default(sql`'[]'::jsonb`),
    contentOpportunities: jsonb("content_opportunities")
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt,
  },
  (t) => [
    uniqueIndex("activity_analyses_user_date_idx").on(
      t.userId,
      t.analysisDate,
    ),
  ],
).enableRLS();

/** Bearer tokens the local collector uses to authenticate to /api/activity/ingest. */
export const ingestTokens = pgTable(
  "ingest_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    /** sha256 of the raw token; the raw value is shown once and never stored. */
    tokenHash: text("token_hash").notNull(),
    label: text("label").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt,
  },
  (t) => [
    uniqueIndex("ingest_tokens_hash_idx").on(t.tokenHash),
    index("ingest_tokens_user_idx").on(t.userId),
  ],
).enableRLS();

export type ActivityEvent = typeof activityEvents.$inferSelect;
export type ActivityAnalysis = typeof activityAnalyses.$inferSelect;
export type IngestToken = typeof ingestTokens.$inferSelect;
