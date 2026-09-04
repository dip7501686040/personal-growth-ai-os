import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgeDocumentTags } from "@/lib/db/schema";
import { docVector, toVectorLiteral } from "./doc-vector";

const TOP_N = 2;
// Calibrated alongside candidates.ts's EMBED_FLOOR — observed taxonomy-centroid
// confidences ranged ~0.35–0.68; 0.45 keeps a doc's real subject(s) without
// padding to 2 tags when the second-best doesn't actually fit.
const FLOOR = 0.45;

interface TagHit {
  slug: string;
  sim: number;
}

/**
 * Classify a document against the taxonomy centroids (cosine similarity, no
 * model call) and upsert its top matches. Unlike knowledge_links this is
 * informational, not review-tracked, so re-classifying just refreshes it.
 */
export async function classifyDocumentTags(
  userId: string,
  doc: { id: string },
): Promise<number> {
  const dv = await docVector(doc.id);
  if (!dv) return 0;

  const lit = toVectorLiteral(dv.vector);
  const hits = await db.execute(sql`
    select slug, 1 - (embedding <=> ${lit}::vector) as sim
    from knowledge_taxonomy
    where embedding is not null
    order by embedding <=> ${lit}::vector
    limit ${TOP_N}
  `);

  let n = 0;
  for (const h of hits as unknown as TagHit[]) {
    const sim = Number(h.sim);
    if (sim < FLOOR) continue;
    await db
      .insert(knowledgeDocumentTags)
      .values({
        userId,
        documentId: doc.id,
        tagSlug: h.slug,
        confidence: sim,
        method: "centroid_similarity",
      })
      .onConflictDoUpdate({
        target: [knowledgeDocumentTags.documentId, knowledgeDocumentTags.tagSlug],
        set: { confidence: sim, method: "centroid_similarity" },
      });
    n++;
  }
  return n;
}
