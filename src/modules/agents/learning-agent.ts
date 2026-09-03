import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { skillEvidence, skills } from "@/lib/db/schema";
import { hasProviderKey, resolveModelConfig, runStructured } from "@/lib/llm";
import {
  getPatternStats,
  listLearningSessions,
  listRecentAttempts,
  countLearningActivity,
  rankWeakPatterns,
} from "@/modules/learning/service";
import type { PatternStat } from "@/modules/learning/pattern-stats";
import { BaseAgent } from "./base-agent";
import { LearningPlanSchema, type LearningPlan } from "./learning-plan-schema";
import type { AgentContext, AgentResult } from "./types";

export { LearningPlanSchema, type LearningPlan };

export interface LearningAgentResult {
  plan: LearningPlan;
  source: "ai" | "deterministic";
  model: string | null;
  cached: boolean;
  generatedAt: string;
  note?: string;
}

// ── Context ────────────────────────────────────────────────────────────────

interface Context {
  activityCount: number;
  patternStats: PatternStat[];
  weakPatterns: PatternStat[];
  recentSessions: {
    topic: string;
    category: string;
    confidenceAfter: number | null;
    occurredAt: string;
  }[];
  recentAttempts: {
    title: string;
    solved: boolean;
    hintsUsed: number;
    failureReason: string;
    attemptedAt: string;
  }[];
  inProgressSkills: { name: string; level: string; category: string }[];
  activityEvidence: { skill: string; summary: string }[];
}

const SYSTEM = `You are the Learning Agent inside a personal engineering-growth OS for a single senior backend/full-stack engineer.
Your job: produce ONE focused daily learning plan and, when the data supports it, a DSA pattern-recognition weakness note.
Rules:
- Do NOT recommend random LeetCode questions. Focus on DSA PATTERN RECOGNITION (identifying which pattern a problem needs), not raw implementation.
- Every recommendation must include a concrete "why" tied to the user's actual data.
- Prefer the next logical step from what the user recently studied or built over starting something unrelated.
- Be specific and concise. No motivational filler.`;

function buildPrompt(ctx: Context, today: string): string {
  return [
    `Today: ${today}`,
    ``,
    `DSA pattern stats (patterns with >=1 attempt):`,
    JSON.stringify(ctx.patternStats, null, 0),
    ``,
    `Weakest patterns (ranked):`,
    JSON.stringify(
      ctx.weakPatterns.map((p) => ({
        pattern: p.name,
        attempts: p.attempts,
        solveRate: p.solveRate,
        avgHints: p.avgHints,
        couldNotIdentify: p.couldNotIdentify,
        recognitionGap: p.recognitionGap,
      })),
      null,
      0,
    ),
    ``,
    `Recent learning sessions:`,
    JSON.stringify(ctx.recentSessions, null, 0),
    ``,
    `Recent DSA attempts:`,
    JSON.stringify(ctx.recentAttempts, null, 0),
    ``,
    `Skills currently in progress (learning/practiced):`,
    JSON.stringify(ctx.inProgressSkills, null, 0),
    ``,
    `Evidence from recent real development activity:`,
    JSON.stringify(ctx.activityEvidence, null, 0),
    ``,
    `Produce the daily plan. If there is not enough DSA data for a confident weakness call, set dsaWeakness to null.`,
  ].join("\n");
}

function deterministicPlan(ctx: Context, reason: string): LearningPlan {
  const weak = ctx.weakPatterns[0];
  const inProg = ctx.inProgressSkills[0];
  return {
    dsaWeakness: weak
      ? {
          weakPattern: weak.name,
          observation: weak.recognitionGap
            ? `${weak.attempts} attempts, ${Math.round(weak.solveRate * 100)}% solved, but "couldn't identify the pattern" on ${weak.couldNotIdentify} of them — an implementation-vs-recognition gap.`
            : `${weak.attempts} attempts, ${Math.round(weak.solveRate * 100)}% solved, avg ${weak.avgHints} hints — still shaky.`,
          recommendations: [
            `Do 2 problems where the ${weak.name} structure is disguised; write one line on what tipped you off before coding.`,
          ],
        }
      : null,
    dailyPlan: {
      dsa: weak
        ? { topic: `2 ${weak.name} problems (focus: recognising the pattern)`, why: `Weakest pattern by your attempt log.` }
        : { topic: `Log a few DSA attempts with the pattern + failure reason`, why: `No attempt data yet to analyse.` },
      systemDesign: {
        topic: inProg ? `A system-design angle on ${inProg.name}` : `Pick one system-design topic to study`,
        why: inProg ? `You're mid-progress on ${inProg.name}.` : `Nothing in progress to build on.`,
      },
      technology: {
        topic: inProg ? `Deepen ${inProg.name} one level` : `Choose a technology to push from learning → implemented`,
        why: `Advance an in-progress skill rather than starting cold.`,
      },
      revision: null,
    },
    nextLogicalStep:
      (inProg ? `Turn ${inProg.name} into a project feature so it can reach IMPLEMENTED. ` : "") +
      `(${reason})`,
  };
}

// ── Agent ──────────────────────────────────────────────────────────────────

export class LearningAgent extends BaseAgent<Context, LearningAgentResult> {
  readonly name = "learning" as const;

  protected async gatherContext(ctx: AgentContext): Promise<Context> {
    const [activityCount, patternStats, sessions, attempts, inProgress, actEv] =
      await Promise.all([
        countLearningActivity(ctx.userId),
        getPatternStats(ctx.userId),
        listLearningSessions(ctx.userId, 10),
        listRecentAttempts(ctx.userId, 25),
        db
          .select({
            name: skills.name,
            level: skills.level,
            category: skills.category,
          })
          .from(skills)
          .where(eq(skills.userId, ctx.userId))
          .orderBy(desc(skills.updatedAt))
          .limit(60),
        db
          .select({
            skill: skills.name,
            summary: skillEvidence.summary,
          })
          .from(skillEvidence)
          .innerJoin(skills, eq(skills.id, skillEvidence.skillId))
          .where(
            and(
              eq(skillEvidence.userId, ctx.userId),
              eq(skillEvidence.sourceType, "activity_analysis"),
              eq(skillEvidence.status, "accepted"),
              gte(
                skillEvidence.createdAt,
                new Date(Date.now() - 7 * 864e5),
              ),
            ),
          )
          .limit(20),
      ]);

    return {
      activityCount,
      patternStats,
      weakPatterns: rankWeakPatterns(patternStats).slice(0, 4),
      recentSessions: sessions.map((s) => ({
        topic: s.topic,
        category: s.category,
        confidenceAfter: s.confidenceAfter,
        occurredAt: s.occurredAt.toISOString().slice(0, 10),
      })),
      recentAttempts: attempts.map((a) => ({
        title: a.title,
        solved: a.solved,
        hintsUsed: a.hintsUsed,
        failureReason: a.failureReason,
        attemptedAt: a.attemptedAt.toISOString().slice(0, 10),
      })),
      inProgressSkills: inProgress
        .filter((s) => s.level === "learning" || s.level === "practiced")
        .slice(0, 12),
      activityEvidence: actEv,
    };
  }

  protected async analyze(
    ctx: AgentContext,
    context: Context,
  ): Promise<LearningAgentResult> {
    const today = new Date().toISOString().slice(0, 10);

    if (context.activityCount === 0) {
      await ctx.log("No learning/DSA data yet — deterministic starter plan", {
        level: "warn",
        step: "analyzing",
      });
      return {
        plan: deterministicPlan(context, "Log learning sessions and DSA attempts to unlock AI analysis."),
        source: "deterministic",
        model: null,
        cached: false,
        generatedAt: today,
        note: "No data yet — log some practice.",
      };
    }

    const cfg = await resolveModelConfig(ctx.userId, "learning");
    if (!hasProviderKey(cfg.provider) || cfg.exhausted) {
      await ctx.log(`${cfg.provider} API key not set — deterministic plan`, {
        level: "warn",
        step: "analyzing",
      });
      return {
        plan: deterministicPlan(context, `Set ${cfg.provider.toUpperCase()}_API_KEY for AI analysis.`),
        source: "deterministic",
        model: null,
        cached: false,
        generatedAt: today,
        note: `${cfg.provider.toUpperCase()}_API_KEY not configured.`,
      };
    }

    const { data, cached, model } = await runStructured({
      userId: ctx.userId,
      agent: "learning",
      agentRunId: ctx.agentRunId,
      schema: LearningPlanSchema,
      schemaName: "learning_plan",
      signal: ctx.signal,
      system: SYSTEM,
      prompt: buildPrompt(context, today),
      temperature: 0.3,
    });

    return {
      plan: data,
      source: "ai",
      model,
      cached,
      generatedAt: today,
    };
  }

  protected async buildRecommendations(
    _ctx: AgentContext,
    _context: Context,
    analysis: LearningAgentResult,
  ): Promise<AgentResult> {
    const weak = analysis.plan.dsaWeakness;
    return {
      result: analysis,
      summary: weak
        ? `Plan ready · weak pattern: ${weak.weakPattern}`
        : `Plan ready (${analysis.source})`,
      needsApproval: false,
    };
  }
}

export const learningAgent = new LearningAgent();
