import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgeChunks } from "@/lib/db/schema";

export const toVectorLiteral = (v: number[]): string => `[${v.join(",")}]`;

/**
 * Mean-pool a document's chunk embeddings into one query vector for kNN
 * candidate generation. Reuses the embeddings already paid for at ingestion —
 * mapping never re-embeds the document itself. Returns null if the doc has no
 * embedded chunks yet (nothing to compare against).
 */
export async function docVector(
  documentId: string,
): Promise<{ vector: number[]; model: string } | null> {
  const rows = await db
    .select({
      embedding: knowledgeChunks.embedding,
      model: knowledgeChunks.embeddingModel,
    })
    .from(knowledgeChunks)
    .where(eq(knowledgeChunks.documentId, documentId));

  const embedded = rows.filter(
    (r): r is { embedding: number[]; model: string } =>
      r.embedding != null && r.model != null,
  );
  if (embedded.length === 0) return null;

  // Chunks of one doc are always written by the same embed() call, so they
  // share a model — but guard against a stale mix after a provider switch.
  const model = embedded[0].model;
  const usable = embedded.filter((r) => r.model === model);
  const dims = usable[0].embedding.length;
  const sum = new Array<number>(dims).fill(0);
  for (const r of usable) {
    for (let i = 0; i < dims; i++) sum[i] += r.embedding[i];
  }
  return { vector: sum.map((x) => x / usable.length), model };
}
