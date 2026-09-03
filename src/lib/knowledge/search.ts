import { and, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgeDocuments } from "@/lib/db/schema";
import { getEmbeddingProvider } from "@/lib/embeddings";
import { SupabaseVectorStore } from "./store";

export interface KnowledgeHit {
  documentId: string;
  chunkId: string | null;
  title: string;
  docType: string;
  sourceKind: string;
  sourceRef: string | null;
  content: string;
  score: number;
}

export interface RrfWeights {
  vector: number;
  keyword: number;
}

export interface SearchOpts {
  userId: string;
  query: string;
  k?: number;
  docTypes?: string[];
  sourceKinds?: string[];
  /** recency half-life in days for the soft decay multiplier (default 120) */
  halfLifeDays?: number;
  /** per-signal RRF weights (default { vector: 1, keyword: 1 }) */
  rrf?: RrfWeights;
}

const RRF_K = 60;

/** Word-set Jaccard on the first ~40 tokens — cheap near-duplicate check. */
function nearDuplicate(a: string, b: string): boolean {
  const toks = (s: string): Set<string> =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 40),
    );
  const A = toks(a);
  const B = toks(b);
  if (A.size === 0 || B.size === 0) return false;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter) > 0.82;
}

/**
 * Hybrid retrieval over the knowledge base: pgvector cosine + keyword `ilike`,
 * merged with weighted Reciprocal Rank Fusion at the document level, softly
 * down-weighted by age, then de-duplicated. Returns the best chunk per document.
 */
export async function searchKnowledge(opts: SearchOpts): Promise<KnowledgeHit[]> {
  const k = opts.k ?? 8;
  const pool = Math.max(k * 4, 20);
  const weights = opts.rrf ?? { vector: 1, keyword: 1 };
  const provider = getEmbeddingProvider();

  // 1. vector search (chunk level)
  const [qvec] = await provider.embed([opts.query]);
  const store = new SupabaseVectorStore(opts.userId, provider);
  const vectorHits = await store.similaritySearchVectorWithScore(qvec, pool);

  const vecDocRank = new Map<string, number>();
  const bestChunk = new Map<
    string,
    { chunkId: string; content: string; score: number }
  >();
  for (const [doc, score] of vectorHits) {
    const docId = doc.metadata.documentId as string;
    if (!vecDocRank.has(docId)) vecDocRank.set(docId, vecDocRank.size + 1);
    const prev = bestChunk.get(docId);
    if (!prev || score > prev.score) {
      bestChunk.set(docId, {
        chunkId: doc.metadata.chunkId as string,
        content: doc.pageContent,
        score,
      });
    }
  }

  // 2. keyword search (document level)
  const like = `%${opts.query.replace(/[%_]/g, " ").trim()}%`;
  const kwRows = await db
    .select({ id: knowledgeDocuments.id })
    .from(knowledgeDocuments)
    .where(
      and(
        eq(knowledgeDocuments.userId, opts.userId),
        isNull(knowledgeDocuments.supersededAt),
        or(
          ilike(knowledgeDocuments.title, like),
          ilike(knowledgeDocuments.body, like),
        ),
      ),
    )
    .limit(pool);
  const kwDocRank = new Map<string, number>();
  kwRows.forEach((r, i) => kwDocRank.set(r.id, i + 1));

  // 3. hydrate metadata for every candidate doc
  const ids = [...new Set([...vecDocRank.keys(), ...kwDocRank.keys()])];
  if (ids.length === 0) return [];
  const docs = await db
    .select({
      id: knowledgeDocuments.id,
      title: knowledgeDocuments.title,
      docType: knowledgeDocuments.docType,
      sourceKind: knowledgeDocuments.sourceKind,
      sourceRef: knowledgeDocuments.sourceRef,
      body: knowledgeDocuments.body,
      createdAt: knowledgeDocuments.createdAt,
      supersededAt: knowledgeDocuments.supersededAt,
    })
    .from(knowledgeDocuments)
    .where(
      and(
        eq(knowledgeDocuments.userId, opts.userId),
        inArray(knowledgeDocuments.id, ids),
      ),
    );

  // 4. weighted RRF + recency decay
  const halfLife = opts.halfLifeDays ?? 120;
  const now = Date.now();

  const scored: KnowledgeHit[] = [];
  for (const doc of docs) {
    if (doc.supersededAt) continue;
    if (opts.docTypes && !opts.docTypes.includes(doc.docType)) continue;
    if (opts.sourceKinds && !opts.sourceKinds.includes(doc.sourceKind)) continue;

    const vr = vecDocRank.get(doc.id);
    const kr = kwDocRank.get(doc.id);
    const rrf =
      weights.vector * (vr ? 1 / (RRF_K + vr) : 0) +
      weights.keyword * (kr ? 1 / (RRF_K + kr) : 0);
    const ageDays = (now - doc.createdAt.getTime()) / 86_400_000;
    const recency = Math.pow(0.5, ageDays / halfLife);
    const bc = bestChunk.get(doc.id);

    scored.push({
      documentId: doc.id,
      chunkId: bc?.chunkId ?? null,
      title: doc.title,
      docType: doc.docType,
      sourceKind: doc.sourceKind,
      sourceRef: doc.sourceRef,
      content: bc?.content ?? doc.body.slice(0, 600),
      score: rrf * (0.5 + 0.5 * recency),
    });
  }

  scored.sort((a, b) => b.score - a.score);

  // 5. drop near-duplicate chunks (e.g. the same decision extracted twice)
  const out: KnowledgeHit[] = [];
  for (const hit of scored) {
    if (out.some((h) => nearDuplicate(h.content, hit.content))) continue;
    out.push(hit);
    if (out.length >= k) break;
  }
  return out;
}
