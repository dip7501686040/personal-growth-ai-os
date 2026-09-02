import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  agentEvents,
  agentRuns,
  type AgentEvent,
  type AgentRun,
} from "@/lib/db/schema";
import type { AgentName } from "@/lib/llm";
import { computeQuota, type QuotaSummary } from "@/lib/llm/quota";

export async function getLatestRun(
  userId: string,
  agentName: AgentName,
): Promise<AgentRun | null> {
  const [row] = await db
    .select()
    .from(agentRuns)
    .where(
      and(eq(agentRuns.userId, userId), eq(agentRuns.agentName, agentName)),
    )
    .orderBy(desc(agentRuns.createdAt))
    .limit(1);
  return row ?? null;
}

export async function listRuns(
  userId: string,
  opts?: { agentName?: AgentName; limit?: number },
): Promise<AgentRun[]> {
  const where = opts?.agentName
    ? and(eq(agentRuns.userId, userId), eq(agentRuns.agentName, opts.agentName))
    : eq(agentRuns.userId, userId);
  return db
    .select()
    .from(agentRuns)
    .where(where)
    .orderBy(desc(agentRuns.createdAt))
    .limit(opts?.limit ?? 30);
}

const ALL_AGENT_NAMES: AgentName[] = [
  "learning",
  "project",
  "career",
  "content",
  "business",
  "chief_of_staff",
  "activity_analyzer",
];

export interface AgentStatusRow {
  agent: string;
  status: string;
  step: string | null;
  at: string | null;
  runId: string | null;
}

/** One row per known agent, defaulting to "never_run" when no run exists yet. */
export async function getAgentStatusBoard(
  userId: string,
): Promise<AgentStatusRow[]> {
  const runs = await Promise.all(
    ALL_AGENT_NAMES.map((n) => getLatestRun(userId, n)),
  );
  return ALL_AGENT_NAMES.map((agent, i) => {
    const r = runs[i];
    return {
      agent,
      status: r?.status ?? "never_run",
      step: r?.currentStep ?? null,
      at: (r?.finishedAt ?? r?.startedAt ?? r?.createdAt)?.toISOString() ?? null,
      runId: r?.id ?? null,
    };
  });
}

export async function getRun(
  userId: string,
  runId: string,
): Promise<AgentRun | null> {
  const [row] = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.userId, userId), eq(agentRuns.id, runId)))
    .limit(1);
  return row ?? null;
}

export async function getRunEvents(
  userId: string,
  runId: string,
): Promise<AgentEvent[]> {
  return db
    .select()
    .from(agentEvents)
    .where(
      and(eq(agentEvents.userId, userId), eq(agentEvents.agentRunId, runId)),
    )
    .orderBy(agentEvents.ts);
}

export interface ConsoleLine {
  id: string;
  ts: string;
  level: string;
  step: string | null;
  message: string;
}

export interface AgentConsoleData {
  runId: string | null;
  status: string;
  model: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number | null;
  quota: QuotaSummary | null;
  lines: ConsoleLine[];
}

/** Latest run for one agent + its event log — seeds the live run console. */
export async function getAgentConsole(
  userId: string,
  agentName: AgentName,
): Promise<AgentConsoleData> {
  const run = await getLatestRun(userId, agentName);
  if (!run) {
    return {
      runId: null,
      status: "never_run",
      model: null,
      startedAt: null,
      finishedAt: null,
      error: null,
      inputTokens: null,
      outputTokens: null,
      estimatedCostUsd: null,
      quota: null,
      lines: [],
    };
  }
  const [events, quota] = await Promise.all([
    getRunEvents(userId, run.id),
    computeQuota(userId, run.modelUsed),
  ]);
  return {
    runId: run.id,
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
  };
}

export interface TimelineEntry {
  id: string;
  ts: string;
  agent: string;
  level: string;
  step: string | null;
  message: string;
}

/** Flattened, most-recent-first log of agent_events across recent runs. */
export async function getRecentTimeline(
  userId: string,
  limit = 40,
): Promise<{ entries: TimelineEntry[]; runAgentMap: Record<string, string> }> {
  const runs = await listRuns(userId, { limit: 15 });
  if (runs.length === 0) return { entries: [], runAgentMap: {} };

  const events = await db
    .select()
    .from(agentEvents)
    .where(
      and(
        eq(agentEvents.userId, userId),
        inArray(
          agentEvents.agentRunId,
          runs.map((r) => r.id),
        ),
      ),
    )
    .orderBy(desc(agentEvents.ts))
    .limit(limit);

  const runAgentMap = Object.fromEntries(runs.map((r) => [r.id, r.agentName]));
  const entries: TimelineEntry[] = events.map((e) => ({
    id: e.id,
    ts: e.ts.toISOString(),
    agent: runAgentMap[e.agentRunId] ?? "unknown",
    level: e.level,
    step: e.step,
    message: e.message,
  }));

  return { entries, runAgentMap };
}
