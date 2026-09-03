import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgeChunks } from "@/lib/db/schema";
import { searchKnowledge, type KnowledgeHit } from "@/lib/knowledge";
import { PURPOSES } from "./purposes";
import { buildSections, renderSections } from "./sections";
import { buildCoreSlice, buildLearningSlice } from "./structured";
import type {
  CoreSlice,
  GetContextArgs,
  LearningPlanContext,
  PersonalContext,
} from "./types";

/** Cheap gate: is there anything in the knowledge base for this user yet? */
async function userHasKnowledge(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ one: sql<number>`1` })
    .from(knowledgeChunks)
    .where(eq(knowledgeChunks.userId, userId))
    .limit(1);
  return !!row;
}

/**
 * The single entry point every agent (and the MCP server) uses to assemble
 * context. Combines a typed structured slice from the app's own tables with
 * hybrid retrieval over the knowledge base, then renders a token-bounded
 * prompt string. Knowledge retrieval is skipped entirely while the store is
 * empty (no wasted embedding call).
 */
export async function getPersonalContext(
  args: GetContextArgs & { purpose: "learning_plan" },
): Promise<LearningPlanContext>;
export async function getPersonalContext(
  args: GetContextArgs,
): Promise<PersonalContext>;
export async function getPersonalContext(
  args: GetContextArgs,
): Promise<PersonalContext> {
  const { userId, purpose } = args;
  const cfg = PURPOSES[purpose];
  const budgetTokens = args.budgetTokens ?? cfg.budgetTokens;
  const generatedAt = new Date().toISOString();

  const structured: CoreSlice =
    purpose === "learning_plan"
      ? await buildLearningSlice(userId)
      : await buildCoreSlice(userId);

  let knowledge: KnowledgeHit[] = [];
  if (await userHasKnowledge(userId)) {
    const query = args.query?.trim() || cfg.defaultQuery(structured);
    knowledge = await searchKnowledge({
      userId,
      query,
      k: cfg.knowledgeK,
      docTypes: cfg.knowledgeDocTypes,
      sourceKinds: cfg.knowledgeSourceKinds,
      rrf: cfg.rrf,
      halfLifeDays: cfg.halfLifeDays,
    });
  }

  const rendered = renderSections(
    buildSections(purpose, structured, knowledge),
    budgetTokens,
  );

  return {
    purpose,
    generatedAt,
    structured,
    knowledge,
    tokenEstimate: rendered.tokenEstimate,
    truncated: rendered.truncated,
    toPromptString: () => rendered.text,
  } as PersonalContext;
}
