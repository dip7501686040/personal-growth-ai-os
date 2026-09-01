import { z } from "zod";

export const ContentOpportunitiesSchema = z.object({
  opportunities: z
    .array(
      z.object({
        title: z.string(),
        hook: z.string(),
        angle: z.string(),
        /** Key of the candidate event this is grounded in (e.g. "PF2"). */
        sourceKey: z.string(),
      }),
    )
    .max(6),
});
export type ContentOpportunities = z.infer<typeof ContentOpportunitiesSchema>;

export const LinkedInDraftSchema = z.object({
  title: z.string(),
  body: z.string(),
});
export type LinkedInDraft = z.infer<typeof LinkedInDraftSchema>;
