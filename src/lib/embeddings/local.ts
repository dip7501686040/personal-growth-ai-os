import { EMBEDDING_DIMENSIONS, type EmbeddingProvider } from "./types";

/**
 * Local, $0, no-API embedding via Transformers.js. `bge-base-en-v1.5` outputs
 * 768 dimensions and uses CLS pooling. The ~110 MB model is downloaded once to
 * a cache dir. Intended for offline work and the one-time history backfill;
 * production uses Gemini.
 */
const MODEL = "Xenova/bge-base-en-v1.5";

type FeaturePipeline = (
  text: string,
  opts: { pooling: "cls" | "mean"; normalize: boolean },
) => Promise<{ data: Float32Array | number[] }>;

let pipePromise: Promise<FeaturePipeline> | null = null;

function getPipe(): Promise<FeaturePipeline> {
  if (!pipePromise) {
    pipePromise = (async () => {
      const mod = await import("@huggingface/transformers");
      mod.env.cacheDir = ".cache/transformers";
      return (await mod.pipeline(
        "feature-extraction",
        MODEL,
      )) as unknown as FeaturePipeline;
    })();
  }
  return pipePromise;
}

export class LocalEmbeddings implements EmbeddingProvider {
  readonly id = `local:${MODEL}`;
  readonly dimensions = EMBEDDING_DIMENSIONS;

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const pipe = await getPipe();
    const out: number[][] = [];
    for (const text of texts) {
      const res = await pipe(text, { pooling: "cls", normalize: true });
      out.push(Array.from(res.data));
    }
    return out;
  }
}
