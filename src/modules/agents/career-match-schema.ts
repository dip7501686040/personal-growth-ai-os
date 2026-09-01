import { z } from "zod";

export const CareerMatchSchema = z.object({
  overallScore: z.number().int().min(0).max(100),
  recommendation: z.enum(["yes", "maybe", "no"]),
  summary: z.string(),
  /** Skill names the job needs that the profile marks PROVEN. */
  provenMatches: z.array(z.string()),
  /** ... marks IMPLEMENTED. */
  implementedMatches: z.array(z.string()),
  /** Job needs it; user is only learning/practising it. */
  partialMatches: z.array(
    z.object({ skill: z.string(), have: z.string(), note: z.string() }),
  ),
  /** Job needs it; user doesn't have it but it's adjacent to what they know. */
  aspirationalMatches: z.array(z.string()),
  /** Needed, not present at any level. */
  missingSkills: z.array(z.string()),
  /** Concrete project/learning work that would close the important gaps. */
  gapClosingWork: z.array(
    z.object({ gap: z.string(), suggestion: z.string() }),
  ),
  rationale: z.string(),
});

export type CareerMatchResult = z.infer<typeof CareerMatchSchema>;
