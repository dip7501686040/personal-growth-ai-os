import { z } from "zod";

export const ActivityAnalysisSchema = z.object({
  summary: z.string(),
  /** e.g. ["backend", "distributed_system", "devops"] */
  workCategories: z.array(z.string()).max(8),
  /** Skills the metadata HINTS at — not proof. Reviewed by the user before counting. */
  suggestedSkills: z
    .array(
      z.object({
        skill: z.string(),
        confidence: z.number().min(0).max(1),
        reason: z.string(),
      }),
    )
    .max(12),
  /** One-line "you could show this as proof" statements. */
  potentialProof: z.array(z.string()).max(6),
  /** Build-in-public content hooks from the work. */
  contentOpportunities: z.array(z.string()).max(6),
});

export type ActivityAnalysisResult = z.infer<typeof ActivityAnalysisSchema>;
