import { z } from "zod";
import { SKILL_CATEGORIES } from "@/modules/skills/levels";

/** doc types the knowledge base understands. */
export const KNOWLEDGE_DOC_TYPES = [
  "repo_summary",
  "file_summary",
  "decision",
  "concept",
  "learning",
  "conversation_insight",
  "profile",
] as const;

/**
 * The one shape every extraction produces, whatever the source. The Extraction
 * Agent maps raw material (a repo, a conversation, a doc) onto this; `persist`
 * then fans it out to the existing structured tables + the knowledge base.
 *
 * `documents[]` is the union of everything worth embedding — the agent is told
 * to also emit a document for each significant decision / concept / learning,
 * so retrieval never misses something that only appears under `entities`.
 */
export const CanonicalKnowledgeSchema = z.object({
  summary: z.string().describe("1–3 sentences describing the whole source"),
  entities: z.object({
    projects: z
      .array(
        z.object({
          name: z.string(),
          description: z.string(),
        }),
      )
      .max(20),
    skills: z
      .array(
        z.object({
          name: z.string(),
          category: z.enum(SKILL_CATEGORIES),
          evidence: z
            .string()
            .describe("what in the source shows this skill was used"),
          confidence: z.number().min(0).max(1),
        }),
      )
      .max(40),
    concepts: z.array(z.object({ name: z.string(), note: z.string() })).max(30),
    decisions: z
      .array(z.object({ title: z.string(), rationale: z.string() }))
      .max(20),
    learnings: z
      .array(z.object({ topic: z.string(), detail: z.string() }))
      .max(20),
    tools: z.array(z.string()).max(40),
    achievements: z.array(z.string()).max(20),
  }),
  documents: z
    .array(
      z.object({
        docType: z.enum(KNOWLEDGE_DOC_TYPES),
        title: z.string(),
        body: z
          .string()
          .describe("a self-contained distilled fact, 2–8 sentences"),
      }),
    )
    .max(40),
});

export type CanonicalKnowledge = z.infer<typeof CanonicalKnowledgeSchema>;

/** True when there is nothing worth persisting. */
export function isEmptyCanonical(c: CanonicalKnowledge): boolean {
  const e = c.entities;
  return (
    c.documents.length === 0 &&
    e.projects.length === 0 &&
    e.skills.length === 0 &&
    e.concepts.length === 0 &&
    e.decisions.length === 0 &&
    e.learnings.length === 0
  );
}
