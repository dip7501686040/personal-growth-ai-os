export { chunkText, estimateTokens } from "./chunk";
export { SupabaseVectorStore, type KnowledgeChunkMeta } from "./store";
export {
  upsertDocument,
  upsertDocumentRow,
  embedDocument,
  listKnowledgeDocuments,
  getKnowledgeDocument,
  listDocumentsByJob,
  updateKnowledgeDocument,
  deleteKnowledgeDocument,
  type UpsertDocInput,
  type UpsertResult,
  type UpsertRowResult,
  type KnowledgeDocListItem,
  type KnowledgeDocumentDetail,
  type KnowledgeChunkRow,
  type KnowledgeDocumentFilters,
} from "./documents";
export {
  searchKnowledge,
  type KnowledgeHit,
  type SearchOpts,
} from "./search";
export { knowledgeStats, type KnowledgeStats } from "./stats";
export { getSkillFacets, getModuleFacets, type SkillFacet, type ModuleFacet } from "./facets";
