import { eq, and } from "drizzle-orm";
import type { ZodType } from "zod";
import { db } from "@/lib/db";
import { agentModelConfig } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { cacheKey, getCached, putCached } from "./cache";
import { GeminiProvider } from "./gemini";
import { OpenAIProvider } from "./openai";
import { estimateCostUsd } from "./pricing";
import { recordUsage } from "./usage";
import {
  LlmError,
  type AgentName,
  type LLMProvider,
  type LlmProviderName,
} from "./types";

export type { AgentName } from "./types";

export const AGENT_MODEL_DEFAULTS: Record<
  AgentName,
  { provider: LlmProviderName; model: string }
> = {
  learning: { provider: "gemini", model: "gemini-2.5-flash" },
  project: { provider: "gemini", model: "gemini-2.5-flash" },
  content: { provider: "gemini", model: "gemini-2.5-flash" },
  business: { provider: "gemini", model: "gemini-2.5-flash" },
  chief_of_staff: { provider: "gemini", model: "gemini-2.5-flash" },
  career: { provider: "openai", model: "gpt-4.1-mini" },
  activity_analyzer: { provider: "openai", model: "gpt-4.1-mini" },
};

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

/** Reads the per-agent model config, creating the default row on first use. */
export async function resolveModelConfig(
  userId: string,
  agent: AgentName,
): Promise<{ provider: LlmProviderName; model: string }> {
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
  if (row) return { provider: row.provider, model: row.model };

  const def = AGENT_MODEL_DEFAULTS[agent];
  await db
    .insert(agentModelConfig)
    .values({ userId, agentName: agent, provider: def.provider, model: def.model })
    .onConflictDoNothing();
  return def;
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

/**
 * The single entry point agents use for structured LLM calls. Resolves the
 * per-agent provider/model, serves from cache when possible, records usage,
 * and validates the output against the Zod schema.
 */
export async function runStructured<T>(
  args: RunStructuredArgs<T>,
): Promise<RunStructuredResult<T>> {
  const { provider, model } = await resolveModelConfig(args.userId, args.agent);
  const useCache = args.cache !== false;

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

  const impl = getProvider(provider);
  const result = await impl.generateStructured({
    schema: args.schema,
    schemaName: args.schemaName,
    system: args.system,
    prompt: args.prompt,
    model,
    temperature: args.temperature,
  });

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
}

export { LlmError } from "./types";
