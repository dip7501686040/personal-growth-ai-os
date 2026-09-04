import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgeChunks, knowledgeDocuments } from "@/lib/db/schema";

export interface KnowledgeStats {
  documents: number;
  chunks: number;
  byType: { docType: string; n: number }[];
  bySource: { sourceKind: string; n: number }[];
  byModel: { model: string | null; n: number }[];
}

export async function knowledgeStats(userId: string): Promise<KnowledgeStats> {
  const [{ documents }] = await db
    .select({ documents: sql<number>`count(*)::int` })
    .from(knowledgeDocuments)
    .where(
      and(
        eq(knowledgeDocuments.userId, userId),
        isNull(knowledgeDocuments.supersededAt),
      ),
    );
  const [{ chunks }] = await db
    .select({ chunks: sql<number>`count(*)::int` })
    .from(knowledgeChunks)
    .where(eq(knowledgeChunks.userId, userId));

  const byType = await db
    .select({
      docType: knowledgeDocuments.docType,
      n: sql<number>`count(*)::int`,
    })
    .from(knowledgeDocuments)
    .where(
      and(
        eq(knowledgeDocuments.userId, userId),
        isNull(knowledgeDocuments.supersededAt),
      ),
    )
    .groupBy(knowledgeDocuments.docType)
    .orderBy(sql`count(*) desc`);

  const bySource = await db
    .select({
      sourceKind: knowledgeDocuments.sourceKind,
      n: sql<number>`count(*)::int`,
    })
    .from(knowledgeDocuments)
    .where(
      and(
        eq(knowledgeDocuments.userId, userId),
        isNull(knowledgeDocuments.supersededAt),
      ),
    )
    .groupBy(knowledgeDocuments.sourceKind)
    .orderBy(sql`count(*) desc`);

  const byModel = await db
    .select({
      model: knowledgeChunks.embeddingModel,
      n: sql<number>`count(*)::int`,
    })
    .from(knowledgeChunks)
    .where(eq(knowledgeChunks.userId, userId))
    .groupBy(knowledgeChunks.embeddingModel)
    .orderBy(sql`count(*) desc`);

  return { documents, chunks, byType, bySource, byModel };
}
