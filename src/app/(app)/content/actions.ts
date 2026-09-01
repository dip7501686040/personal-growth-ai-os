"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUserId } from "@/lib/user";
import { createApproval, listApprovals } from "@/modules/approvals/service";
import {
  createIdea,
  deleteContentItem,
  getContentItem,
  updateContentItem,
} from "@/modules/content/service";

export type ActionState = { ok: boolean; message: string } | null;
const err = (message: string): ActionState => ({ ok: false, message });

const STATUS = [
  "idea",
  "draft",
  "ready_for_review",
  "approved",
  "published",
] as const;

const newIdeaSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(200),
  hook: z.string().trim().max(400).optional(),
  angle: z.string().trim().max(600).optional(),
  note: z.string().trim().max(600).optional(),
});

export async function createIdeaAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = newIdeaSchema.safeParse({
    title: fd.get("title"),
    hook: fd.get("hook") || undefined,
    angle: fd.get("angle") || undefined,
    note: fd.get("note") || undefined,
  });
  if (!parsed.success) return err(parsed.error.issues[0].message);
  await createIdea(userId, {
    title: parsed.data.title,
    hook: parsed.data.hook,
    angle: parsed.data.angle,
    sources: [{ sourceType: "manual", note: parsed.data.note ?? "Manual idea" }],
  });
  revalidatePath("/content");
  return { ok: true, message: "Idea added." };
}

const editSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().max(8000).optional(),
  status: z.enum(STATUS),
});

export async function updateContentAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = editSchema.safeParse({
    id: fd.get("id"),
    title: fd.get("title"),
    body: fd.get("body") ?? undefined,
    status: fd.get("status"),
  });
  if (!parsed.success) return err(parsed.error.issues[0].message);
  const { id, ...patch } = parsed.data;
  await updateContentItem(userId, id, patch);
  revalidatePath(`/content/${id}`);
  revalidatePath("/content");
  return { ok: true, message: "Saved." };
}

export async function deleteContentAction(fd: FormData): Promise<void> {
  const userId = await requireUserId();
  const id = z.uuid().parse(fd.get("id"));
  await deleteContentItem(userId, id);
  revalidatePath("/content");
  redirect("/content");
}

/** ready_for_review → publish_content approval. */
export async function requestPublishAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return err("Bad id.");

  const got = await getContentItem(userId, id.data);
  if (!got) return err("Not found.");
  if (!got.item.body?.trim()) return err("Write the draft first.");

  const pending = await listApprovals(userId, { status: "pending" });
  if (
    pending.some(
      (a) =>
        a.actionType === "publish_content" &&
        (a.context as { contentItemId?: string }).contentItemId === id.data,
    )
  ) {
    return { ok: true, message: "Already pending in the Approval Inbox." };
  }

  await updateContentItem(userId, id.data, { status: "ready_for_review" });
  await createApproval(userId, {
    agentName: "content",
    actionType: "publish_content",
    title: `Publish to LinkedIn: ${got.item.title}`,
    reason: got.item.body.slice(0, 800),
    context: { contentItemId: id.data },
    expectedOutcome: "Item is cleared to post (you still post manually).",
  });
  revalidatePath("/content");
  revalidatePath(`/content/${id.data}`);
  revalidatePath("/approvals");
  return { ok: true, message: "Sent to the Approval Inbox." };
}

export async function markPublishedAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return err("Bad id.");
  await updateContentItem(userId, id.data, { status: "published" });
  revalidatePath("/content");
  revalidatePath(`/content/${id.data}`);
  return { ok: true, message: "Marked published." };
}
