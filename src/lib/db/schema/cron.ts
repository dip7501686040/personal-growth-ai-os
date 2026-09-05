import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, userId } from "./_shared";

/**
 * One invocation of a Vercel cron job. Unlike agent runs, these never went
 * through `agent_runs` — `github-sync`, `knowledge-map`, and `knowledge-refresh`
 * do real work but left no trace anywhere until this table (Phase 5).
 * `status`: running | ok | error
 */
export const cronRuns = pgTable(
  "cron_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    job: text("job").notNull(),
    status: text("status").notNull().default("running"),
    summary: text("summary"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt,
  },
  (t) => [index("cron_runs_user_job_started_idx").on(t.userId, t.job, t.startedAt)],
).enableRLS();

export type CronRun = typeof cronRuns.$inferSelect;
export type NewCronRun = typeof cronRuns.$inferInsert;
