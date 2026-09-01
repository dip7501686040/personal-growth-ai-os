"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUserId } from "@/lib/user";
import { createApproval, listApprovals } from "@/modules/approvals/service";
import {
  createOpportunity,
  deleteOpportunity,
  getOpportunity,
  setOpportunityStatus,
} from "@/modules/career/service";

export type ActionState = { ok: boolean; message: string } | null;
const err = (message: string): ActionState => ({ ok: false, message });

const CAREER_STATUS = ["new", "analyzed", "applied", "rejected", "archived"] as const;

const createSchema = z.object({
  company: z.string().trim().min(1, "Company is required.").max(160),
  role: z.string().trim().min(1, "Role is required.").max(160),
  jobUrl: z.union([z.url(), z.literal("")]).optional(),
  location: z.string().trim().max(160).optional(),
  description: z.string().trim().min(20, "Paste the job description.").max(20000),
});

export async function createOpportunityAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = createSchema.safeParse({
    company: fd.get("company"),
    role: fd.get("role"),
    jobUrl: fd.get("jobUrl") || undefined,
    location: fd.get("location") || undefined,
    description: fd.get("description"),
  });
  if (!parsed.success) return err(parsed.error.issues[0].message);

  let id: string;
  try {
    const opp = await createOpportunity(userId, {
      ...parsed.data,
      jobUrl: parsed.data.jobUrl || undefined,
    });
    id = opp.id;
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not add opportunity.");
  }
  revalidatePath("/career");
  redirect(`/career/${id}`);
}

const statusSchema = z.object({
  opportunityId: z.uuid(),
  status: z.enum(CAREER_STATUS),
});

export async function setOpportunityStatusAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = statusSchema.safeParse({
    opportunityId: fd.get("opportunityId"),
    status: fd.get("status"),
  });
  if (!parsed.success) return err(parsed.error.issues[0].message);
  await setOpportunityStatus(userId, parsed.data.opportunityId, parsed.data.status);
  revalidatePath(`/career/${parsed.data.opportunityId}`);
  revalidatePath("/career");
  return { ok: true, message: "Status updated." };
}

export async function deleteOpportunityAction(fd: FormData): Promise<void> {
  const userId = await requireUserId();
  const id = z.uuid().parse(fd.get("opportunityId"));
  await deleteOpportunity(userId, id);
  revalidatePath("/career");
  redirect("/career");
}

/** Creates an apply_job approval — the actual "apply" is human-gated. */
export async function requestApplyAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const id = z.uuid().safeParse(fd.get("opportunityId"));
  if (!id.success) return err("Bad opportunity id.");

  const data = await getOpportunity(userId, id.data);
  if (!data) return err("Opportunity not found.");

  const pending = await listApprovals(userId, { status: "pending" });
  if (
    pending.some(
      (a) =>
        a.actionType === "apply_job" &&
        (a.context as { opportunityId?: string }).opportunityId === id.data,
    )
  ) {
    return { ok: true, message: "Already pending in the Approval Inbox." };
  }

  const { opportunity, match } = data;
  await createApproval(userId, {
    agentName: "career",
    actionType: "apply_job",
    title: `Apply: ${opportunity.role} at ${opportunity.company}`,
    reason: match
      ? `Match ${match.overallScore}% · recommendation ${match.recommendation.toUpperCase()}. ${match.summary}`
      : "No analysis yet — run the Career Agent first for an honest read.",
    context: { opportunityId: id.data },
    expectedOutcome: "Opportunity is marked Applied.",
  });

  revalidatePath("/career");
  revalidatePath(`/career/${id.data}`);
  revalidatePath("/approvals");
  return { ok: true, message: "Sent to the Approval Inbox." };
}
