import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  agentEvents,
  agentRuns,
  aiUsage,
  type AgentRun,
} from "@/lib/db/schema";
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
    const input = opts.input ?? {};

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
        inputSummary: input as object,
        startedAt: new Date(),
      })
      .returning();

    const ctx: AgentContext = {
      userId,
      agentRunId: run.id,
      trigger,
      input,
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

      const usage = await this.sumUsage(run.id, userId);
      if (usage.inputTokens + usage.outputTokens > 0) {
        await ctx.log(
          `Tokens: ${usage.inputTokens} in / ${usage.outputTokens} out` +
            (usage.estimatedCostUsd
              ? ` · ~$${usage.estimatedCostUsd.toFixed(4)}`
              : ""),
          { step: "completed" },
        );
      }

      const [finished] = await db
        .update(agentRuns)
        .set({
          status: outcome.needsApproval ? "waiting_for_approval" : "completed",
          currentStep: outcome.needsApproval
            ? "waiting_for_approval"
            : "completed",
          result: outcome.result as object,
          finishedAt: new Date(),
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          estimatedCostUsd: usage.estimatedCostUsd
            ? usage.estimatedCostUsd.toFixed(6)
            : null,
        })
        .where(eq(agentRuns.id, run.id))
        .returning();
      return finished;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.event(run.id, userId, message, "error", "failed");
      const usage = await this.sumUsage(run.id, userId);
      const [failed] = await db
        .update(agentRuns)
        .set({
          status: "failed",
          currentStep: "failed",
          error: message,
          finishedAt: new Date(),
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          estimatedCostUsd: usage.estimatedCostUsd
            ? usage.estimatedCostUsd.toFixed(6)
            : null,
        })
        .where(eq(agentRuns.id, run.id))
        .returning();
      return failed;
    }
  }

  /** Sums every LLM call recorded for this run (from ai_usage). */
  private async sumUsage(
    runId: string,
    userId: string,
  ): Promise<{
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  }> {
    const [row] = await db
      .select({
        i: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::int`,
        o: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::int`,
        c: sql<string>`coalesce(sum(${aiUsage.estimatedCostUsd}), 0)`,
      })
      .from(aiUsage)
      .where(and(eq(aiUsage.userId, userId), eq(aiUsage.agentRunId, runId)));
    return {
      inputTokens: row?.i ?? 0,
      outputTokens: row?.o ?? 0,
      estimatedCostUsd: row ? Number(row.c) : 0,
    };
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
