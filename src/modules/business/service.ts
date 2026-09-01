import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  businessOpportunities,
  projects,
  skills,
  type BusinessOpportunity,
} from "@/lib/db/schema";

type Complexity = "low" | "medium" | "high";
type Status = "idea" | "exploring" | "validated" | "dropped";

export function listOpportunities(
  userId: string,
): Promise<BusinessOpportunity[]> {
  return db
    .select()
    .from(businessOpportunities)
    .where(eq(businessOpportunities.userId, userId))
    .orderBy(desc(businessOpportunities.updatedAt));
}

export async function getOpportunity(
  userId: string,
  id: string,
): Promise<BusinessOpportunity | null> {
  const [row] = await db
    .select()
    .from(businessOpportunities)
    .where(
      and(
        eq(businessOpportunities.userId, userId),
        eq(businessOpportunities.id, id),
      ),
    )
    .limit(1);
  return row ?? null;
}

export interface OpportunityInput {
  title: string;
  problem: string;
  targetCustomer: string;
  proposedSolution: string;
  techStack?: string[];
  skillMatchScore?: number;
  complexity?: Complexity;
  buildScope?: string;
  monetizationModel?: string;
  market?: string;
  businessType?: string;
  agentRunId?: string | null;
}

export async function createOpportunity(
  userId: string,
  input: OpportunityInput,
): Promise<BusinessOpportunity> {
  const [row] = await db
    .insert(businessOpportunities)
    .values({
      userId,
      agentRunId: input.agentRunId ?? null,
      title: input.title.trim(),
      problem: input.problem.trim(),
      targetCustomer: input.targetCustomer.trim(),
      proposedSolution: input.proposedSolution.trim(),
      techStack: input.techStack ?? [],
      skillMatchScore: input.skillMatchScore ?? 0,
      complexity: input.complexity ?? "medium",
      buildScope: input.buildScope?.trim() || null,
      monetizationModel: input.monetizationModel?.trim() || null,
      market: input.market?.trim() || null,
      businessType: input.businessType?.trim() || null,
    })
    .returning();
  return row;
}

export async function updateOpportunity(
  userId: string,
  id: string,
  patch: Partial<{
    status: Status;
    notes: string;
    proposedSolution: string;
    monetizationModel: string;
  }>,
): Promise<void> {
  await db
    .update(businessOpportunities)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(businessOpportunities.userId, userId),
        eq(businessOpportunities.id, id),
      ),
    );
}

export async function deleteOpportunity(
  userId: string,
  id: string,
): Promise<void> {
  await db
    .delete(businessOpportunities)
    .where(
      and(
        eq(businessOpportunities.userId, userId),
        eq(businessOpportunities.id, id),
      ),
    );
}

export async function titleExists(
  userId: string,
  title: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: businessOpportunities.id })
    .from(businessOpportunities)
    .where(
      and(
        eq(businessOpportunities.userId, userId),
        eq(businessOpportunities.title, title.trim()),
      ),
    )
    .limit(1);
  return !!row;
}

/** Skills + projects context for the Business agent. */
export async function getBusinessSnapshot(userId: string) {
  const [skillRows, projectRows] = await Promise.all([
    db
      .select({ name: skills.name, level: skills.level })
      .from(skills)
      .where(eq(skills.userId, userId)),
    db
      .select({ name: projects.name, status: projects.status })
      .from(projects)
      .where(eq(projects.userId, userId)),
  ]);

  return {
    buildableWith: skillRows
      .filter((s) => s.level === "implemented" || s.level === "proven")
      .map((s) => s.name),
    alsoKnows: skillRows
      .filter((s) => s.level === "practiced")
      .map((s) => s.name),
    projects: projectRows.map((p) => `${p.name} (${p.status})`),
  };
}
