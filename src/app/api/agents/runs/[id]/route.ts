import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRun, getRunEvents, reapStaleRuns } from "@/modules/agents/runs";
import { computeQuota } from "@/lib/llm/quota";

/** Authoritative snapshot of one agent run + its event log (for the run console). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await params;

  await reapStaleRuns(user.id);
  const run = await getRun(user.id, id);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const [events, quota] = await Promise.all([
    getRunEvents(user.id, id),
    computeQuota(user.id, run.modelUsed),
  ]);

  return NextResponse.json({
    runId: run.id,
    agent: run.agentName,
    status: run.status,
    model: run.modelUsed,
    startedAt: run.startedAt?.toISOString() ?? null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
    error: run.error,
    inputTokens: run.inputTokens,
    outputTokens: run.outputTokens,
    estimatedCostUsd:
      run.estimatedCostUsd != null ? Number(run.estimatedCostUsd) : null,
    quota,
    lines: events.map((e) => ({
      id: e.id,
      ts: e.ts.toISOString(),
      level: e.level,
      step: e.step,
      message: e.message,
    })),
  });
}
