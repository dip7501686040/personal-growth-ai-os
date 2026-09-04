import { z } from "zod";
import { runStructured } from "@/lib/llm";
import type { ScoredCandidate } from "./score";

/** Caps how many LLM rationale calls one mapping pass may spend — shared
 *  across every candidate/document in the pass so a big backfill or cron run
 *  can't run away with quota. Everything else gets a deterministic rationale. */
export interface RationaleBudget {
  used: number;
  max: number;
}

function deterministicRationale(
  c: ScoredCandidate,
  targetLabel: string,
  sourceRef: string | null,
): string {
  if (c.method.includes("shared_source")) {
    return `This document was distilled directly from ${targetLabel}${
      sourceRef ? ` (${sourceRef})` : ""
    }.`;
  }
  if (c.nameMatch) {
    return `"${c.nameMatch}" is named directly in this document.`;
  }
  if (c.method.includes("shared_source_repo_name")) {
    return `This document's source repository name matches ${targetLabel}.`;
  }
  return `Semantically related to ${targetLabel} (similarity ${(c.embedScore ?? 0).toFixed(2)}).`;
}

const RationaleSchema = z.object({
  rationale: z
    .string()
    .max(220)
    .describe("One short, concrete sentence on why the document relates to the target."),
});

/**
 * A deterministic template covers every candidate except the genuinely
 * ambiguous ones — embedding-only, mid-confidence (0.5–0.7) — where a one-line
 * LLM judgment is worth the (budget-capped) cost. Cached by `runStructured`'s
 * llm_cache like every other agent call, so re-runs are free.
 */
export async function rationaleFor(args: {
  userId: string;
  agentRunId?: string | null;
  candidate: ScoredCandidate;
  targetLabel: string;
  targetText: string;
  docTitle: string;
  docExcerpt: string;
  sourceRef: string | null;
  budget: RationaleBudget;
}): Promise<string> {
  const { candidate: c } = args;
  const borderline =
    c.score >= 0.5 && c.score < 0.7 && c.method.length === 1 && c.method[0] === "embedding";

  if (!borderline || args.budget.used >= args.budget.max) {
    return deterministicRationale(c, args.targetLabel, args.sourceRef);
  }

  try {
    args.budget.used++;
    const { data } = await runStructured({
      userId: args.userId,
      agent: "extractor",
      agentRunId: args.agentRunId,
      schema: RationaleSchema,
      schemaName: "knowledge_link_rationale",
      system:
        "In one short, concrete sentence, say why this knowledge document relates to the target (or that the link looks weak). No filler.",
      prompt: `Document: "${args.docTitle}"\n${args.docExcerpt}\n\nTarget (${args.targetLabel}): ${args.targetText}`,
      temperature: 0.2,
    });
    return data.rationale;
  } catch {
    return deterministicRationale(c, args.targetLabel, args.sourceRef);
  }
}
