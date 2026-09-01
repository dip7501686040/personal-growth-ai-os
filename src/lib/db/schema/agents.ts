import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  actorEnum,
  agentEventLevelEnum,
  agentNameEnum,
  agentStatusEnum,
  agentTriggerEnum,
  createdAt,
  userId,
} from "./_shared";

/**
 * One execution of an agent. Drives the lifecycle FSM:
 * triggered → running → gathering_context → analyzing → recommending
 *           → (waiting_for_approval)? → completed | failed
 */
export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    agentName: agentNameEnum("agent_name").notNull(),
    status: agentStatusEnum("status").notNull().default("triggered"),
    triggerSource: agentTriggerEnum("trigger_source").notNull(),
    /** Stable key for idempotency, e.g. a date or a content hash. */
    triggerKey: text("trigger_key"),
    inputSummary: jsonb("input_summary")
      .notNull()
      .default(sql`'{}'::jsonb`),
    currentStep: text("current_step"),
    result: jsonb("result"),
    error: text("error"),
    modelUsed: text("model_used"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    estimatedCostUsd: numeric("estimated_cost_usd", { precision: 10, scale: 6 }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt,
  },
  (t) => [
    index("agent_runs_user_agent_created_idx").on(
      t.userId,
      t.agentName,
      t.createdAt,
    ),
    uniqueIndex("agent_runs_idempotency_idx")
      .on(t.userId, t.agentName, t.triggerKey)
      .where(sql`${t.triggerKey} is not null`),
  ],
).enableRLS();

/** Append-only log line for an agent run (powers the activity timeline). */
export const agentEvents = pgTable(
  "agent_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    agentRunId: uuid("agent_run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    level: agentEventLevelEnum("level").notNull().default("info"),
    step: text("step"),
    message: text("message").notNull(),
    data: jsonb("data"),
  },
  (t) => [index("agent_events_run_ts_idx").on(t.agentRunId, t.ts)],
).enableRLS();

export type AgentRun = typeof agentRuns.$inferSelect;
export type NewAgentRun = typeof agentRuns.$inferInsert;
export type AgentEvent = typeof agentEvents.$inferSelect;

// re-export the actor enum users of this module may need alongside agents
export { actorEnum };
