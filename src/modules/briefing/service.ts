import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  businessOpportunities,
  careerMatches,
  careerOpportunities,
  contentItems,
  dailyBriefings,
  dsaAttempts,
  dsaProblems,
  learningSessions,
  projectFeatures,
  projects,
  skills,
  type DailyBriefing,
} from "@/lib/db/schema";
import { listApprovals } from "@/modules/approvals/service";
import { getLatestRun } from "@/modules/agents/runs";
import type { AgentName } from "@/lib/llm";

const AGENT_NAMES: AgentName[] = [
  "learning",
  "project",
  "career",
  "content",
  "business",
];

export interface BriefingContext {
  today: string;
  pendingApprovals: {
    id: string;
    title: string;
    actionType: string;
    agentName: string | null;
  }[];
  agentRuns: Record<
    string,
    { status: string; finishedAt: string | null; result: unknown } | null
  >;
  activity: {
    recentLearningTopics: string[];
    recentDsa: { title: string; solved: boolean; failureReason: string }[];
    strongSkills: string[];
    doneFeaturesRecent: { title: string; project: string }[];
  };
  queues: {
    projectsInFlight: string[];
    contentByStatus: Record<string, number>;
    careerToDecide: {
      id: string;
      company: string;
      role: string;
      score: number;
      recommendation: string;
    }[];
    businessOpen: number;
  };
}

export async function getBriefingContext(
  userId: string,
): Promise<BriefingContext> {
  const since = new Date(Date.now() - 7 * 864e5);
  const today = new Date().toISOString().slice(0, 10);

  const [
    pending,
    runs,
    sessions,
    dsa,
    strong,
    doneFeatures,
    inFlight,
    content,
    careerRows,
    businessCount,
  ] = await Promise.all([
    listApprovals(userId, { status: "pending" }),
    Promise.all(AGENT_NAMES.map((n) => getLatestRun(userId, n))),
    db
      .select({ topic: learningSessions.topic })
      .from(learningSessions)
      .where(
        and(
          eq(learningSessions.userId, userId),
          gte(learningSessions.occurredAt, since),
        ),
      )
      .orderBy(desc(learningSessions.occurredAt))
      .limit(12),
    db
      .select({
        title: dsaProblems.title,
        solved: dsaAttempts.solved,
        failureReason: dsaAttempts.failureReason,
      })
      .from(dsaAttempts)
      .innerJoin(dsaProblems, eq(dsaProblems.id, dsaAttempts.problemId))
      .where(
        and(
          eq(dsaAttempts.userId, userId),
          gte(dsaAttempts.attemptedAt, since),
        ),
      )
      .orderBy(desc(dsaAttempts.attemptedAt))
      .limit(10),
    db
      .select({ name: skills.name })
      .from(skills)
      .where(
        and(
          eq(skills.userId, userId),
          inArray(skills.level, ["implemented", "proven"]),
        ),
      )
      .limit(40),
    db
      .select({ title: projectFeatures.title, project: projects.name })
      .from(projectFeatures)
      .innerJoin(projects, eq(projects.id, projectFeatures.projectId))
      .where(
        and(
          eq(projectFeatures.userId, userId),
          eq(projectFeatures.status, "done"),
          gte(projectFeatures.completedAt, since),
        ),
      )
      .orderBy(desc(projectFeatures.completedAt))
      .limit(10),
    db
      .select({ name: projects.name })
      .from(projects)
      .where(
        and(
          eq(projects.userId, userId),
          inArray(projects.status, ["planning", "building"]),
        ),
      ),
    db
      .select({ status: contentItems.status, n: sql<number>`count(*)::int` })
      .from(contentItems)
      .where(eq(contentItems.userId, userId))
      .groupBy(contentItems.status),
    db
      .select({
        id: careerOpportunities.id,
        company: careerOpportunities.company,
        role: careerOpportunities.role,
        status: careerOpportunities.status,
      })
      .from(careerOpportunities)
      .where(
        and(
          eq(careerOpportunities.userId, userId),
          eq(careerOpportunities.status, "analyzed"),
        ),
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(businessOpportunities)
      .where(
        and(
          eq(businessOpportunities.userId, userId),
          inArray(businessOpportunities.status, ["idea", "exploring"]),
        ),
      ),
  ]);

  // latest career match per to-decide opportunity
  const oppIds = careerRows.map((c) => c.id);
  const matches = oppIds.length
    ? await db
        .select()
        .from(careerMatches)
        .where(inArray(careerMatches.opportunityId, oppIds))
        .orderBy(desc(careerMatches.createdAt))
    : [];

  return {
    today,
    pendingApprovals: pending.map((a) => ({
      id: a.id,
      title: a.title,
      actionType: a.actionType,
      agentName: a.agentName,
    })),
    agentRuns: Object.fromEntries(
      AGENT_NAMES.map((n, i) => {
        const r = runs[i];
        return [
          n,
          r
            ? {
                status: r.status,
                finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
                result: r.result,
              }
            : null,
        ];
      }),
    ),
    activity: {
      recentLearningTopics: [...new Set(sessions.map((s) => s.topic))],
      recentDsa: dsa,
      strongSkills: strong.map((s) => s.name),
      doneFeaturesRecent: doneFeatures,
    },
    queues: {
      projectsInFlight: inFlight.map((p) => p.name),
      contentByStatus: Object.fromEntries(content.map((c) => [c.status, c.n])),
      careerToDecide: careerRows.map((c) => {
        const m = matches.find((x) => x.opportunityId === c.id);
        return {
          id: c.id,
          company: c.company,
          role: c.role,
          score: m?.overallScore ?? 0,
          recommendation: m?.recommendation ?? "unknown",
        };
      }),
      businessOpen: businessCount[0]?.n ?? 0,
    },
  };
}

// ── Persistence ───────────────────────────────────────────────────────────

export interface BriefingData {
  summary: string;
  priorities: { title: string; why: string; ref: string; category: string }[];
  connections: { note: string }[];
  agentStatusSnapshot: {
    agent: string;
    status: string;
    lastRunAt: string | null;
  }[];
  pendingApprovalIds: string[];
  agentRunId?: string | null;
}

export async function upsertBriefing(
  userId: string,
  briefingDate: string,
  data: BriefingData,
): Promise<void> {
  await db
    .delete(dailyBriefings)
    .where(
      and(
        eq(dailyBriefings.userId, userId),
        eq(dailyBriefings.briefingDate, briefingDate),
      ),
    );
  await db.insert(dailyBriefings).values({
    userId,
    briefingDate,
    agentRunId: data.agentRunId ?? null,
    summary: data.summary,
    priorities: data.priorities,
    connections: data.connections,
    agentStatusSnapshot: data.agentStatusSnapshot,
    pendingApprovalIds: data.pendingApprovalIds,
  });
}

export async function getLatestBriefing(
  userId: string,
): Promise<DailyBriefing | null> {
  const [row] = await db
    .select()
    .from(dailyBriefings)
    .where(eq(dailyBriefings.userId, userId))
    .orderBy(desc(dailyBriefings.briefingDate))
    .limit(1);
  return row ?? null;
}
