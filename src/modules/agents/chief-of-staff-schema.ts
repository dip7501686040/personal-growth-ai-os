import { z } from "zod";

export const BriefingSchema = z.object({
  summary: z.string(),
  priorities: z
    .array(
      z.object({
        title: z.string(),
        why: z.string(),
        /** A concrete reference: "Career match 55% · Acme", "DSA recognition gap", etc. */
        ref: z.string(),
        category: z.enum([
          "review",
          "learning",
          "dsa",
          "project",
          "career",
          "content",
          "business",
        ]),
      }),
    )
    .min(1)
    .max(6),
  connections: z.array(z.object({ note: z.string() })).max(5),
});

export type Briefing = z.infer<typeof BriefingSchema>;
