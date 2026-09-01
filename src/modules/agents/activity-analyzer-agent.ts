import { hasProviderKey, resolveModelConfig, runStructured } from "@/lib/llm";
import {
  eventsForDate,
  markEventsAnalyzed,
  upsertAnalysis,
} from "@/modules/activity/service";
import { addEvidence, upsertSkillByName } from "@/modules/skills/service";
import { createIdea, hasItemForSource } from "@/modules/content/service";
import { BaseAgent } from "./base-agent";
import {
  ActivityAnalysisSchema,
  type ActivityAnalysisResult,
} from "./activity-analysis-schema";
import type { AgentContext, AgentResult } from "./types";
import type { ActivityEvent } from "@/lib/db/schema";

export interface ActivityAnalyzerResult {
  date: string;
  eventCount: number;
  source: "ai" | "deterministic" | "noop";
  model: string | null;
  analysis: ActivityAnalysisResult | null;
  suggestedEvidenceCreated: number;
  contentIdeasCreated: number;
  note?: string;
}

interface Context {
  date: string;
  events: ActivityEvent[];
}

const SYSTEM = `You analyse ONE day of software development activity — metadata only (files changed, commit messages, git stats, session durations). You never see source code.
Rules:
- Raw activity is NOT proof of mastery. Your suggestedSkills are HINTS for the user to review; set confidence honestly (0.9 = the metadata strongly implies real hands-on work, 0.4 = weak signal).
- Base everything on what the files and commit messages actually say. Don't invent skills that aren't evidenced.
- workCategories: short tags. potentialProof: crisp "you could point to X" lines. contentOpportunities: build-in-public hooks.`;

function summariseEvents(events: ActivityEvent[]): string {
  const byProject = new Map<string, ActivityEvent[]>();
  for (const e of events) {
    const k = e.projectName ?? e.projectId ?? "unknown";
    byProject.set(k, [...(byProject.get(k) ?? []), e]);
  }
  const blocks: string[] = [];
  for (const [project, evs] of byProject) {
    const files = new Set<string>();
    const commits: string[] = [];
    let insertions = 0;
    let deletions = 0;
    let seconds = 0;
    for (const e of evs) {
      for (const f of [
        ...(e.filesCreated as string[]),
        ...(e.filesModified as string[]),
        ...(e.filesDeleted as string[]),
      ])
        files.add(f);
      for (const c of e.gitCommits as { message: string }[])
        commits.push(c.message);
      const st = e.gitStats as { insertions?: number; deletions?: number };
      insertions += st.insertions ?? 0;
      deletions += st.deletions ?? 0;
      seconds += e.durationSeconds;
    }
    blocks.push(
      [
        `Project: ${project}`,
        `Sessions: ${evs.length} · ~${Math.round(seconds / 60)} min · +${insertions}/-${deletions}`,
        `Files (${files.size}): ${[...files].slice(0, 40).join(", ")}`,
        `Commit messages: ${commits.length ? commits.map((m) => `"${m}"`).join("; ") : "(none)"}`,
        evs.map((e) => e.sessionSummary).filter(Boolean).join(" | "),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return blocks.join("\n\n");
}

export class ActivityAnalyzerAgent extends BaseAgent<
  Context,
  ActivityAnalyzerResult
> {
  readonly name = "activity_analyzer" as const;

  protected async gatherContext(ctx: AgentContext): Promise<Context> {
    const date =
      (ctx.input.date ? String(ctx.input.date) : "") ||
      new Date().toISOString().slice(0, 10);
    const events = await eventsForDate(ctx.userId, date);
    return { date, events };
  }

  protected async analyze(
    ctx: AgentContext,
    context: Context,
  ): Promise<ActivityAnalyzerResult> {
    if (context.events.length === 0) {
      return {
        date: context.date,
        eventCount: 0,
        source: "noop",
        model: null,
        analysis: null,
        suggestedEvidenceCreated: 0,
        contentIdeasCreated: 0,
        note: "No unanalysed activity for this date.",
      };
    }

    const cfg = await resolveModelConfig(ctx.userId, "activity_analyzer");
    if (!hasProviderKey(cfg.provider)) {
      return {
        date: context.date,
        eventCount: context.events.length,
        source: "deterministic",
        model: null,
        analysis: {
          summary: `${context.events.length} coding session(s); AI analysis unavailable (no ${cfg.provider.toUpperCase()}_API_KEY).`,
          workCategories: [],
          suggestedSkills: [],
          potentialProof: [],
          contentOpportunities: [],
        },
        suggestedEvidenceCreated: 0,
        contentIdeasCreated: 0,
        note: `${cfg.provider.toUpperCase()}_API_KEY not configured.`,
      };
    }

    const { data, model } = await runStructured({
      userId: ctx.userId,
      agent: "activity_analyzer",
      agentRunId: ctx.agentRunId,
      schema: ActivityAnalysisSchema,
      schemaName: "activity_analysis",
      system: SYSTEM,
      prompt: [
        `Date: ${context.date}`,
        ``,
        summariseEvents(context.events),
        ``,
        `Produce the structured analysis.`,
      ].join("\n"),
      temperature: 0.3,
      cache: false,
    });

    return {
      date: context.date,
      eventCount: context.events.length,
      source: "ai",
      model,
      analysis: data,
      suggestedEvidenceCreated: 0,
      contentIdeasCreated: 0,
    };
  }

  protected async buildRecommendations(
    ctx: AgentContext,
    context: Context,
    analysis: ActivityAnalyzerResult,
  ): Promise<AgentResult> {
    if (analysis.source === "noop") {
      return { result: analysis, summary: analysis.note ?? "Nothing to analyse", needsApproval: false };
    }

    const a = analysis.analysis!;
    const eventIds = context.events.map((e) => e.id);

    const analysisId = await upsertAnalysis(ctx.userId, {
      analysisDate: context.date,
      activityEventIds: eventIds,
      agentRunId: ctx.agentRunId,
      summary: a.summary,
      workCategories: a.workCategories,
      suggestedSkills: a.suggestedSkills,
      potentialProof: a.potentialProof,
      contentOpportunities: a.contentOpportunities,
    });

    // Suggested skill evidence — NEVER accepted automatically.
    let evidence = 0;
    for (const s of a.suggestedSkills) {
      if (s.confidence < 0.5) continue;
      const skill = await upsertSkillByName(ctx.userId, s.skill, "concept");
      await addEvidence(ctx.userId, skill.id, {
        summary: `Dev activity (${context.date}): ${s.reason}`,
        sourceType: "activity_analysis",
        sourceId: analysisId,
        supportsLevel: "implemented",
        strength: s.confidence >= 0.8 ? "strong" : s.confidence >= 0.65 ? "moderate" : "weak",
        status: "suggested",
        createdBy: "agent",
        agentRunId: ctx.agentRunId,
      });
      evidence++;
    }

    // One content idea from the day's strongest hook (grounded in this analysis).
    let ideas = 0;
    const topHook = a.contentOpportunities[0];
    if (
      topHook &&
      !(await hasItemForSource(ctx.userId, "activity_analysis", analysisId))
    ) {
      await createIdea(ctx.userId, {
        title: topHook,
        hook: topHook,
        angle: "What I actually built / learned — grounded in the commits.",
        agentRunId: ctx.agentRunId,
        sources: [
          {
            sourceType: "activity_analysis",
            sourceId: analysisId,
            note: `Dev activity ${context.date}: ${a.summary}`,
          },
        ],
      });
      ideas = 1;
    }

    await markEventsAnalyzed(ctx.userId, eventIds);

    analysis.suggestedEvidenceCreated = evidence;
    analysis.contentIdeasCreated = ideas;

    return {
      result: analysis,
      summary: `${context.events.length} session(s) · ${evidence} suggested skill evidence · ${ideas} content idea(s)`,
      needsApproval: false,
    };
  }
}

export const activityAnalyzerAgent = new ActivityAnalyzerAgent();
