import { NextResponse } from "next/server";
import { warmupDb } from "@/lib/db";
import { env } from "@/lib/env";
import { getOwnerUserId } from "@/lib/owner";
import { learningAgent } from "@/modules/agents/learning-agent";

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
