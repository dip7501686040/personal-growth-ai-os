import { db } from "@/lib/db";
import { aiUsage } from "@/lib/db/schema";
import type { AgentName, LlmProviderName, TokenUsage } from "./types";

export async function recordUsage(input: {
  userId: string;
  agentRunId: string | null;
  agentName: AgentName | null;
  provider: LlmProviderName;
  model: string;
  usage: TokenUsage;
  estimatedCostUsd: number | null;
  cached: boolean;
}): Promise<void> {
  await db.insert(aiUsage).values({
    userId: input.userId,
    agentRunId: input.agentRunId,
    agentName: input.agentName,
    provider: input.provider,
    model: input.model,
    inputTokens: input.usage.inputTokens,
    outputTokens: input.usage.outputTokens,
    estimatedCostUsd:
      input.estimatedCostUsd == null ? null : input.estimatedCostUsd.toFixed(8),
    cached: input.cached,
  });
}
