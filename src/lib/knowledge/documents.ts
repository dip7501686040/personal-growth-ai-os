import { createHash } from "node:crypto";
import { Document } from "@langchain/core/documents";
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  knowledgeChunks,
  knowledgeDocuments,
  type KnowledgeDocument,
} from "@/lib/db/schema";
import { decodeCursor, encodeCursor, type Page } from "@/lib/paginate";
import { chunkText, estimateTokens } from "./chunk";
import {
  docIdsForSkills,
  docIdsForTargetTypes,
  intersectRestrictions,
  searchDocIds,
} from "./filters";
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

// ── read models (Knowledge page) ──────────────────────────────────────────

export interface KnowledgeDocListItem {
  id: string;
  title: string;
  docType: string;
  sourceKind: string;
  sourceRef: string | null;
  chunkCount: number;
  supersededAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeDocumentFilters {
  limit?: number;
  cursor?: string | null;
  docType?: string;
  sourceKind?: string;
  includeSuperseded?: boolean;
  /** free text — title, body, a linked skill/project/etc. name, or a tag label */
  q?: string;
  /** match a document linked (not-rejected) to ANY of these skill ids */
  skillIds?: string[];
  /** match a document linked (not-rejected) to ANY of these module target types
   *  (project | career_opportunity | content_item | business_opportunity |
   *  learning_session | dsa_pattern) */
  targetTypes?: string[];
}

export async function listKnowledgeDocuments(
  userId: string,
  opts?: KnowledgeDocumentFilters,
): Promise<Page<KnowledgeDocListItem>> {
  const limit = opts?.limit ?? 10;
  const cur = decodeCursor(opts?.cursor);

  const restrictIds = intersectRestrictions(
    opts?.skillIds?.length ? await docIdsForSkills(userId, opts.skillIds) : undefined,
    opts?.targetTypes?.length
      ? await docIdsForTargetTypes(userId, opts.targetTypes)
      : undefined,
    opts?.q?.trim() ? await searchDocIds(userId, opts.q.trim()) : undefined,
  );
  // a filter was active but matched nothing — short-circuit, don't run `in ()`
  if (restrictIds && restrictIds.length === 0) {
    return { items: [], nextCursor: null };
  }

  const rows = await db
    .select({
      id: knowledgeDocuments.id,
      title: knowledgeDocuments.title,
      docType: knowledgeDocuments.docType,
      sourceKind: knowledgeDocuments.sourceKind,
      sourceRef: knowledgeDocuments.sourceRef,
      supersededAt: knowledgeDocuments.supersededAt,
      createdAt: knowledgeDocuments.createdAt,
      updatedAt: knowledgeDocuments.updatedAt,
      chunkCount: sql<number>`count(${knowledgeChunks.id})::int`,
    })
    .from(knowledgeDocuments)
    .leftJoin(
      knowledgeChunks,
      eq(knowledgeChunks.documentId, knowledgeDocuments.id),
    )
    .where(
      and(
        eq(knowledgeDocuments.userId, userId),
        opts?.includeSuperseded
          ? undefined
          : isNull(knowledgeDocuments.supersededAt),
        opts?.docType ? eq(knowledgeDocuments.docType, opts.docType) : undefined,
        opts?.sourceKind
          ? eq(knowledgeDocuments.sourceKind, opts.sourceKind)
          : undefined,
        restrictIds ? inArray(knowledgeDocuments.id, restrictIds) : undefined,
        cur
          ? or(
              lt(knowledgeDocuments.createdAt, cur.createdAt),
              and(
                eq(knowledgeDocuments.createdAt, cur.createdAt),
                lt(knowledgeDocuments.id, cur.id),
              ),
            )
          : undefined,
      ),
    )
    .groupBy(knowledgeDocuments.id)
    .orderBy(desc(knowledgeDocuments.createdAt), desc(knowledgeDocuments.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const last = pageRows.at(-1);
  return {
    items: pageRows.map((r) => ({
      ...r,
      supersededAt: r.supersededAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    nextCursor:
      hasMore && last
        ? encodeCursor({ createdAt: last.createdAt, id: last.id })
        : null,
  };
}

/** Documents produced by a given ingestion job (via `meta.jobId`). */
export async function listDocumentsByJob(
  userId: string,
  jobId: string,
): Promise<KnowledgeDocListItem[]> {
  const rows = await db
    .select({
      id: knowledgeDocuments.id,
      title: knowledgeDocuments.title,
      docType: knowledgeDocuments.docType,
      sourceKind: knowledgeDocuments.sourceKind,
      sourceRef: knowledgeDocuments.sourceRef,
      supersededAt: knowledgeDocuments.supersededAt,
      createdAt: knowledgeDocuments.createdAt,
      updatedAt: knowledgeDocuments.updatedAt,
      chunkCount: sql<number>`count(${knowledgeChunks.id})::int`,
    })
    .from(knowledgeDocuments)
    .leftJoin(
      knowledgeChunks,
      eq(knowledgeChunks.documentId, knowledgeDocuments.id),
    )
    .where(
      and(
        eq(knowledgeDocuments.userId, userId),
        sql`${knowledgeDocuments.meta} ->> 'jobId' = ${jobId}`,
      ),
    )
    .groupBy(knowledgeDocuments.id)
    .orderBy(desc(knowledgeDocuments.createdAt));

  return rows.map((r) => ({
    ...r,
    supersededAt: r.supersededAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export interface MappingCandidateDoc {
  id: string;
  updatedAt: Date;
  lastMappedAt: Date | null;
}

/**
 * Lightweight, cursor-paginated feed of every non-superseded document for the
 * nightly mapping sweep (Phase 3) — just enough per row (`updatedAt`,
 * `lastMappedAt`) to decide whether it needs remapping, no chunk join. Internal
 * pipeline use, so dates stay as `Date`, not ISO strings.
 */
export async function listDocumentsForMapping(
  userId: string,
  opts: { cursor?: string | null; limit?: number },
): Promise<Page<MappingCandidateDoc>> {
  const limit = opts.limit ?? 50;
  const cur = decodeCursor(opts.cursor);

  const rows = await db
    .select({
      id: knowledgeDocuments.id,
      updatedAt: knowledgeDocuments.updatedAt,
      lastMappedAt: knowledgeDocuments.lastMappedAt,
      createdAt: knowledgeDocuments.createdAt,
    })
    .from(knowledgeDocuments)
    .where(
      and(
        eq(knowledgeDocuments.userId, userId),
        isNull(knowledgeDocuments.supersededAt),
        cur
          ? or(
              lt(knowledgeDocuments.createdAt, cur.createdAt),
              and(
                eq(knowledgeDocuments.createdAt, cur.createdAt),
                lt(knowledgeDocuments.id, cur.id),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(desc(knowledgeDocuments.createdAt), desc(knowledgeDocuments.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const last = pageRows.at(-1);
  return {
    items: pageRows.map((r) => ({
      id: r.id,
      updatedAt: r.updatedAt,
      lastMappedAt: r.lastMappedAt,
    })),
    nextCursor:
      hasMore && last
        ? encodeCursor({ createdAt: last.createdAt, id: last.id })
        : null,
  };
}

export interface KnowledgeChunkRow {
  id: string;
  chunkIndex: number;
  content: string;
  tokenCount: number | null;
  embeddingModel: string | null;
  embedded: boolean;
  dims: number | null;
}

export interface KnowledgeDocumentDetail {
  id: string;
  title: string;
  docType: string;
  body: string;
  sourceKind: string;
  sourceRef: string | null;
  meta: Record<string, unknown>;
  contentHash: string;
  supersededAt: string | null;
  createdAt: string;
  updatedAt: string;
  chunks: KnowledgeChunkRow[];
}

export async function getKnowledgeDocument(
  userId: string,
  id: string,
): Promise<KnowledgeDocumentDetail | null> {
  const [doc] = await db
    .select()
    .from(knowledgeDocuments)
    .where(
      and(
        eq(knowledgeDocuments.userId, userId),
        eq(knowledgeDocuments.id, id),
      ),
    )
    .limit(1);
  if (!doc) return null;

  const chunks = await db
    .select({
      id: knowledgeChunks.id,
      chunkIndex: knowledgeChunks.chunkIndex,
      content: knowledgeChunks.content,
      tokenCount: knowledgeChunks.tokenCount,
      embeddingModel: knowledgeChunks.embeddingModel,
      embedded: sql<boolean>`${knowledgeChunks.embedding} is not null`,
      dims: sql<
        number | null
      >`case when ${knowledgeChunks.embedding} is null then null else vector_dims(${knowledgeChunks.embedding}) end`,
    })
    .from(knowledgeChunks)
    .where(eq(knowledgeChunks.documentId, id))
    .orderBy(knowledgeChunks.chunkIndex);

  return {
    id: doc.id,
    title: doc.title,
    docType: doc.docType,
    body: doc.body,
    sourceKind: doc.sourceKind,
    sourceRef: doc.sourceRef,
    meta: (doc.meta ?? {}) as Record<string, unknown>,
    contentHash: doc.contentHash,
    supersededAt: doc.supersededAt?.toISOString() ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    chunks,
  };
}

/**
 * Edit a knowledge document's title / body / docType in place. When the body
 * changes it is re-chunked and re-embedded. Throws on a `content_hash` unique
 * collision (the edit would duplicate an existing document).
 */
export async function updateKnowledgeDocument(
  userId: string,
  id: string,
  patch: { title?: string; body?: string; docType?: string },
): Promise<{ ok: boolean; chunks: number }> {
  const [doc] = await db
    .select()
    .from(knowledgeDocuments)
    .where(
      and(
        eq(knowledgeDocuments.userId, userId),
        eq(knowledgeDocuments.id, id),
      ),
    )
    .limit(1);
  if (!doc) return { ok: false, chunks: 0 };

  const title = patch.title ?? doc.title;
  const body = patch.body ?? doc.body;
  const docType = patch.docType ?? doc.docType;
  const contentHash = createHash("sha256")
    .update(`${docType}\n${title}\n${body}`)
    .digest("hex");

  await db
    .update(knowledgeDocuments)
    .set({ title, body, docType, contentHash, updatedAt: new Date() })
    .where(eq(knowledgeDocuments.id, id));

  let chunks = 0;
  if (patch.body !== undefined && patch.body !== doc.body) {
    chunks = await embedDocument(userId, id, body);
  }
  return { ok: true, chunks };
}

/** Delete a knowledge document; its chunks cascade. */
export async function deleteKnowledgeDocument(
  userId: string,
  id: string,
): Promise<boolean> {
  const res = await db
    .delete(knowledgeDocuments)
    .where(
      and(
        eq(knowledgeDocuments.userId, userId),
        eq(knowledgeDocuments.id, id),
      ),
    )
    .returning({ id: knowledgeDocuments.id });
  return res.length > 0;
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
