import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { cronRuns, type CronRun } from "@/lib/db/schema";

/** Insert a `running` row for a cron invocation; returns its id to finish later. */
export async function recordCronStart(userId: string, job: string): Promise<string> {
  const [row] = await db
    .insert(cronRuns)
    .values({ userId, job, status: "running" })
    .returning({ id: cronRuns.id });
  return row.id;
}

export async function recordCronFinish(
  id: string,
  result: { status: "ok" | "error"; summary?: string | null; error?: string | null },
): Promise<void> {
  await db
    .update(cronRuns)
    .set({
      status: result.status,
      summary: result.summary ?? null,
      error: result.error?.slice(0, 2000) ?? null,
      finishedAt: new Date(),
    })
    .where(eq(cronRuns.id, id));
}

/** Most recent run of one job, if it's ever run. */
export async function getLastCronRun(
  userId: string,
  job: string,
): Promise<CronRun | null> {
  const [row] = await db
    .select()
    .from(cronRuns)
    .where(and(eq(cronRuns.userId, userId), eq(cronRuns.job, job)))
    .orderBy(desc(cronRuns.startedAt))
    .limit(1);
  return row ?? null;
}

/** The most recent run of each named job, in the order given — `null` for one that's never run. */
export async function getLastCronRuns(
  userId: string,
  jobs: readonly string[],
): Promise<(CronRun | null)[]> {
  return Promise.all(jobs.map((job) => getLastCronRun(userId, job)));
}
