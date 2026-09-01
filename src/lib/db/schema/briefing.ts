import { sql } from "drizzle-orm";
import {
  date,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, userId } from "./_shared";
import { agentRuns } from "./agents";

/** One prioritised, dot-connecting briefing per day (Chief of Staff output). */
export const dailyBriefings = pgTable(
  "daily_briefings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    briefingDate: date("briefing_date").notNull(),
    agentRunId: uuid("agent_run_id").references(() => agentRuns.id, {
      onDelete: "set null",
    }),
    summary: text("summary").notNull(),
    /** [{ title, why, ref, category }] — ranked, most important first. */
    priorities: jsonb("priorities").notNull().default(sql`'[]'::jsonb`),
    /** [{ note }] — cross-agent connections. */
    connections: jsonb("connections").notNull().default(sql`'[]'::jsonb`),
    /** [{ agent, status, lastRunAt }] */
    agentStatusSnapshot: jsonb("agent_status_snapshot")
      .notNull()
      .default(sql`'[]'::jsonb`),
    pendingApprovalIds: uuid("pending_approval_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    createdAt,
  },
  (t) => [
    uniqueIndex("daily_briefings_user_date_idx").on(t.userId, t.briefingDate),
  ],
).enableRLS();

export type DailyBriefing = typeof dailyBriefings.$inferSelect;
