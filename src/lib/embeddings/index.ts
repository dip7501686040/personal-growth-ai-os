import { env } from "@/lib/env";
import { GeminiEmbeddings } from "./gemini";
import { LocalEmbeddings } from "./local";
import { EMBEDDING_DIMENSIONS, type EmbeddingProvider } from "./types";

export { EMBEDDING_DIMENSIONS };
export type { EmbeddingProvider };

let cached: EmbeddingProvider | null = null;

/**
 * The configured embedding backend. `EMBEDDINGS_PROVIDER`:
 *   auto (default) → Gemini when GEMINI_API_KEY is set, else local
 *   gemini         → Gemini (errors if no key)
 *   local          → Transformers.js
 */
export function getEmbeddingProvider(): EmbeddingProvider {
  if (cached) return cached;
  const choice = env.EMBEDDINGS_PROVIDER ?? "auto";
  const useGemini =
    choice === "gemini" || (choice === "auto" && !!env.GEMINI_API_KEY);

  if (useGemini) {
    if (!env.GEMINI_API_KEY) {
      throw new Error(
        "EMBEDDINGS_PROVIDER=gemini but GEMINI_API_KEY is not set",
      );
    }
    cached = new GeminiEmbeddings(env.GEMINI_API_KEY);
  } else {
    cached = new LocalEmbeddings();
  }
  return cached;
}

/** Reset the cached provider — tests only. */
export function _resetEmbeddingProvider(): void {
  cached = null;
}

/** Embed a batch with the configured provider. */
export function embed(texts: string[]): Promise<number[][]> {
  return getEmbeddingProvider().embed(texts);
}
