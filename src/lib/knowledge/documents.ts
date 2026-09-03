import { createHash } from "node:crypto";
import { Document } from "@langchain/core/documents";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  knowledgeChunks,
  knowledgeDocuments,
  type KnowledgeDocument,
} from "@/lib/db/schema";
import { chunkText, estimateTokens } from "./chunk";
import { SupabaseVectorStore } from "./store";

export interface UpsertDocInput {
  userId: string;
  /** repo_summary | file_summary | decision | concept | learning | conversation_insight | profile */
  docType: string;
  title: string;
  body: string;
  /** github_repo | upload | claude_transcripts | internal */
  sourceKind: string;
  /** stable pointer to the origin (repo/file/conversation/internal row) */
  sourceRef?: string | null;
  meta?: Record<string, unknown>;
}

export interface UpsertResult {
  document: KnowledgeDocument;
  created: boolean;
  chunks: number;
}

const hashOf = (i: UpsertDocInput): string =>
  createHash("sha256").update(`${i.docType}\n${i.title}\n${i.body}`).digest("hex");

/**
 * Idempotent upsert of a knowledge document.
 * - identical content (same `content_hash`) → no-op, returns the existing row
 * - changed content for the same `(sourceKind, sourceRef)` slot → the old row
 *   is marked `superseded_at` (its chunks cascade-delete) and a fresh row +
 *   chunks + embeddings are written
 */
export async function upsertDocument(
  input: UpsertDocInput,
): Promise<UpsertResult> {
  const contentHash = hashOf(input);

  const [existing] = await db
    .select()
    .from(knowledgeDocuments)
    .where(
      and(
        eq(knowledgeDocuments.userId, input.userId),
        eq(knowledgeDocuments.contentHash, contentHash),
      ),
    )
    .limit(1);

  if (existing) {
    if (existing.supersededAt) {
      await db
        .update(knowledgeDocuments)
        .set({ supersededAt: null, updatedAt: new Date() })
        .where(eq(knowledgeDocuments.id, existing.id));
    }
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(knowledgeChunks)
      .where(eq(knowledgeChunks.documentId, existing.id));
    return { document: existing, created: false, chunks: n };
  }

  if (input.sourceRef) {
    await db
      .update(knowledgeDocuments)
      .set({ supersededAt: new Date() })
      .where(
        and(
          eq(knowledgeDocuments.userId, input.userId),
          eq(knowledgeDocuments.sourceKind, input.sourceKind),
          eq(knowledgeDocuments.sourceRef, input.sourceRef),
          isNull(knowledgeDocuments.supersededAt),
        ),
      );
  }

  const [doc] = await db
    .insert(knowledgeDocuments)
    .values({
      userId: input.userId,
      docType: input.docType,
      title: input.title,
      body: input.body,
      sourceKind: input.sourceKind,
      sourceRef: input.sourceRef ?? null,
      meta: (input.meta ?? {}) as object,
      contentHash,
    })
    .returning();

  const pieces = await chunkText(input.body);
  if (pieces.length > 0) {
    const store = new SupabaseVectorStore(input.userId);
    await store.addDocuments(
      pieces.map(
        (content, i) =>
          new Document({
            pageContent: content,
            metadata: {
              documentId: doc.id,
              chunkIndex: i,
              tokenCount: estimateTokens(content),
            },
          }),
      ),
    );
  }

  return { document: doc, created: true, chunks: pieces.length };
}
