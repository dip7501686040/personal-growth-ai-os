import { hasProviderKey, resolveModelConfig, runStructured } from "@/lib/llm";
import {
  getBriefingContext,
  upsertBriefing,
  type BriefingContext,
  type BriefingData,
} from "@/modules/briefing/service";
import { BaseAgent } from "./base-agent";
import { BriefingSchema, type Briefing } from "./chief-of-staff-schema";
import type { AgentContext, AgentResult } from "./types";

export interface ChiefOfStaffResult extends Briefing {
  source: "ai" | "deterministic";
  model: string | null;
  cached: boolean;
  generatedAt: string;
  note?: string;
}

const SYSTEM = `You are the Chief of Staff in a personal engineering-growth OS for one senior engineer.
You do NOT run the other agents or change the user's plans. You read every agent's latest output plus pending approvals and recent real activity, then produce ONE ruthless daily briefing.
Rules:
- 3-6 priorities, most important first. Each needs a concrete "why" tied to a real signal in the data and a short "ref" (e.g. "Career: Acme 55% MAYBE", "DSA: recognition gap — graph modeling", "Content: 1 draft ready").
- A pending approval is almost always a top priority (category "review").
- Distinguish PLANNED work (agent suggestions) from work actually COMPLETED (done features, solved DSA, accepted skill evidence). Reward finishing, not just planning.
- "connections": 1-4 notes where one agent's output reinforces another (e.g. "You shipped the RabbitMQ retry feature → that closes the Kafka-adjacent gap the Acme match flagged → worth a LinkedIn post").
- Be specific. No filler.`;

function digest(ctx: BriefingContext): string {
  const runSummary = (name: string) => {
    const r = ctx.agentRuns[name];
    if (!r) return `${name}: never run`;
    return `${name}: ${r.status}${r.finishedAt ? ` @ ${r.finishedAt.slice(0, 10)}` : ""} — ${JSON.stringify(r.result).slice(0, 900)}`;
  };
  return [
    `Today: ${ctx.today}`,
    ``,
    `PENDING APPROVALS (${ctx.pendingApprovals.length}):`,
    ...ctx.pendingApprovals.map((a) => `- [${a.actionType}] ${a.title}`),
    ``,
    `LATEST AGENT RUNS:`,
    runSummary("learning"),
    runSummary("project"),
    runSummary("career"),
    runSummary("content"),
    runSummary("business"),
    ``,
    `RECENT REAL ACTIVITY:`,
    `- learning topics: ${JSON.stringify(ctx.activity.recentLearningTopics)}`,
    `- DSA: ${JSON.stringify(ctx.activity.recentDsa)}`,
    `- done features (7d): ${JSON.stringify(ctx.activity.doneFeaturesRecent)}`,
    `- implemented/proven skills: ${JSON.stringify(ctx.activity.strongSkills)}`,
    ``,
    `QUEUES:`,
    `- projects in flight: ${JSON.stringify(ctx.queues.projectsInFlight)}`,
    `- content by status: ${JSON.stringify(ctx.queues.contentByStatus)}`,
    `- career to decide: ${JSON.stringify(ctx.queues.careerToDecide)}`,
    `- open business opportunities: ${ctx.queues.businessOpen}`,
  ].join("\n");
}

function deterministic(ctx: BriefingContext): Briefing {
  const priorities: Briefing["priorities"] = [];

  if (ctx.pendingApprovals.length) {
    priorities.push({
      title: `Clear ${ctx.pendingApprovals.length} approval${ctx.pendingApprovals.length > 1 ? "s" : ""}`,
      why: "Agents are blocked waiting on your decision.",
      ref: ctx.pendingApprovals.map((a) => a.title).slice(0, 3).join("; "),
      category: "review",
    });
  }

  const learning = ctx.agentRuns.learning?.result as
    | { plan?: { dsaWeakness?: { weakPattern?: string }; dailyPlan?: { dsa?: { topic?: string } } } }
    | undefined;
  if (learning?.plan?.dsaWeakness?.weakPattern) {
    priorities.push({
      title: `Practice: ${learning.plan.dailyPlan?.dsa?.topic ?? learning.plan.dsaWeakness.weakPattern}`,
      why: "Latest learning analysis flagged this as your weakest pattern.",
      ref: `DSA: ${learning.plan.dsaWeakness.weakPattern}`,
      category: "dsa",
    });
  }

  for (const c of ctx.queues.careerToDecide.slice(0, 2)) {
    if (c.recommendation === "yes" || c.recommendation === "maybe") {
      priorities.push({
        title: `Decide on ${c.company} — ${c.role}`,
        why: `Analyzed but not yet applied; the agent said ${c.recommendation.toUpperCase()}.`,
        ref: `Career: ${c.company} ${c.score}% ${c.recommendation.toUpperCase()}`,
        category: "career",
      });
    }
  }

  const ready = ctx.queues.contentByStatus.ready_for_review ?? 0;
  const draft = ctx.queues.contentByStatus.draft ?? 0;
  if (ready + draft > 0) {
    priorities.push({
      title: `Move ${ready + draft} content item${ready + draft > 1 ? "s" : ""} forward`,
      why: "Drafts don't ship themselves.",
      ref: `Content: ${draft} draft, ${ready} ready`,
      category: "content",
    });
  }

  const project = ctx.agentRuns.project?.result as
    | { plan?: { projectIdeas?: { name?: string }[] } }
    | undefined;
  if (
    priorities.length < 5 &&
    project?.plan?.projectIdeas?.[0]?.name &&
    ctx.queues.projectsInFlight.length === 0
  ) {
    priorities.push({
      title: `Start a project: ${project.plan.projectIdeas[0].name}`,
      why: "Nothing is in flight; the Project Agent has an idea ready to turn learning into proof.",
      ref: "Project Agent idea",
      category: "project",
    });
  }

  if (priorities.length === 0) {
    priorities.push({
      title: "Log today's learning or DSA practice",
      why: "No recent activity for the agents to work from.",
      ref: "No data",
      category: "learning",
    });
  }

  return {
    summary:
      `${ctx.pendingApprovals.length} approval(s) pending, ` +
      `${ctx.queues.projectsInFlight.length} project(s) in flight, ` +
      `${ctx.queues.careerToDecide.length} job(s) to decide.`,
    priorities: priorities.slice(0, 6),
    connections: [],
  };
}

export class ChiefOfStaffAgent extends BaseAgent<BriefingContext, ChiefOfStaffResult> {
  readonly name = "chief_of_staff" as const;

  protected gatherContext(ctx: AgentContext): Promise<BriefingContext> {
    return getBriefingContext(ctx.userId);
  }

  protected async analyze(
    ctx: AgentContext,
    context: BriefingContext,
  ): Promise<ChiefOfStaffResult> {
    const today = context.today;
    const cfg = await resolveModelConfig(ctx.userId, "chief_of_staff");

    if (!hasProviderKey(cfg.provider) || cfg.exhausted) {
      const d = deterministic(context);
      return {
        ...d,
        source: "deterministic",
        model: null,
        cached: false,
        generatedAt: today,
        note: `${cfg.provider.toUpperCase()}_API_KEY not configured.`,
      };
    }

    const { data, model, cached } = await runStructured({
      userId: ctx.userId,
      agent: "chief_of_staff",
      agentRunId: ctx.agentRunId,
      schema: BriefingSchema,
      schemaName: "daily_briefing",
      signal: ctx.signal,
      system: SYSTEM,
      prompt: digest(context),
      temperature: 0.3,
      cache: false,
    });

    return { ...data, source: "ai", model, cached, generatedAt: today };
  }

  protected async buildRecommendations(
    ctx: AgentContext,
    context: BriefingContext,
    analysis: ChiefOfStaffResult,
  ): Promise<AgentResult> {
    const data: BriefingData = {
      summary: analysis.summary,
      priorities: analysis.priorities,
      connections: analysis.connections,
      agentStatusSnapshot: Object.entries(context.agentRuns).map(
        ([agent, r]) => ({
          agent,
          status: r?.status ?? "never_run",
          lastRunAt: r?.finishedAt ?? null,
        }),
      ),
      pendingApprovalIds: context.pendingApprovals.map((a) => a.id),
      agentRunId: ctx.agentRunId,
    };
    await upsertBriefing(ctx.userId, context.today, data);

    return {
      result: analysis,
      summary: `Briefing: ${analysis.priorities.length} priorities`,
      needsApproval: false,
    };
  }
}

export const chiefOfStaffAgent = new ChiefOfStaffAgent();
