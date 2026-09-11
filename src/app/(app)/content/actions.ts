"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUserId } from "@/lib/user";
import { purgePolymorphicRefs, resyncEntity } from "@/modules/knowledge/resync";
import { createApproval, listApprovals } from "@/modules/approvals/service";
import {
  createIdea,
  createPortfolioCard,
  deleteContentItem,
  getContentItem,
  updateContentItem,
  updatePortfolioCard,
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
  const after = await getContentItem(userId, id);
  if (after?.item.status === "published") {
    await resyncEntity(
      userId,
      "content_item",
      id,
      [after.item.title, after.item.hook, after.item.angle].filter(Boolean).join(". "),
    );
  } else {
    await purgePolymorphicRefs(userId, "content_item", id);
  }
  revalidatePath(`/content/${id}`);
  revalidatePath("/content");
  return { ok: true, message: "Saved." };
}

export async function deleteContentAction(fd: FormData): Promise<void> {
  const userId = await requireUserId();
  const id = z.uuid().parse(fd.get("id"));
  await purgePolymorphicRefs(userId, "content_item", id);
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
  const pub = await getContentItem(userId, id.data);
  if (pub) {
    await resyncEntity(
      userId,
      "content_item",
      id.data,
      [pub.item.title, pub.item.hook, pub.item.angle].filter(Boolean).join(". "),
    );
  }
  revalidatePath("/content");
  revalidatePath(`/content/${id.data}`);
  return { ok: true, message: "Marked published." };
}

// ── Portfolio cards (Group C) ────────────────────────────────────────────────

const cardKindSchema = z.enum(["diagram", "screenshot", "video"]);

const newCardSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(200),
  caption: z.string().trim().max(400).optional(),
  kind: cardKindSchema,
  cloudinaryPublicId: z.string().trim().min(1, "Pick an asset."),
  cloudinaryResourceType: z.enum(["image", "video"]),
  cloudinaryFormat: z.string().trim().min(1),
  featureId: z.uuid().optional(),
});

export async function createPortfolioCardAction(
  _p: ActionState,
  input: {
    title: string;
    caption?: string;
    kind: string;
    cloudinaryPublicId: string;
    cloudinaryResourceType: string;
    cloudinaryFormat: string;
    featureId?: string;
  },
): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = newCardSchema.safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0].message);
  await createPortfolioCard(userId, {
    ...parsed.data,
    featureId: parsed.data.featureId ?? null,
  });
  revalidatePath("/content");
  return { ok: true, message: "Card added — live on the portfolio now." };
}

export async function updatePortfolioCardAction(
  _p: ActionState,
  input: { id: string; title: string; caption: string; isPublic: boolean; featureId: string | null },
): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = z
    .object({
      id: z.uuid(),
      title: z.string().trim().min(1).max(200),
      caption: z.string().trim().max(400),
      isPublic: z.boolean(),
      featureId: z.uuid().nullable(),
    })
    .safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0].message);
  const { id, ...patch } = parsed.data;
  await updatePortfolioCard(userId, id, patch);
  revalidatePath("/content");
  return { ok: true, message: "Saved." };
}

export async function deletePortfolioCardAction(
  _p: ActionState,
  id: string,
): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return err("Bad id.");
  await deleteContentItem(userId, parsed.data);
  revalidatePath("/content");
  return { ok: true, message: "Deleted." };
}
