import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  careerMatches,
  careerOpportunities,
  type CareerMatch,
  type CareerOpportunity,
} from "@/lib/db/schema";

type Status = "new" | "analyzed" | "applied" | "rejected" | "archived";

export type OpportunityListItem = CareerOpportunity & {
  latestScore: number | null;
  latestRecommendation: "yes" | "maybe" | "no" | null;
};

export async function listOpportunities(
  userId: string,
): Promise<OpportunityListItem[]> {
  const opps = await db
    .select()
    .from(careerOpportunities)
    .where(eq(careerOpportunities.userId, userId))
    .orderBy(desc(careerOpportunities.updatedAt));
  if (opps.length === 0) return [];

  const matches = await db
    .select()
    .from(careerMatches)
    .where(eq(careerMatches.userId, userId))
    .orderBy(desc(careerMatches.createdAt));

  return opps.map((o) => {
    const m = matches.find((x) => x.opportunityId === o.id);
    return {
      ...o,
      latestScore: m?.overallScore ?? null,
      latestRecommendation: m?.recommendation ?? null,
    };
  });
}

export async function getOpportunity(
  userId: string,
  id: string,
): Promise<{ opportunity: CareerOpportunity; match: CareerMatch | null } | null> {
  const [opportunity] = await db
    .select()
    .from(careerOpportunities)
    .where(
      and(eq(careerOpportunities.userId, userId), eq(careerOpportunities.id, id)),
    )
    .limit(1);
  if (!opportunity) return null;

  const [match] = await db
    .select()
    .from(careerMatches)
    .where(eq(careerMatches.opportunityId, id))
    .orderBy(desc(careerMatches.createdAt))
    .limit(1);

  return { opportunity, match: match ?? null };
}

export async function createOpportunity(
  userId: string,
  input: {
    company: string;
    role: string;
    jobUrl?: string;
    location?: string;
    description: string;
  },
): Promise<CareerOpportunity> {
  const [row] = await db
    .insert(careerOpportunities)
    .values({
      userId,
      company: input.company.trim(),
      role: input.role.trim(),
      jobUrl: input.jobUrl?.trim() || null,
      location: input.location?.trim() || null,
      description: input.description.trim(),
    })
    .returning();
  return row;
}

export async function setOpportunityStatus(
  userId: string,
  id: string,
  status: Status,
): Promise<void> {
  await db
    .update(careerOpportunities)
    .set({ status, updatedAt: new Date() })
    .where(
      and(eq(careerOpportunities.userId, userId), eq(careerOpportunities.id, id)),
    );
}

export async function deleteOpportunity(
  userId: string,
  id: string,
): Promise<void> {
  await db
    .delete(careerOpportunities)
    .where(
      and(eq(careerOpportunities.userId, userId), eq(careerOpportunities.id, id)),
    );
}

export interface MatchData {
  overallScore: number;
  recommendation: "yes" | "maybe" | "no";
  summary: string;
  provenMatches: string[];
  implementedMatches: string[];
  partialMatches: { skill: string; have: string; note: string }[];
  aspirationalMatches: string[];
  missingSkills: string[];
  gapClosingWork: { gap: string; suggestion: string }[];
  rationale: string;
}

export async function saveMatch(
  userId: string,
  opportunityId: string,
  agentRunId: string | null,
  data: MatchData,
): Promise<void> {
  await db.insert(careerMatches).values({
    userId,
    opportunityId,
    agentRunId,
    overallScore: data.overallScore,
    recommendation: data.recommendation,
    summary: data.summary,
    provenMatches: data.provenMatches,
    implementedMatches: data.implementedMatches,
    partialMatches: data.partialMatches,
    aspirationalMatches: data.aspirationalMatches,
    missingSkills: data.missingSkills,
    gapClosingWork: data.gapClosingWork,
    rationale: data.rationale,
  });
  await setOpportunityStatus(userId, opportunityId, "analyzed");
}
