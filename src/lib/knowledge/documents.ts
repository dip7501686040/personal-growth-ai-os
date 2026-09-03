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

export interface UpsertRowResult {
  document: KnowledgeDocument;
  /** false when identical content already existed (nothing to (re-)embed) */
  created: boolean;
}

const hashOf = (i: UpsertDocInput): string =>
  createHash("sha256").update(`${i.docType}\n${i.title}\n${i.body}`).digest("hex");

/**
 * Idempotent upsert of the `knowledge_documents` row only (no chunks/embeddings).
 * - identical content (same `content_hash`) → no-op, `created: false`
 * - changed content for the same `(sourceKind, sourceRef)` slot → old row
 *   marked `superseded_at` (its chunks cascade-delete), fresh row inserted
 */
export async function upsertDocumentRow(
  input: UpsertDocInput,
): Promise<UpsertRowResult> {
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
    return { document: existing, created: false };
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

  const [document] = await db
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

  return { document, created: true };
}

/** Chunk + embed a document's body into `knowledge_chunks`. Idempotent per
 *  (userId, embedding model): existing chunks for the doc are cleared first. */
export async function embedDocument(
  userId: string,
  documentId: string,
  body: string,
): Promise<number> {
  await db
    .delete(knowledgeChunks)
    .where(eq(knowledgeChunks.documentId, documentId));

  const pieces = await chunkText(body);
  if (pieces.length === 0) return 0;

  const store = new SupabaseVectorStore(userId);
  await store.addDocuments(
    pieces.map(
      (content, i) =>
        new Document({
          pageContent: content,
          metadata: {
            documentId,
            chunkIndex: i,
            tokenCount: estimateTokens(content),
          },
        }),
    ),
  );
  return pieces.length;
}

export interface UpsertResult {
  document: KnowledgeDocument;
  created: boolean;
  chunks: number;
}

/** Row + chunks + embeddings in one call. */
export async function upsertDocument(
  input: UpsertDocInput,
): Promise<UpsertResult> {
  const { document, created } = await upsertDocumentRow(input);
  if (!created) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(knowledgeChunks)
      .where(eq(knowledgeChunks.documentId, document.id));
    return { document, created: false, chunks: n };
  }
  const chunks = await embedDocument(input.userId, document.id, input.body);
  return { document, created: true, chunks };
}
