"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUserId } from "@/lib/user";
import {
  createOpportunity,
  deleteOpportunity,
  updateOpportunity,
} from "@/modules/business/service";

export type ActionState = { ok: boolean; message: string } | null;
const err = (message: string): ActionState => ({ ok: false, message });

const STATUS = ["idea", "exploring", "validated", "dropped"] as const;

const createSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(200),
  problem: z.string().trim().min(1, "Problem is required.").max(2000),
  targetCustomer: z.string().trim().min(1, "Target customer is required.").max(400),
  proposedSolution: z.string().trim().min(1, "Solution is required.").max(2000),
  techStack: z.string().trim().max(400).optional(),
  complexity: z.enum(["low", "medium", "high"]).default("medium"),
  monetizationModel: z.string().trim().max(400).optional(),
});

export async function createOpportunityAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = createSchema.safeParse({
    title: fd.get("title"),
    problem: fd.get("problem"),
    targetCustomer: fd.get("targetCustomer"),
    proposedSolution: fd.get("proposedSolution"),
    techStack: fd.get("techStack") || undefined,
    complexity: fd.get("complexity") || "medium",
    monetizationModel: fd.get("monetizationModel") || undefined,
  });
  if (!parsed.success) return err(parsed.error.issues[0].message);

  const opp = await createOpportunity(userId, {
    ...parsed.data,
    techStack: parsed.data.techStack
      ? parsed.data.techStack.split(",").map((s) => s.trim()).filter(Boolean)
      : [],
  });
  revalidatePath("/business");
  redirect(`/business/${opp.id}`);
}

const updateSchema = z.object({
  id: z.uuid(),
  status: z.enum(STATUS),
  notes: z.string().trim().max(4000).optional(),
  proposedSolution: z.string().trim().max(4000).optional(),
  monetizationModel: z.string().trim().max(400).optional(),
});

export async function updateOpportunityAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = updateSchema.safeParse({
    id: fd.get("id"),
    status: fd.get("status"),
    notes: fd.get("notes") ?? undefined,
    proposedSolution: fd.get("proposedSolution") ?? undefined,
    monetizationModel: fd.get("monetizationModel") ?? undefined,
  });
  if (!parsed.success) return err(parsed.error.issues[0].message);
  const { id, ...patch } = parsed.data;
  await updateOpportunity(userId, id, patch);
  revalidatePath(`/business/${id}`);
  revalidatePath("/business");
  return { ok: true, message: "Saved." };
}

export async function deleteOpportunityAction(fd: FormData): Promise<void> {
  const userId = await requireUserId();
  const id = z.uuid().parse(fd.get("id"));
  await deleteOpportunity(userId, id);
  revalidatePath("/business");
  redirect("/business");
}
