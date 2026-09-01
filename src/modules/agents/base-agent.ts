import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agentEvents, agentRuns, type AgentRun } from "@/lib/db/schema";
import type { AgentName } from "@/lib/llm";
import type {
  AgentContext,
  AgentResult,
  AgentRunOptions,
} from "./types";

type Status =
  | "triggered"
  | "running"
  | "gathering_context"
  | "analyzing"
  | "recommending"
  | "waiting_for_approval"
  | "completed"
  | "failed";

/**
 * Common lifecycle for every agent. Concrete agents implement the three
 * phases; this class persists the FSM to agent_runs / agent_events and makes
 * runs idempotent per (agent, triggerKey).
 */
export abstract class BaseAgent<Context = unknown, Analysis = unknown> {
  abstract readonly name: AgentName;

  protected abstract gatherContext(ctx: AgentContext): Promise<Context>;
  protected abstract analyze(
    ctx: AgentContext,
    context: Context,
  ): Promise<Analysis>;
  protected abstract buildRecommendations(
    ctx: AgentContext,
    context: Context,
    analysis: Analysis,
  ): Promise<AgentResult>;

  async run(opts: AgentRunOptions): Promise<AgentRun> {
    const { userId, trigger, triggerKey, force } = opts;

    if (triggerKey && !force) {
      const [existing] = await db
        .select()
        .from(agentRuns)
        .where(
          and(
            eq(agentRuns.userId, userId),
            eq(agentRuns.agentName, this.name),
            eq(agentRuns.triggerKey, triggerKey),
          ),
        )
        .orderBy(desc(agentRuns.createdAt))
        .limit(1);
      if (existing && existing.status === "completed") return existing;
      if (existing && existing.status === "waiting_for_approval") return existing;
    }

    const [run] = await db
      .insert(agentRuns)
      .values({
        userId,
        agentName: this.name,
        status: "triggered",
        triggerSource: trigger,
        triggerKey: triggerKey ?? null,
        startedAt: new Date(),
      })
      .returning();

    const ctx: AgentContext = {
      userId,
      agentRunId: run.id,
      trigger,
      log: (message, o) =>
        this.event(run.id, userId, message, o?.level ?? "info", o?.step, o?.data),
    };

    const setStatus = (status: Status, patch: Partial<AgentRun> = {}) =>
      db
        .update(agentRuns)
        .set({ status, currentStep: status, ...patch })
        .where(eq(agentRuns.id, run.id));

    try {
      await setStatus("running");
      await ctx.log("Run started", { step: "running" });

      await setStatus("gathering_context");
      const context = await this.gatherContext(ctx);
      await ctx.log("Context gathered", { step: "gathering_context" });

      await setStatus("analyzing");
      const analysis = await this.analyze(ctx, context);
      await ctx.log("Analysis complete", { step: "analyzing" });

      await setStatus("recommending");
      const outcome = await this.buildRecommendations(ctx, context, analysis);
      await ctx.log(outcome.summary, { step: "recommending" });

      const [finished] = await db
        .update(agentRuns)
        .set({
          status: outcome.needsApproval ? "waiting_for_approval" : "completed",
          currentStep: outcome.needsApproval
            ? "waiting_for_approval"
            : "completed",
          result: outcome.result as object,
          finishedAt: new Date(),
        })
        .where(eq(agentRuns.id, run.id))
        .returning();
      return finished;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.event(run.id, userId, message, "error", "failed");
      const [failed] = await db
        .update(agentRuns)
        .set({
          status: "failed",
          currentStep: "failed",
          error: message,
          finishedAt: new Date(),
        })
        .where(eq(agentRuns.id, run.id))
        .returning();
      return failed;
    }
  }

  private async event(
    agentRunId: string,
    userId: string,
    message: string,
    level: "info" | "warn" | "error",
    step?: string,
    data?: unknown,
  ): Promise<void> {
    await db.insert(agentEvents).values({
      agentRunId,
      userId,
      level,
      step: step ?? null,
      message,
      data: (data as object) ?? null,
    });
  }
}
