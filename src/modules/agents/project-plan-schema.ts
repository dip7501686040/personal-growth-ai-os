import { z } from "zod";

export const ProjectPlanSchema = z.object({
  portfolioGaps: z
    .array(z.object({ gap: z.string(), why: z.string() }))
    .max(5),
  projectIdeas: z
    .array(
      z.object({
        name: z.string(),
        pitch: z.string(),
        problemSolved: z.string(),
        buildComplexity: z.enum(["small", "medium", "large"]),
        targetSkills: z.array(z.string()).min(1).max(8),
        suggestedFeatures: z
          .array(
            z.object({
              title: z.string(),
              skills: z.array(z.string()).max(6),
            }),
          )
          .min(2)
          .max(6),
      }),
    )
    .min(1)
    .max(3),
  existingProjectNextSteps: z
    .array(z.object({ project: z.string(), suggestion: z.string() }))
    .max(5),
});

export type ProjectPlan = z.infer<typeof ProjectPlanSchema>;
