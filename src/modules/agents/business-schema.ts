import { z } from "zod";

export const BusinessOpportunitiesSchema = z.object({
  opportunities: z
    .array(
      z.object({
        title: z.string(),
        problem: z.string(),
        targetCustomer: z.string(),
        proposedSolution: z.string(),
        /** Only technologies from the user's skill list. */
        techStack: z.array(z.string()).min(1).max(10),
        skillMatchScore: z.number().int().min(0).max(100),
        complexity: z.enum(["low", "medium", "high"]),
        buildScope: z.string(),
        monetizationModel: z.string(),
      }),
    )
    .min(1)
    .max(5),
});

export type BusinessOpportunities = z.infer<typeof BusinessOpportunitiesSchema>;
