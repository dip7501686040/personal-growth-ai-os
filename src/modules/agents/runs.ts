import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  agentEvents,
  agentRuns,
  type AgentEvent,
  type AgentRun,
} from "@/lib/db/schema";
import type { AgentName } from "@/lib/llm";

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
