import type { ScoredCandidate } from "./score";

/**
 * Every link's rationale is a deterministic, free template — mapping never
 * calls an LLM (a standing goal: minimize LLM cost in this pipeline, always).
 * An earlier version asked the LLM for a one-line judgment on genuinely
 * ambiguous, embedding-only candidates; removed in favor of zero calls,
 * permanently, over occasionally-better wording on the weakest tier of
 * suggestions. Nothing about which links get created or auto-accepted ever
 * depended on this text.
 */
export function rationaleFor(
  candidate: ScoredCandidate,
  targetLabel: string,
  sourceRef: string | null,
): string {
  if (candidate.method.includes("shared_source")) {
    return `This document was distilled directly from ${targetLabel}${
      sourceRef ? ` (${sourceRef})` : ""
    }.`;
  }
  if (candidate.nameMatch) {
    return `"${candidate.nameMatch}" is named directly in this document.`;
  }
  if (candidate.method.includes("shared_source_repo_name")) {
    return `This document's source repository name matches ${targetLabel}.`;
  }
  return `Semantically related to ${targetLabel} (similarity ${(candidate.embedScore ?? 0).toFixed(2)}).`;
}
