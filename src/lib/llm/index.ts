import { eq, and } from "drizzle-orm";
import type { ZodType } from "zod";
import { db } from "@/lib/db";
import { agentEvents, agentModelConfig, agentRuns } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { cacheKey, getCached, putCached } from "./cache";
import { GeminiProvider } from "./gemini";
import { MODEL_LADDER, type ModelChoice } from "./models";
import { OpenAIProvider } from "./openai";
import { estimateCostUsd } from "./pricing";
import { hasHeadroom } from "./quota";
import { recordUsage } from "./usage";
import {
  LlmError,
  type AgentName,
  type LLMProvider,
  type LlmProviderName,
} from "./types";

export type { AgentName } from "./types";
export { AGENT_MODEL_DEFAULTS, MODEL_LADDER } from "./models";

export function hasProviderKey(name: LlmProviderName): boolean {
  return name === "gemini" ? !!env.GEMINI_API_KEY : !!env.OPENAI_API_KEY;
}

function getProvider(name: LlmProviderName): LLMProvider {
  if (name === "gemini") {
    if (!env.GEMINI_API_KEY) {
      throw new LlmError("GEMINI_API_KEY is not set", "gemini");
    }
    return new GeminiProvider(env.GEMINI_API_KEY);
  }
  if (!env.OPENAI_API_KEY) {
    throw new LlmError("OPENAI_API_KEY is not set", "openai");
  }
  return new OpenAIProvider(env.OPENAI_API_KEY);
}

const sameChoice = (a: ModelChoice, b: ModelChoice) =>
  a.provider === b.provider && a.model === b.model;

/** Optional user override (from agent_model_config) first, then the agent ladder. */
async function buildLadder(
  userId: string,
  agent: AgentName,
): Promise<ModelChoice[]> {
  const ladder: ModelChoice[] = [];
  const [row] = await db
    .select()
    .from(agentModelConfig)
    .where(
      and(
        eq(agentModelConfig.userId, userId),
        eq(agentModelConfig.agentName, agent),
      ),
    )
    .limit(1);
  if (row) ladder.push({ provider: row.provider, model: row.model });
  for (const c of MODEL_LADDER[agent]) {
    if (!ladder.some((x) => sameChoice(x, c))) ladder.push(c);
  }
  return ladder;
}

export interface ResolvedModel {
  provider: LlmProviderName;
  model: string;
  /** True when every laddered model is out of API key / daily quota / credit. */
  exhausted: boolean;
}

/**
 * Picks the best model for an agent that still has an API key and daily-request
 * (Gemini free-tier RPD) / credit (OpenAI) headroom. Falls through the ladder;
 * marks `exhausted` when nothing is available so the agent uses its
 * deterministic fallback.
 */
export async function resolveModelConfig(
  userId: string,
  agent: AgentName,
): Promise<ResolvedModel> {
  const ladder = await buildLadder(userId, agent);
  for (const c of ladder) {
    if (!hasProviderKey(c.provider)) continue;
    if (await hasHeadroom(userId, c)) {
      return { provider: c.provider, model: c.model, exhausted: false };
    }
  }
  const firstKeyed = ladder.find((c) => hasProviderKey(c.provider)) ?? ladder[0];
  return { provider: firstKeyed.provider, model: firstKeyed.model, exhausted: true };
}

export interface RunStructuredArgs<T> {
  userId: string;
  agent: AgentName;
  agentRunId?: string | null;
  schema: ZodType<T>;
  schemaName: string;
  system?: string;
  prompt: string;
  temperature?: number;
  /** When true (default), identical inputs are served from llm_cache. */
  cache?: boolean;
}

export interface RunStructuredResult<T> {
  data: T;
  cached: boolean;
  provider: LlmProviderName;
  model: string;
}

async function logLine(
  runId: string | null | undefined,
  userId: string,
  message: string,
  level: "info" | "warn" | "error" = "info",
): Promise<void> {
  if (!runId) return;
  try {
    await db
      .insert(agentEvents)
      .values({ agentRunId: runId, userId, level, step: "analyzing", message });
  } catch {
    // logging must never break a run
  }
}

async function setRunModel(
  runId: string | null | undefined,
  provider: LlmProviderName,
  model: string,
): Promise<void> {
  if (!runId) return;
  try {
    await db
      .update(agentRuns)
      .set({ modelUsed: `${provider}/${model}` })
      .where(eq(agentRuns.id, runId));
  } catch {
    // ignore
  }
}

/**
 * The single entry point agents use for structured LLM calls. Walks the agent's
 * model ladder: skips models with no key / no quota, serves from cache, calls
 * the provider, and on a rate-limit (HTTP 429/5xx) falls back to the next model.
 */
export async function runStructured<T>(
  args: RunStructuredArgs<T>,
): Promise<RunStructuredResult<T>> {
  const useCache = args.cache !== false;
  const ladder = (await buildLadder(args.userId, args.agent)).filter((c) =>
    hasProviderKey(c.provider),
  );
  if (ladder.length === 0) {
    throw new LlmError("No AI provider API key configured", "gemini");
  }

  let lastError: unknown;

  for (let i = 0; i < ladder.length; i++) {
    const { provider, model } = ladder[i];
    const isLast = i === ladder.length - 1;

    if (!isLast && !(await hasHeadroom(args.userId, ladder[i]))) {
      await logLine(
        args.agentRunId,
        args.userId,
        `${provider}/${model} out of daily quota — trying next`,
        "warn",
      );
      continue;
    }

    const key = cacheKey({
      agent: args.agent,
      provider,
      model,
      system: args.system,
      prompt: args.prompt,
      schema: args.schemaName,
    });

    if (useCache) {
      const hit = await getCached(key);
      if (hit != null) {
        const parsed = args.schema.safeParse(hit);
        if (parsed.success) {
          await setRunModel(args.agentRunId, provider, model);
          await logLine(
            args.agentRunId,
            args.userId,
            `Using ${provider}/${model} — cached result`,
          );
          await recordUsage({
            userId: args.userId,
            agentRunId: args.agentRunId ?? null,
            agentName: args.agent,
            provider,
            model,
            usage: { inputTokens: 0, outputTokens: 0 },
            estimatedCostUsd: 0,
            cached: true,
          });
          return { data: parsed.data, cached: true, provider, model };
        }
      }
    }

    await setRunModel(args.agentRunId, provider, model);
    await logLine(
      args.agentRunId,
      args.userId,
      `Calling ${provider}/${model}…`,
    );

    try {
      const impl = getProvider(provider);
      const result = await impl.generateStructured({
        schema: args.schema,
        schemaName: args.schemaName,
        system: args.system,
        prompt: args.prompt,
        model,
        temperature: args.temperature,
      });

      await logLine(
        args.agentRunId,
        args.userId,
        `${provider}/${model} responded · ${result.usage.inputTokens ?? "?"}→${result.usage.outputTokens ?? "?"} tokens`,
      );
      await recordUsage({
        userId: args.userId,
        agentRunId: args.agentRunId ?? null,
        agentName: args.agent,
        provider,
        model,
        usage: result.usage,
        estimatedCostUsd: estimateCostUsd(model, result.usage),
        cached: false,
      });
      if (useCache) {
        await putCached(args.userId, key, provider, model, result.data);
      }
      return { data: result.data, cached: false, provider, model };
    } catch (err) {
      lastError = err;
      const status = err instanceof LlmError ? err.status : undefined;
      const rateLimited = status === 429 || status === 503 || status === 500;
      if (rateLimited && !isLast) {
        await logLine(
          args.agentRunId,
          args.userId,
          `${provider}/${model} rate-limited (HTTP ${status}) — falling back`,
          "warn",
        );
        continue;
      }
      throw err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new LlmError("All models exhausted or rate-limited", "gemini");
}

export { LlmError } from "./types";
