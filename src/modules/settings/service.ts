import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agentModelConfig } from "@/lib/db/schema";
import { MODEL_LADDER, type ModelChoice } from "@/lib/llm/models";
import type { AgentName } from "@/lib/llm/types";

const ALL_AGENTS = Object.keys(MODEL_LADDER) as AgentName[];

export const choiceKey = (c: ModelChoice) => `${c.provider}:${c.model}`;

/**
 * The one model every agent uses first (settings "Preferred model"). Returns
 * `null` when no override is set (agents fall back to `MODEL_LADDER`) or when
 * per-agent rows disagree (only possible via direct DB edits — the UI always
 * writes them uniformly).
 */
export async function getPreferredModel(
  userId: string,
): Promise<ModelChoice | null> {
  const rows = await db
    .select({
      provider: agentModelConfig.provider,
      model: agentModelConfig.model,
    })
    .from(agentModelConfig)
    .where(eq(agentModelConfig.userId, userId));

  if (rows.length === 0) return null;
  const keys = new Set(rows.map((r) => `${r.provider}:${r.model}`));
  if (keys.size !== 1) return null;
  return { provider: rows[0].provider, model: rows[0].model };
}

/**
 * Set (or clear) the preferred model for every agent. `null` deletes all
 * overrides so agents revert to their default ladder. Otherwise upserts one
 * row per agent — `buildLadder` then puts this choice on top of each agent's
 * ladder, with the existing Gemini/OpenAI chain behind it as fallback.
 */
export async function setPreferredModel(
  userId: string,
  choice: ModelChoice | null,
): Promise<void> {
  if (!choice) {
    await db
      .delete(agentModelConfig)
      .where(eq(agentModelConfig.userId, userId));
    return;
  }

  for (const agentName of ALL_AGENTS) {
    await db
      .insert(agentModelConfig)
      .values({
        userId,
        agentName,
        provider: choice.provider,
        model: choice.model,
      })
      .onConflictDoUpdate({
        target: [agentModelConfig.userId, agentModelConfig.agentName],
        set: {
          provider: choice.provider,
          model: choice.model,
          updatedAt: new Date(),
        },
      });
  }
}
