export { chunkText, estimateTokens } from "./chunk";
export { SupabaseVectorStore, type KnowledgeChunkMeta } from "./store";
export {
  upsertDocument,
  type UpsertDocInput,
  type UpsertResult,
} from "./documents";
export {
  searchKnowledge,
  type KnowledgeHit,
  type SearchOpts,
} from "./search";
