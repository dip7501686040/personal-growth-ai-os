import type { TokenUsage } from "./types";

/** Approximate USD per 1M tokens. For rough cost tracking only — verify before
 * relying on these numbers. */
const PRICES: Record<string, { in: number; out: number }> = {
  "gemini-3.6-flash": { in: 0.3, out: 2.5 },
  "gemini-2.5-flash": { in: 0.3, out: 2.5 },
  "gemini-2.5-pro": { in: 1.25, out: 10 },
  "gpt-4.1": { in: 2, out: 8 },
  "gpt-4.1-mini": { in: 0.4, out: 1.6 },
  "gpt-4.1-nano": { in: 0.1, out: 0.4 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
};

export function estimateCostUsd(
  model: string,
  usage: TokenUsage,
): number | null {
  const p = PRICES[model];
  if (!p || usage.inputTokens == null || usage.outputTokens == null) return null;
  return (
    (usage.inputTokens / 1_000_000) * p.in +
    (usage.outputTokens / 1_000_000) * p.out
  );
}
