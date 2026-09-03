import { Document } from "@langchain/core/documents";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import { VectorStore } from "@langchain/core/vectorstores";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgeChunks } from "@/lib/db/schema";
import { getEmbeddingProvider, type EmbeddingProvider } from "@/lib/embeddings";

export interface KnowledgeChunkMeta {
  documentId: string;
  chunkIndex?: number;
  tokenCount?: number;
}

/** Adapt our EmbeddingProvider to LangChain's structural embeddings type. */
function toLangChainEmbeddings(p: EmbeddingProvider): EmbeddingsInterface {
  return {
    embedDocuments: (texts: string[]) => p.embed(texts),
    embedQuery: async (text: string) => (await p.embed([text]))[0],
  };
}

const toVectorLiteral = (v: number[]): string => `[${v.join(",")}]`;

interface ChunkRow {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  score: number;
}

/**
 * A LangChain `VectorStore` backed by the `knowledge_chunks` table via Drizzle
 * raw SQL (pgvector `<=>` cosine). Keeps a single Postgres driver — no extra
 * `pg` dependency. Every operation is scoped to one user and one embedding
 * model.
 */
export class SupabaseVectorStore extends VectorStore {
  declare FilterType: { documentIds?: string[] };
  private readonly userId: string;
  private readonly provider: EmbeddingProvider;

  constructor(userId: string, provider: EmbeddingProvider = getEmbeddingProvider()) {
    super(toLangChainEmbeddings(provider), {});
    this.userId = userId;
    this.provider = provider;
  }

  _vectorstoreType(): string {
    return "supabase-drizzle";
  }

  async addVectors(vectors: number[][], documents: Document[]): Promise<void> {
    if (vectors.length === 0) return;
    const rows = vectors.map((embedding, i) => {
      const meta = (documents[i].metadata ?? {}) as KnowledgeChunkMeta;
      return {
        userId: this.userId,
        documentId: meta.documentId,
        chunkIndex: meta.chunkIndex ?? i,
        content: documents[i].pageContent,
        embedding,
        embeddingModel: this.provider.id,
        tokenCount: meta.tokenCount ?? null,
      };
    });
    await db.insert(knowledgeChunks).values(rows);
  }

  async addDocuments(documents: Document[]): Promise<void> {
    const vectors = await this.provider.embed(
      documents.map((d) => d.pageContent),
    );
    await this.addVectors(vectors, documents);
  }

  async similaritySearchVectorWithScore(
    query: number[],
    k: number,
    filter?: this["FilterType"],
  ): Promise<[Document, number][]> {
    const lit = toVectorLiteral(query);
    const docFilter =
      filter?.documentIds && filter.documentIds.length > 0
        ? sql`and document_id = any(${filter.documentIds})`
        : sql``;

    const result = await db.execute(sql`
      select id, document_id, chunk_index, content,
             1 - (embedding <=> ${lit}::vector) as score
      from knowledge_chunks
      where user_id = ${this.userId}
        and embedding_model = ${this.provider.id}
        and embedding is not null
        ${docFilter}
      order by embedding <=> ${lit}::vector
      limit ${k}
    `);

    const rows = result as unknown as ChunkRow[];
    return rows.map((r) => [
      new Document({
        pageContent: r.content,
        metadata: {
          chunkId: r.id,
          documentId: r.document_id,
          chunkIndex: r.chunk_index,
        },
      }),
      Number(r.score),
    ]);
  }
}
