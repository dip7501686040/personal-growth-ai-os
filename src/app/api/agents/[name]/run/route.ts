import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { warmupDb } from "@/lib/db";
import { getAgent } from "@/modules/agents";

export const maxDuration = 60;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const user = await requireUser();
  const { name } = await params;

  const agent = getAgent(name);
  if (!agent) {
    return NextResponse.json({ error: `Unknown agent: ${name}` }, { status: 404 });
  }

  let input: Record<string, unknown> = {};
  try {
    const body = await req.json();
    if (body && typeof body === "object") input = body as Record<string, unknown>;
  } catch {
    // no body
  }

  // Wake / recycle the DB connection before the run so a paused free-tier
  // project doesn't leave the request hanging on the first query.
  try {
    await warmupDb();
  } catch {
    return NextResponse.json(
      { error: "Database is waking up — try again in a moment." },
      { status: 503 },
    );
  }

  try {
    // Manual runs are always "run now" — no idempotency key, so clicking the
    // button twice (or after an earlier run stalled) never collides with the
    // agent_runs (user, agent, trigger_key) unique index.
    const run = await agent.run({
      userId: user.id,
      trigger: "manual",
      input,
      signal: req.signal,
    });

    return NextResponse.json({
      id: run.id,
      status: run.status,
      error: run.error,
      summary: run.currentStep,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Agent run failed" },
      { status: 500 },
    );
  }
}
