export { generateCandidates, type DocContext, type RawCandidate } from "./candidates";
export {
  scoreCandidate,
  SCORE_FLOOR,
  AUTO_ACCEPT_SCORE,
  type ScoredCandidate,
} from "./score";
export { rationaleFor } from "./rationale";
export { classifyDocumentTags } from "./tags";
export { mapDocument, relinkDocument, type MapDocumentResult } from "./link";
export { docVector, toVectorLiteral } from "./doc-vector";
export {
  listDocumentLinks,
  listDocumentTags,
  listAllTaxonomyTags,
  listAllLinkTargets,
  getRelatedKnowledge,
  type DocumentLinkRow,
  type DocumentTagRow,
  type TaxonomyOption,
  type LinkTargetOption,
  type FocusTarget,
  type RelatedKnowledgeHit,
} from "./queries";
export {
  getSkillDepth,
  getProjectFeatureDepth,
  type SkillDepth,
  type ProjectFeatureDepth,
} from "./depth";
export { matchSkillsAndFeatures } from "./entity-candidates";
