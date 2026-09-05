import { sql } from "drizzle-orm";
import {
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { createdAt, updatedAt, userId } from "./_shared";

/** Postgres tsvector — no first-class Drizzle column type, so a thin custom one. */
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

/**
 * A canonical, distilled fact/summary derived from a source (a GitHub repo, a
 * conversation, an ADR, an internal row). We embed and retrieve these — never
 * raw repositories or transcripts.
 *
 * `doc_type`: repo_summary | file_summary | decision | concept | learning |
 *             conversation_insight | profile
 * `source_kind`: github_repo | upload | claude_transcripts | internal
 * `content_hash` makes re-ingestion idempotent; on a content change the old row
 * is marked `superseded_at` and its chunks are replaced.
 */
export const knowledgeDocuments = pgTable(
  "knowledge_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    docType: text("doc_type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    sourceKind: text("source_kind").notNull(),
    /** repo full name, file path, conversation id, or internal row id */
    sourceRef: text("source_ref"),
    meta: jsonb("meta").notNull().default(sql`'{}'::jsonb`),
    contentHash: text("content_hash").notNull(),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    /** Last time this doc was run through the mapping pipeline (any outcome).
     *  The nightly sweep skips a doc when this is newer than both its own
     *  `updated_at` and the entity corpus's last change (Phase 3). */
    lastMappedAt: timestamp("last_mapped_at", { withTimezone: true }),
    /** title (weight A) + body (weight B), for full-text search (K4). */
    searchTsv: tsvector("search_tsv").generatedAlwaysAs(
      sql`setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(body, '')), 'B')`,
    ),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex("knowledge_documents_user_hash_idx").on(t.userId, t.contentHash),
    index("knowledge_documents_user_type_idx").on(t.userId, t.docType),
    index("knowledge_documents_user_source_idx").on(
      t.userId,
      t.sourceKind,
      t.sourceRef,
    ),
    index("knowledge_documents_search_tsv_idx").using("gin", t.searchTsv),
    index("knowledge_documents_title_trgm_idx").using(
      "gin",
      sql`${t.title} gin_trgm_ops`,
    ),
  ],
).enableRLS();

/**
 * A chunk of a knowledge document plus its embedding. `embedding_model` records
 * which model's vector space this row lives in — retrieval only compares rows
 * from the same model.
 */
export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    documentId: uuid("document_id")
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull().default(0),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 768 }),
    embeddingModel: text("embedding_model"),
    tokenCount: integer("token_count"),
    createdAt,
  },
  (t) => [
    index("knowledge_chunks_doc_idx").on(t.documentId),
    index("knowledge_chunks_user_idx").on(t.userId),
    index("knowledge_chunks_embedding_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
  ],
).enableRLS();

export type KnowledgeDocument = typeof knowledgeDocuments.$inferSelect;
export type NewKnowledgeDocument = typeof knowledgeDocuments.$inferInsert;
export type KnowledgeChunk = typeof knowledgeChunks.$inferSelect;
export type NewKnowledgeChunk = typeof knowledgeChunks.$inferInsert;
