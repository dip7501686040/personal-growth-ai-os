import { z } from "zod";

const PlanItem = z.object({ topic: z.string(), why: z.string() });

/** Structured output of the Learning Agent. */
export const LearningPlanSchema = z.object({
  dsaWeakness: z
    .object({
      weakPattern: z.string(),
      observation: z.string(),
      recommendations: z.array(z.string()).min(1).max(5),
    })
    .nullable(),
  dailyPlan: z.object({
    dsa: PlanItem,
    systemDesign: PlanItem,
    technology: PlanItem,
    revision: PlanItem.nullable(),
  }),
  nextLogicalStep: z.string(),
});

export type LearningPlan = z.infer<typeof LearningPlanSchema>;
