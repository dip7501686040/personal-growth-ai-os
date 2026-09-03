import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { learningSessions } from "@/lib/db/schema";
import { hasProviderKey, resolveModelConfig, runStructured } from "@/lib/llm";
import { getPersonalContext } from "@/modules/context";
import { getProjectSnapshot } from "@/modules/projects/service";
import { BaseAgent } from "./base-agent";
import { ProjectPlanSchema, type ProjectPlan } from "./project-plan-schema";
import type { AgentContext, AgentResult } from "./types";

export { ProjectPlanSchema, type ProjectPlan };

export interface ProjectAgentResult {
  plan: ProjectPlan;
  source: "ai" | "deterministic";
  model: string | null;
  cached: boolean;
  generatedAt: string;
  note?: string;
}

interface Context {
  snapshot: Awaited<ReturnType<typeof getProjectSnapshot>>;
  recentTopics: string[];
  hasData: boolean;
  /** Unified skill + knowledge-base view from the Personal Context Engine. */
  personal: string;
}

const SYSTEM = `You are the Project Agent inside a personal engineering-growth OS for one senior backend/full-stack engineer.
Goal: turn learning into portfolio-defining projects.
Rules:
- Identify concrete PORTFOLIO GAPS: capabilities the user is learning or half-knows but has never demonstrated in a real project (e.g. "no distributed-systems proof", "no AI-agent architecture").
- Propose 1-3 buildable project ideas that would push specific "unproven" skills to IMPLEMENTED/PROVEN. A solo developer must be able to build each in a few weeks.
- For each idea: a sharp pitch (why it's worth building / what it proves), the problem it solves, target skills, and 2-6 concrete features each mapped to the skills it demonstrates.
- If the user already has projects, give a next step for each that would strengthen it.
- Be specific to THIS user's skills and recent study. No generic "build a todo app".`;

function buildPrompt(ctx: Context, today: string): string {
  return [
    `Today: ${today}`,
    ``,
    `# The engineer's current context`,
    ctx.personal,
    ``,
    `Existing projects: ${JSON.stringify(ctx.snapshot.projects)}`,
    `Proven/implemented skills: ${JSON.stringify(ctx.snapshot.strengths)}`,
    `In-progress skills (learning/practiced): ${JSON.stringify(ctx.snapshot.inProgress)}`,
    `Learned but NOT yet demonstrated in any project (the gap to target): ${JSON.stringify(ctx.snapshot.unproven)}`,
    `Recent study topics: ${JSON.stringify(ctx.recentTopics)}`,
    ``,
    `Return portfolio gaps, 1-3 project ideas, and a next step for each existing project.`,
  ].join("\n");
}

function deterministicPlan(ctx: Context, reason: string): ProjectPlan {
  const targets = (ctx.snapshot.unproven.length
    ? ctx.snapshot.unproven
    : ctx.snapshot.inProgress
  ).slice(0, 6);

  return {
    portfolioGaps: targets.slice(0, 3).map((s) => ({
      gap: `No project proof for ${s}`,
      why: `You've been learning ${s} but no shipped feature demonstrates it, so it can't reach IMPLEMENTED.`,
    })),
    projectIdeas: [
      {
        name: targets.length
          ? `${targets[0]} demonstrator`
          : "Portfolio project",
        pitch:
          "A focused project whose features each prove one under-demonstrated skill. " +
          `(${reason})`,
        problemSolved:
          "Turns learned-but-unproven skills into reviewable, feature-level evidence.",
        buildComplexity: "medium",
        targetSkills: targets.length ? targets : ["System Design"],
        suggestedFeatures: [
          { title: `Core flow using ${targets[0] ?? "your main stack"}`, skills: targets.slice(0, 3) },
          { title: "Observability + failure handling", skills: targets.slice(2, 5) },
        ],
      },
    ],
    existingProjectNextSteps: ctx.snapshot.projects.map((p) => ({
      project: p.name,
      suggestion: "Mark a shipped feature as done and link the skills it demonstrates.",
    })),
  };
}

export class ProjectAgent extends BaseAgent<Context, ProjectAgentResult> {
  readonly name = "project" as const;

  protected async gatherContext(ctx: AgentContext): Promise<Context> {
    const [snapshot, sessions, pc] = await Promise.all([
      getProjectSnapshot(ctx.userId),
      db
        .select({ topic: learningSessions.topic })
        .from(learningSessions)
        .where(eq(learningSessions.userId, ctx.userId))
        .orderBy(desc(learningSessions.occurredAt))
        .limit(25),
      getPersonalContext({ userId: ctx.userId, purpose: "project_ideas" }),
    ]);

    const recentTopics = [...new Set(sessions.map((s) => s.topic))].slice(0, 15);
    const hasData =
      snapshot.strengths.length +
        snapshot.inProgress.length +
        recentTopics.length >
      0;

    return { snapshot, recentTopics, hasData, personal: pc.toPromptString() };
  }

  protected async analyze(
    ctx: AgentContext,
    context: Context,
  ): Promise<ProjectAgentResult> {
    const today = new Date().toISOString().slice(0, 10);

    if (!context.hasData) {
      return {
        plan: deterministicPlan(context, "Add skills or log learning to unlock AI ideas."),
        source: "deterministic",
        model: null,
        cached: false,
        generatedAt: today,
        note: "No skills or learning yet.",
      };
    }

    const cfg = await resolveModelConfig(ctx.userId, "project");
    if (!hasProviderKey(cfg.provider) || cfg.exhausted) {
      await ctx.log(`${cfg.provider} API key not set — deterministic plan`, {
        level: "warn",
        step: "analyzing",
      });
      return {
        plan: deterministicPlan(context, `Set ${cfg.provider.toUpperCase()}_API_KEY for AI ideas.`),
        source: "deterministic",
        model: null,
        cached: false,
        generatedAt: today,
        note: `${cfg.provider.toUpperCase()}_API_KEY not configured.`,
      };
    }

    const { data, cached, model } = await runStructured({
      userId: ctx.userId,
      agent: "project",
      agentRunId: ctx.agentRunId,
      schema: ProjectPlanSchema,
      schemaName: "project_plan",
      signal: ctx.signal,
      system: SYSTEM,
      prompt: buildPrompt(context, today),
      temperature: 0.4,
    });

    return { plan: data, source: "ai", model, cached, generatedAt: today };
  }

  protected async buildRecommendations(
    _ctx: AgentContext,
    _context: Context,
    analysis: ProjectAgentResult,
  ): Promise<AgentResult> {
    return {
      result: analysis,
      summary: `${analysis.plan.projectIdeas.length} project idea(s), ${analysis.plan.portfolioGaps.length} gap(s)`,
      needsApproval: false,
    };
  }
}

export const projectAgent = new ProjectAgent();
