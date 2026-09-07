/**
 * Smoke-test every configured LLM provider with a tiny structured call.
 * Skips any provider whose key isn't set.
 *
 *   pnpm llm:smoke
 */
import { z } from "zod";
import { env } from "@/lib/env";
import { AnthropicProvider } from "@/lib/llm/anthropic";
import { GeminiProvider } from "@/lib/llm/gemini";
import { OpenAIProvider } from "@/lib/llm/openai";
import { estimateCostUsd } from "@/lib/llm/pricing";
import type { LLMProvider } from "@/lib/llm/types";

const Schema = z.object({
  capital: z.string(),
  population_millions: z.number(),
});

const PROMPT =
  "Give one fact about France: its capital and approximate population in millions.";

async function run(label: string, model: string, provider: LLMProvider) {
  try {
    const r = await provider.generateStructured({
      schema: Schema,
      schemaName: "country_fact",
      prompt: PROMPT,
      model,
    });
    const cost = estimateCostUsd(model, r.usage);
    console.log(
      `  ${label} (${model}): OK ${JSON.stringify(r.data)} | tokens`,
      r.usage,
      `| ~$${cost?.toFixed(6) ?? "n/a"}`,
    );
  } catch (e) {
    console.log(
      `  ${label} (${model}): FAILED — ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

async function main() {
  console.log("LLM provider smoke test\n");

  if (env.OPENAI_API_KEY) {
    const p = new OpenAIProvider(env.OPENAI_API_KEY);
    await run("openai", "gpt-5", p);
    await run("openai", "gpt-4.1", p);
  } else console.log("  openai: skipped (no OPENAI_API_KEY)");

  if (env.ANTHROPIC_API_KEY) {
    await run("anthropic", "claude-sonnet-5", new AnthropicProvider(env.ANTHROPIC_API_KEY));
  } else console.log("  anthropic: skipped (no ANTHROPIC_API_KEY)");

  if (env.GEMINI_API_KEY) {
    await run("gemini", "gemini-3.6-flash", new GeminiProvider(env.GEMINI_API_KEY));
  } else console.log("  gemini: skipped (no GEMINI_API_KEY)");

  process.exit(0);
}

main();
