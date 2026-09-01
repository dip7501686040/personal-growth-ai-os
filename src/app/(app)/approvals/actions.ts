"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserId } from "@/lib/user";
import { resolveApproval } from "@/modules/approvals/service";

export type ActionState = { ok: boolean; message: string } | null;

const schema = z.object({
  approvalId: z.uuid(),
  decision: z.enum(["approved", "rejected"]),
  feedback: z.string().trim().max(1000).optional(),
});

export async function resolveApprovalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = schema.safeParse({
    approvalId: formData.get("approvalId"),
    decision: formData.get("decision"),
    feedback: formData.get("feedback") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }

  try {
    await resolveApproval(
      userId,
      parsed.data.approvalId,
      parsed.data.decision,
      parsed.data.feedback,
    );
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Could not resolve approval.",
    };
  }

  revalidatePath("/approvals");
  revalidatePath("/skills");
  return {
    ok: true,
    message: parsed.data.decision === "approved" ? "Approved." : "Rejected.",
  };
}
