import { NextResponse } from "next/server";
import { warmupDb } from "@/lib/db";
import { env } from "@/lib/env";
import { getOwnerUserId } from "@/lib/owner";
import { activityAnalyzerAgent } from "@/modules/agents/activity-analyzer-agent";
import { chiefOfStaffAgent } from "@/modules/agents/chief-of-staff-agent";
import { extractionAgent } from "@/modules/agents/extraction-agent";
import { learningAgent } from "@/modules/agents/learning-agent";
import { countPendingJobs } from "@/modules/ingestion/queue";
import { drainContextEvents } from "@/modules/ingestion/refresh";
import { syncSources } from "@/modules/ingestion/sources";

export const maxDuration = 60;

/** job name → handler. Vercel Cron GETs these on a schedule (see vercel.json). */
const JOBS: Record<string, (userId: string) => Promise<{ id: string; status: string }>> =
  {
    "daily-learning": async (userId) => {
      const run = await learningAgent.run({
        userId,
        trigger: "schedule",
        triggerKey: new Date().toISOString().slice(0, 10),
      });
      return { id: run.id, status: run.status };
    },
    "morning-briefing": async (userId) => {
      const run = await chiefOfStaffAgent.run({
        userId,
        trigger: "schedule",
        triggerKey: new Date().toISOString().slice(0, 10),
        force: true,
      });
      return { id: run.id, status: run.status };
    },
    "daily-activity": async (userId) => {
      // analyse the previous day's sessions
      const d = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
      const run = await activityAnalyzerAgent.run({
        userId,
        trigger: "schedule",
        triggerKey: `activity-${d}`,
        force: true,
        input: { date: d },
      });
      return { id: run.id, status: run.status };
    },
    "github-sync": async (userId) => {
      const r = await syncSources(userId, "github_repo");
      return {
        id: "-",
        status: `synced ${r.sources} repo(s) → ${r.enqueued} new job(s), ${r.deduped} unchanged, ${r.errors} error(s)`,
      };
    },
    "knowledge-refresh": async (userId) => {
      const r = await drainContextEvents(userId);
      return {
        id: "-",
        status: `refreshed ${r.processed} events → ${r.documents} docs / ${r.chunks} chunks`,
      };
    },
    "ingest-drain": async (userId) => {
      // Bounded per invocation so we stay under the function time limit.
      let done = 0;
      for (let i = 0; i < 6; i++) {
        if ((await countPendingJobs(userId)) === 0) break;
        const run = await extractionAgent.run({ userId, trigger: "schedule" });
        const res = run.result as { skipped?: boolean } | null;
        if (res?.skipped) break;
        done++;
      }
      return { id: "-", status: `drained ${done} job(s)` };
    },
  };

export async function GET(
  req: Request,
  { params }: { params: Promise<{ job: string }> },
) {
  const { job } = await params;

  const auth = req.headers.get("authorization");
  if (!env.CRON_SECRET || auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const handler = JOBS[job];
  if (!handler) {
    return NextResponse.json({ error: `Unknown job: ${job}` }, { status: 404 });
  }

  try {
    await warmupDb();
    const userId = await getOwnerUserId();
    const result = await handler(userId);
    return NextResponse.json({ ok: true, job, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, job, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
