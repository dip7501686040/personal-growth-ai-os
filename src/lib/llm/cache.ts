import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { llmCache } from "@/lib/db/schema";
import type { LlmProviderName } from "./types";

/** Stable hash of everything that determines an LLM response. */
export function cacheKey(parts: {
  agent: string;
  provider: string;
  model: string;
  system?: string;
  prompt: string;
  schema?: unknown;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        a: parts.agent,
        p: parts.provider,
        m: parts.model,
        s: parts.system ?? "",
        u: parts.prompt,
        sc: parts.schema ?? null,
      }),
    )
    .digest("hex");
}

export async function getCached(key: string): Promise<unknown | null> {
  const [row] = await db
    .select({ response: llmCache.response })
    .from(llmCache)
    .where(eq(llmCache.cacheKey, key))
    .limit(1);
  return row?.response ?? null;
}

export async function putCached(
  userId: string,
  key: string,
  provider: LlmProviderName,
  model: string,
  response: unknown,
): Promise<void> {
  await db
    .insert(llmCache)
    .values({
      userId,
      cacheKey: key,
      provider,
      model,
      response: response as object,
    })
    .onConflictDoNothing({ target: llmCache.cacheKey });
}
