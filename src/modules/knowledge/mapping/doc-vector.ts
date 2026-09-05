// Lives in lib/knowledge — it only ever touches knowledge_chunks, nothing
// mapping-specific. Re-exported here so existing imports within this module
// don't need to change.
export { docVector, toVectorLiteral } from "@/lib/knowledge/vector";
