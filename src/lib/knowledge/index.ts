export { chunkText, estimateTokens } from "./chunk";
export { SupabaseVectorStore, type KnowledgeChunkMeta } from "./store";
export {
  upsertDocument,
  upsertDocumentRow,
  embedDocument,
  type UpsertDocInput,
  type UpsertResult,
  type UpsertRowResult,
} from "./documents";
export {
  searchKnowledge,
  type KnowledgeHit,
  type SearchOpts,
} from "./search";
export { knowledgeStats, type KnowledgeStats } from "./stats";
