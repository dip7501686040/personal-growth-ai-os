import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { approvals, type Approval, type NewApproval } from "@/lib/db/schema";
import { setEvidenceStatus } from "@/modules/skills/service";
import { setOpportunityStatus } from "@/modules/career/service";
import { updateContentItem } from "@/modules/content/service";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export async function listApprovals(
  userId: string,
  opts?: { status?: ApprovalStatus },
): Promise<Approval[]> {
  const where = opts?.status
    ? and(eq(approvals.userId, userId), eq(approvals.status, opts.status))
    : eq(approvals.userId, userId);
  return db
    .select()
    .from(approvals)
    .where(where)
    .orderBy(desc(approvals.createdAt));
}

export async function getApproval(
  userId: string,
  id: string,
): Promise<Approval | null> {
  const [row] = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.userId, userId), eq(approvals.id, id)))
    .limit(1);
  return row ?? null;
}

export async function createApproval(
  userId: string,
  input: Omit<NewApproval, "userId" | "id" | "createdAt" | "status"> & {
    status?: ApprovalStatus;
  },
): Promise<Approval> {
  const [row] = await db
    .insert(approvals)
    .values({ ...input, userId, status: input.status ?? "pending" })
    .returning();
  return row;
}

/**
 * Applies a decision to a pending approval. Each `action_type` has a small
 * handler; for Phase 2 only `promote_skill` is wired.
 */
export async function resolveApproval(
  userId: string,
  id: string,
  decision: "approved" | "rejected",
  feedback?: string,
): Promise<void> {
  const approval = await getApproval(userId, id);
  if (!approval) throw new Error("Approval not found.");
  if (approval.status !== "pending") {
    throw new Error("This approval has already been decided.");
  }

  if (approval.actionType === "promote_skill") {
    const ctx = (approval.context ?? {}) as { evidenceId?: string };
    if (ctx.evidenceId) {
      await setEvidenceStatus(
        userId,
        ctx.evidenceId,
        decision === "approved" ? "accepted" : "rejected",
      );
    }
  }

  if (approval.actionType === "apply_job" && decision === "approved") {
    const ctx = (approval.context ?? {}) as { opportunityId?: string };
    if (ctx.opportunityId) {
      await setOpportunityStatus(userId, ctx.opportunityId, "applied");
    }
  }

  if (approval.actionType === "publish_content") {
    const ctx = (approval.context ?? {}) as { contentItemId?: string };
    if (ctx.contentItemId) {
      await updateContentItem(userId, ctx.contentItemId, {
        // approved = cleared to post; the user still posts manually and marks published.
        status: decision === "approved" ? "approved" : "ready_for_review",
      });
    }
  }

  await db
    .update(approvals)
    .set({
      status: decision,
      feedback: feedback?.trim() || null,
      decidedAt: new Date(),
    })
    .where(and(eq(approvals.userId, userId), eq(approvals.id, id)));
}
