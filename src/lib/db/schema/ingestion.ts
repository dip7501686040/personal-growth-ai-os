import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, updatedAt, userId } from "./_shared";
import { agentRuns } from "./agents";

/**
 * A connected source of historical/ongoing context.
 * `kind`: github_repo | upload | claude_transcripts | internal
 * `last_cursor`: commit SHA / ISO timestamp / byte offset — where the last
 * incremental sync stopped.
 */
export const ingestionSources = pgTable(
  "ingestion_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    kind: text("kind").notNull(),
    /** repo full name, "chatgpt-export", "linkedin-export", ... */
    externalRef: text("external_ref"),
    config: jsonb("config").notNull().default(sql`'{}'::jsonb`),
    lastCursor: text("last_cursor"),
    status: text("status").notNull().default("active"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    error: text("error"),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex("ingestion_sources_user_kind_ref_idx").on(
      t.userId,
      t.kind,
      t.externalRef,
    ),
  ],
).enableRLS();

/**
 * The ingestion queue. One row per unit of work (a changed file, one
 * conversation, an uploaded doc, an internal refresh). Drained by a cron that
 * runs the Extraction Agent. `dedupe_key` keeps re-enqueues idempotent.
 */
export const ingestionJobs = pgTable(
  "ingestion_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    sourceId: uuid("source_id").references(() => ingestionSources.id, {
      onDelete: "set null",
    }),
    kind: text("kind").notNull(),
    dedupeKey: text("dedupe_key"),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    agentRunId: uuid("agent_run_id").references(() => agentRuns.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt,
  },
  (t) => [
    index("ingestion_jobs_status_idx").on(t.userId, t.status, t.createdAt),
    uniqueIndex("ingestion_jobs_dedupe_idx")
      .on(t.userId, t.dedupeKey)
      .where(sql`${t.dedupeKey} is not null`),
  ],
).enableRLS();

/**
 * Outbox: domain services append a row whenever something changes that the
 * knowledge base should reflect (a skill level moved, a learning session was
 * logged, ...). A cron drains unprocessed rows and refreshes the affected
 * knowledge documents. This is the internal-activity auto-update path.
 *
 * `kind`: skill_changed | learning_logged | project_updated | activity_analyzed
 */
export const contextEvents = pgTable(
  "context_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    kind: text("kind").notNull(),
    refId: uuid("ref_id"),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt,
  },
  (t) => [
    index("context_events_unprocessed_idx").on(
      t.userId,
      t.processedAt,
      t.createdAt,
    ),
  ],
).enableRLS();

export type IngestionSource = typeof ingestionSources.$inferSelect;
export type NewIngestionSource = typeof ingestionSources.$inferInsert;
export type IngestionJob = typeof ingestionJobs.$inferSelect;
export type NewIngestionJob = typeof ingestionJobs.$inferInsert;
export type ContextEvent = typeof contextEvents.$inferSelect;
export type NewContextEvent = typeof contextEvents.$inferInsert;
