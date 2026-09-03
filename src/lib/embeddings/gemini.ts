import { EMBEDDING_DIMENSIONS, type EmbeddingProvider } from "./types";

/**
 * Google's current embedding model. It defaults to 3072 dimensions; we request
 * 768 (Matryoshka truncation) to match the local model and stay within
 * pgvector's 2000-dim HNSW index limit. Truncated vectors are not unit-length,
 * so we L2-normalize before returning.
 */
const MODEL = "gemini-embedding-001";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents`;
const BATCH = 100;

interface BatchResponse {
  embeddings?: { values: number[] }[];
  error?: { message?: string };
}

function l2normalize(v: number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  const norm = Math.sqrt(sum) || 1;
  return v.map((x) => x / norm);
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const retryable = /429|rate|quota|5\d\d|timeout|ECONNRESET|fetch failed/i.test(
        msg,
      );
      if (i === attempts || !retryable) throw err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** (i - 1)));
    }
  }
  throw lastErr;
}

export class GeminiEmbeddings implements EmbeddingProvider {
  readonly id = `gemini:${MODEL}@${EMBEDDING_DIMENSIONS}`;
  readonly dimensions = EMBEDDING_DIMENSIONS;

  constructor(private readonly apiKey: string) {}

  private async embedBatch(texts: string[]): Promise<number[][]> {
    const body = {
      requests: texts.map((text) => ({
        model: `models/${MODEL}`,
        content: { parts: [{ text }] },
        outputDimensionality: EMBEDDING_DIMENSIONS,
      })),
    };
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": this.apiKey,
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as BatchResponse;
    if (!res.ok || !json.embeddings) {
      throw new Error(
        json.error?.message ?? `Gemini embeddings HTTP ${res.status}`,
      );
    }
    return json.embeddings.map((e) => l2normalize(e.values));
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH) {
      const slice = texts.slice(i, i + BATCH);
      out.push(...(await withRetry(() => this.embedBatch(slice))));
    }
    return out;
  }
}
