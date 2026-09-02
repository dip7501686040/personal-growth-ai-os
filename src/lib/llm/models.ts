import type { AgentName, LlmProviderName } from "./types";

export interface ModelChoice {
  provider: LlmProviderName;
  model: string;
}

// Best output → cheapest/most-available fallback.
const GEMINI_BEST: ModelChoice = { provider: "gemini", model: "gemini-3.6-flash" };
const GEMINI_LITE: ModelChoice = {
  provider: "gemini",
  model: "gemini-3.5-flash-lite",
};
const OPENAI_BEST: ModelChoice = { provider: "openai", model: "gpt-4.1-mini" };
const OPENAI_CHEAP: ModelChoice = { provider: "openai", model: "gpt-4o-mini" };

/**
 * Per-agent model ladder. `resolveModelConfig` / `runStructured` walk this in
 * order and use the first entry that (a) has an API key and (b) still has
 * daily-request / credit headroom. When the top model's free-tier RPD is spent,
 * the next one takes over automatically; if all are exhausted the agent falls
 * back to its deterministic path.
 *
 * Gemini free tier: 3.6-flash = 20 requests/day, 3.5-flash-lite = 500/day.
 */
export const MODEL_LADDER: Record<AgentName, ModelChoice[]> = {
  learning: [GEMINI_BEST, GEMINI_LITE, OPENAI_CHEAP],
  project: [GEMINI_BEST, GEMINI_LITE, OPENAI_CHEAP],
  content: [GEMINI_BEST, GEMINI_LITE, OPENAI_CHEAP],
  business: [GEMINI_BEST, GEMINI_LITE, OPENAI_CHEAP],
  chief_of_staff: [GEMINI_BEST, GEMINI_LITE, OPENAI_CHEAP],
  career: [OPENAI_BEST, OPENAI_CHEAP, GEMINI_LITE],
  activity_analyzer: [OPENAI_BEST, OPENAI_CHEAP, GEMINI_LITE],
};

/** Top of each ladder — the model an agent uses when nothing is constrained. */
export const AGENT_MODEL_DEFAULTS: Record<AgentName, ModelChoice> =
  Object.fromEntries(
    (Object.keys(MODEL_LADDER) as AgentName[]).map((a) => [a, MODEL_LADDER[a][0]]),
  ) as Record<AgentName, ModelChoice>;
