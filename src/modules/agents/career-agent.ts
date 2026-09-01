import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { skillEvidence, skills } from "@/lib/db/schema";
import { hasProviderKey, resolveModelConfig, runStructured } from "@/lib/llm";
import {
  getOpportunity,
  saveMatch,
  type MatchData,
} from "@/modules/career/service";
import { listProjects } from "@/modules/projects/service";
import { BaseAgent } from "./base-agent";
import {
  CareerMatchSchema,
  type CareerMatchResult,
} from "./career-match-schema";
import type { AgentContext, AgentResult } from "./types";

export { CareerMatchSchema, type CareerMatchResult };

export interface CareerAgentResult {
  match: CareerMatchResult;
  source: "ai" | "deterministic";
  model: string | null;
  cached: boolean;
  generatedAt: string;
  note?: string;
}

interface SkillFact {
  name: string;
  level: string;
  provenByProject: boolean;
  provenByActivity: boolean;
}

interface Context {
  opportunity: { company: string; role: string; description: string };
  skillFacts: SkillFact[];
  projects: { name: string; status: string; features: string; skills: number }[];
}

const SYSTEM = `You are the Career Agent for one senior backend/full-stack engineer. You judge a job against the user's REAL proof-of-skills — honestly, never inflating.

Hard rules:
- The user's skill levels are FACTS given to you. Do not upgrade them.
  - level "proven" → provenMatches ONLY.
  - level "implemented" → implementedMatches ONLY (never also provenMatches).
  - level "practiced" or "learning" → partialMatches only. Say "only practising/learning".
  - not in the list → missingSkills, unless clearly adjacent to something they have → aspirationalMatches.
  - Each job requirement appears in exactly one bucket.
- overallScore reflects the honest picture. A job needing 4 skills where the user has 2 implemented, 1 practising, 1 missing is roughly 55-65, not 85.
- recommendation: "yes" only if the evidence-backed match is strong and gaps are minor; "maybe" if worth applying while closing gaps; "no" if the core requirements aren't backed by real work.
- gapClosingWork: concrete project features or focused learning that would close the IMPORTANT gaps (not every gap).
- Parse the job description yourself for its real requirements. Be concise.`;

function buildPrompt(ctx: Context, today: string): string {
  return [
    `Today: ${today}`,
    ``,
    `JOB`,
    `Company: ${ctx.opportunity.company}`,
    `Role: ${ctx.opportunity.role}`,
    `Description:`,
    ctx.opportunity.description.slice(0, 6000),
    ``,
    `USER SKILL FACTS (do not upgrade these):`,
    JSON.stringify(ctx.skillFacts),
    ``,
    `USER PROJECTS:`,
    JSON.stringify(ctx.projects),
    ``,
    `Produce the honest match analysis.`,
  ].join("\n");
}

function deterministicMatch(ctx: Context): CareerMatchResult {
  const text = `${ctx.opportunity.role}\n${ctx.opportunity.description}`.toLowerCase();
  const hit = (name: string) => text.includes(name.toLowerCase());

  const proven = ctx.skillFacts
    .filter((s) => s.level === "proven" && hit(s.name))
    .map((s) => s.name);
  const implemented = ctx.skillFacts
    .filter((s) => s.level === "implemented" && hit(s.name))
    .map((s) => s.name);
  const partial = ctx.skillFacts
    .filter(
      (s) => (s.level === "practiced" || s.level === "learning") && hit(s.name),
    )
    .map((s) => ({ skill: s.name, have: s.level, note: `only ${s.level}` }));

  const strong = proven.length * 3 + implemented.length * 2;
  const score = Math.max(10, Math.min(90, 20 + strong * 8 + partial.length * 3));
  const recommendation = score >= 65 ? "maybe" : "no";

  return {
    overallScore: score,
    recommendation,
    summary:
      "Keyword-only match (AI unavailable). Confirm requirements manually.",
    provenMatches: proven,
    implementedMatches: implemented,
    partialMatches: partial,
    aspirationalMatches: [],
    missingSkills: [],
    gapClosingWork: [],
    rationale:
      "No AI key configured — this is a crude substring match of your skill names against the description, so missing/aspirational skills aren't identified.",
  };
}

export class CareerAgent extends BaseAgent<Context, CareerAgentResult> {
  readonly name = "career" as const;

  protected async gatherContext(ctx: AgentContext): Promise<Context> {
    const opportunityId = String(ctx.input.opportunityId ?? "");
    const opp = await getOpportunity(ctx.userId, opportunityId);
    if (!opp) throw new Error("Opportunity not found.");

    const [skillRows, evRows, projectRows] = await Promise.all([
      db
        .select({
          id: skills.id,
          name: skills.name,
          level: skills.level,
        })
        .from(skills)
        .where(eq(skills.userId, ctx.userId)),
      db
        .select({
          skillId: skillEvidence.skillId,
          sourceType: skillEvidence.sourceType,
        })
        .from(skillEvidence)
        .where(
          and(
            eq(skillEvidence.userId, ctx.userId),
            eq(skillEvidence.status, "accepted"),
          ),
        ),
      listProjects(ctx.userId),
    ]);

    const byProject = new Set(
      evRows.filter((e) => e.sourceType === "project_feature").map((e) => e.skillId),
    );
    const byActivity = new Set(
      evRows
        .filter((e) => e.sourceType === "activity_analysis")
        .map((e) => e.skillId),
    );

    return {
      opportunity: {
        company: opp.opportunity.company,
        role: opp.opportunity.role,
        description: opp.opportunity.description,
      },
      skillFacts: skillRows.map((s) => ({
        name: s.name,
        level: s.level,
        provenByProject: byProject.has(s.id),
        provenByActivity: byActivity.has(s.id),
      })),
      projects: projectRows.map((p) => ({
        name: p.name,
        status: p.status,
        features: `${p.featuresDone}/${p.featuresTotal} done`,
        skills: p.skillsCount,
      })),
    };
  }

  protected async analyze(
    ctx: AgentContext,
    context: Context,
  ): Promise<CareerAgentResult> {
    const today = new Date().toISOString().slice(0, 10);

    const cfg = await resolveModelConfig(ctx.userId, "career");
    if (!hasProviderKey(cfg.provider)) {
      await ctx.log(`${cfg.provider} API key not set — keyword match only`, {
        level: "warn",
        step: "analyzing",
      });
      return {
        match: deterministicMatch(context),
        source: "deterministic",
        model: null,
        cached: false,
        generatedAt: today,
        note: `${cfg.provider.toUpperCase()}_API_KEY not configured.`,
      };
    }

    const { data, cached, model } = await runStructured({
      userId: ctx.userId,
      agent: "career",
      agentRunId: ctx.agentRunId,
      schema: CareerMatchSchema,
      schemaName: "career_match",
      system: SYSTEM,
      prompt: buildPrompt(context, today),
      temperature: 0.2,
    });

    return { match: data, source: "ai", model, cached, generatedAt: today };
  }

  protected async buildRecommendations(
    ctx: AgentContext,
    _context: Context,
    analysis: CareerAgentResult,
  ): Promise<AgentResult> {
    const opportunityId = String(ctx.input.opportunityId ?? "");
    await saveMatch(
      ctx.userId,
      opportunityId,
      ctx.agentRunId,
      analysis.match as MatchData,
    );
    return {
      result: analysis,
      summary: `Match ${analysis.match.overallScore}% · ${analysis.match.recommendation.toUpperCase()}`,
      needsApproval: false,
    };
  }
}

export const careerAgent = new CareerAgent();
