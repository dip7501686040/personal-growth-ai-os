import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgeDocuments } from "@/lib/db/schema";
import { docVector, toVectorLiteral } from "./vector";

/**
 * Cosine-similarity floor above which two documents from *different* sources
 * are treated as describing the same real event (a GitHub commit and a Claude
 * transcript narrating the same coding session, say). Conservative starting
 * point — needs the same real-data calibration K2's embedding floor needed
 * before it can be trusted; verify against actual near-duplicate pairs.
 */
const DUPLICATE_FLOOR = 0.9;
/** Only compare against documents created within this many days. */
const RECENT_DAYS = 14;

interface SimilarChunk {
  id: string;
  sim: number;
}

/**
 * After a document is embedded, check whether it's really just a re-telling
 * of something another source already captured. Compares at the chunk level
 * (max similarity per candidate document, not a document-level mean-pool
 * comparison) — deliberately avoids relying on a SQL `avg(vector)` aggregate,
 * same reasoning as mapping's candidate generation. If a match clears the
 * floor, marks the newer document `superseded_at` — the exact mechanism that
 * already hides superseded rows from every list/search/mapping query,
 * instead of inventing a second one — and records which document it
 * duplicates in `meta.duplicateOf` for traceability. Nothing is deleted.
 */
export async function checkCrossSourceDuplicate(
  userId: string,
  documentId: string,
): Promise<string | null> {
  const [doc] = await db
    .select({ sourceKind: knowledgeDocuments.sourceKind })
    .from(knowledgeDocuments)
    .where(
      and(eq(knowledgeDocuments.userId, userId), eq(knowledgeDocuments.id, documentId)),
    )
    .limit(1);
  if (!doc) return null;

  const dv = await docVector(documentId);
  if (!dv) return null;

  const lit = toVectorLiteral(dv.vector);
  const since = new Date(
    Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const rows = await db.execute(sql`
    select kc.document_id as id, max(1 - (kc.embedding <=> ${lit}::vector)) as sim
    from knowledge_chunks kc
    join knowledge_documents kd on kd.id = kc.document_id
    where kd.user_id = ${userId}
      and kd.id != ${documentId}
      and kd.source_kind != ${doc.sourceKind}
      and kd.superseded_at is null
      and kd.created_at >= ${since}::timestamptz
      and kc.embedding_model = ${dv.model}
      and kc.embedding is not null
    group by kc.document_id
    order by sim desc
    limit 1
  `);

  const [best] = rows as unknown as SimilarChunk[];
  if (!best || Number(best.sim) < DUPLICATE_FLOOR) return null;

  await db
    .update(knowledgeDocuments)
    .set({
      supersededAt: new Date(),
      meta: sql`${knowledgeDocuments.meta} || ${JSON.stringify({ duplicateOf: best.id })}::jsonb`,
    })
    .where(eq(knowledgeDocuments.id, documentId));

  return best.id;
}
