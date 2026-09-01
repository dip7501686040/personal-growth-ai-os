import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import {
  agentNameEnum,
  approvalActionEnum,
  approvalStatusEnum,
  createdAt,
  userId,
} from "./_shared";
import { agentRuns } from "./agents";

/**
 * Human-in-the-loop gate. Agents (and some deterministic flows) create an
 * approval instead of taking an important action directly.
 */
export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    agentRunId: uuid("agent_run_id").references(() => agentRuns.id, {
      onDelete: "set null",
    }),
    agentName: agentNameEnum("agent_name"),
    actionType: approvalActionEnum("action_type").notNull(),
    title: text("title").notNull(),
    reason: text("reason").notNull(),
    /** Machine-readable payload the resolver needs (e.g. { skillId, evidenceId, toLevel }). */
    context: jsonb("context")
      .notNull()
      .default(sql`'{}'::jsonb`),
    expectedOutcome: text("expected_outcome"),
    status: approvalStatusEnum("status").notNull().default("pending"),
    feedback: text("feedback"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt,
  },
  (t) => [index("approvals_user_status_idx").on(t.userId, t.status)],
).enableRLS();

export type Approval = typeof approvals.$inferSelect;
export type NewApproval = typeof approvals.$inferInsert;
