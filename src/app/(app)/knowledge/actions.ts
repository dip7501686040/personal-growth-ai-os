"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { knowledgeDocumentTags, knowledgeLinks } from "@/lib/db/schema";
import type { Page } from "@/lib/paginate";
import { requireUserId } from "@/lib/user";
import {
  deleteKnowledgeDocument,
  listKnowledgeDocuments,
  updateKnowledgeDocument,
  type KnowledgeDocListItem,
} from "@/lib/knowledge";
import { extractionAgent } from "@/modules/agents/extraction-agent";
import {
  combineJobs,
  countPendingJobs,
  deleteJob,
  listJobs,
  listJobsForSource,
  updateJobPayload,
  type JobListItem,
} from "@/modules/ingestion/queue";
import { drainContextEvents } from "@/modules/ingestion/refresh";
import { KNOWLEDGE_TARGET_TYPES } from "@/modules/knowledge/target-types";

const QUEUE_STATUSES = ["pending", "running", "failed"];
const PAGE_SIZE = 10;
import {
  addSource,
  ingestUpload,
  removeSource,
  resetSourceCursor,
  runSourceSync,
  setSourceStatus,
  UPLOAD_CATEGORIES,
} from "@/modules/ingestion/sources";

export type ActionState =
  | { ok: true; message: string }
  | { ok: false; message: string }
  | null;

const REPO = z
  .string()
  .trim()
  .regex(/^[\w.-]+\/[\w.-]+$/, "Use the owner/repo form.");

export async function addRepoAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = REPO.safeParse(fd.get("repo"));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Bad repo" };
  }
  await addSource({ userId, kind: "github_repo", externalRef: parsed.data });
  revalidatePath("/knowledge");
  return { ok: true, message: `Added ${parsed.data}. Click Sync to pull it in.` };
}

export async function removeSourceAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const id = z.string().uuid().parse(fd.get("id"));
  await removeSource(userId, id);
  revalidatePath("/knowledge");
  return { ok: true, message: "Source removed." };
}

export async function syncSourceAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const id = z.string().uuid().parse(fd.get("id"));
  const r = await runSourceSync(userId, id);
  revalidatePath("/knowledge");
  if (r.error) return { ok: false, message: `Sync failed: ${r.error}` };
  return {
    ok: true,
    message: `${r.enqueued} new item(s) queued, ${r.deduped} unchanged. Run "Process queue" to extract.`,
  };
}

export async function pauseSourceAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const id = z.string().uuid().parse(fd.get("id"));
  await setSourceStatus(userId, id, "paused");
  revalidatePath("/knowledge");
  return { ok: true, message: "Source paused — the nightly sync will skip it." };
}

export async function resumeSourceAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const id = z.string().uuid().parse(fd.get("id"));
  await setSourceStatus(userId, id, "active");
  revalidatePath("/knowledge");
  return { ok: true, message: "Source resumed." };
}

export async function resyncSourceAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const id = z.string().uuid().parse(fd.get("id"));
  await resetSourceCursor(userId, id);
  const r = await runSourceSync(userId, id);
  revalidatePath("/knowledge");
  if (r.error) return { ok: false, message: `Resync failed: ${r.error}` };
  return {
    ok: true,
    message: `Resynced from scratch: ${r.enqueued} item(s) queued, ${r.deduped} already ingested.`,
  };
}

export async function loadSourceJobsAction(sourceId: string): Promise<JobListItem[]> {
  const userId = await requireUserId();
  return listJobsForSource(userId, UUID.parse(sourceId));
}

export async function uploadAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const category = z.enum(UPLOAD_CATEGORIES).parse(fd.get("category"));
  const title = z
    .string()
    .trim()
    .max(120)
    .catch("")
    .parse(fd.get("title") ?? "");

  let text = z.string().catch("").parse(fd.get("text") ?? "");
  const file = fd.get("file");
  if (file instanceof File && file.size > 0) text = await file.text();
  if (!text.trim()) {
    return { ok: false, message: "Paste some text or choose a file." };
  }

  try {
    const r = await ingestUpload({ userId, category, title, text });
    revalidatePath("/knowledge");
    return {
      ok: true,
      message: `${r.enqueued} item(s) queued, ${r.deduped} already ingested. Run "Process queue".`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Upload failed" };
  }
}

const UUID = z.string().uuid();

export async function combineSelectedAction(
  _p: ActionState,
  ids: string[],
): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = z.array(UUID).min(2).safeParse(ids);
  if (!parsed.success) {
    return { ok: false, message: "Select at least two queue items to combine." };
  }
  const r = await combineJobs(userId, parsed.data);
  revalidatePath("/knowledge");
  if (r.removed === 0) {
    return {
      ok: false,
      message: "Nothing combined — the selected items must all still be pending.",
    };
  }
  return {
    ok: true,
    message: `Combined ${r.removed + 1} items into one; removed ${r.removed}.`,
  };
}

export async function deleteQueueItemAction(
  _p: ActionState,
  id: string,
): Promise<ActionState> {
  const userId = await requireUserId();
  const ok = await deleteJob(userId, UUID.parse(id));
  revalidatePath("/knowledge");
  return ok
    ? { ok: true, message: "Queue item deleted." }
    : { ok: false, message: "Couldn't delete — the item may be processing." };
}

export async function updateQueueItemAction(
  _p: ActionState,
  patch: { id: string; title: string; text: string },
): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = z
    .object({
      id: UUID,
      title: z.string().trim().max(300),
      text: z.string().trim().min(1, "Text can't be empty.").max(200_000),
    })
    .safeParse(patch);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid edit.",
    };
  }
  const { id, title, text } = parsed.data;
  const ok = await updateJobPayload(userId, id, { title, text });
  revalidatePath("/knowledge");
  revalidatePath(`/knowledge/queue/${id}`);
  return ok
    ? { ok: true, message: "Queue item updated." }
    : { ok: false, message: "Couldn't update — the item may be processing." };
}

export async function deleteDocumentAction(
  _p: ActionState,
  id: string,
): Promise<ActionState> {
  const userId = await requireUserId();
  const ok = await deleteKnowledgeDocument(userId, UUID.parse(id));
  revalidatePath("/knowledge");
  return ok
    ? { ok: true, message: "Knowledge document deleted." }
    : { ok: false, message: "Document not found." };
}

export async function updateDocumentAction(
  _p: ActionState,
  patch: { id: string; title: string; body: string },
): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = z
    .object({
      id: UUID,
      title: z.string().trim().min(1, "Title can't be empty.").max(300),
      body: z.string().trim().min(1, "Body can't be empty.").max(50_000),
    })
    .safeParse(patch);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid edit.",
    };
  }
  const { id, title, body } = parsed.data;
  try {
    const r = await updateKnowledgeDocument(userId, id, { title, body });
    revalidatePath("/knowledge");
    revalidatePath(`/knowledge/documents/${id}`);
    if (!r.ok) return { ok: false, message: "Document not found." };
    return {
      ok: true,
      message: r.chunks
        ? `Saved — re-embedded into ${r.chunks} chunk(s).`
        : "Saved.",
    };
  } catch {
    return {
      ok: false,
      message:
        "Save failed — the edited content may be identical to another document.",
    };
  }
}

export async function loadMoreQueueAction(
  cursor: string,
): Promise<Page<JobListItem>> {
  const userId = await requireUserId();
  return listJobs(userId, {
    statuses: QUEUE_STATUSES,
    limit: PAGE_SIZE,
    cursor,
  });
}

export interface DocumentFilterParams {
  q?: string;
  skillIds?: string[];
  targetTypes?: string[];
}

export async function loadMoreDocumentsAction(
  cursor: string,
  filters?: DocumentFilterParams,
): Promise<Page<KnowledgeDocListItem>> {
  const userId = await requireUserId();
  return listKnowledgeDocuments(userId, {
    limit: PAGE_SIZE,
    cursor,
    q: filters?.q,
    skillIds: filters?.skillIds,
    targetTypes: filters?.targetTypes,
  });
}

export async function drainNowAction(): Promise<ActionState> {
  const userId = await requireUserId();
  let processed = 0;
  // Bounded — extraction is an LLM call; click again for more.
  for (let i = 0; i < 3; i++) {
    if ((await countPendingJobs(userId)) === 0) break;
    const run = await extractionAgent.run({ userId, trigger: "manual" });
    if ((run.result as { skipped?: boolean } | null)?.skipped) break;
    processed++;
  }
  const kr = await drainContextEvents(userId);
  revalidatePath("/knowledge");
  const left = await countPendingJobs(userId);
  return {
    ok: true,
    message:
      `Processed ${processed} job(s)` +
      (left ? `, ${left} still queued` : "") +
      `; refreshed ${kr.processed} internal change(s).`,
  };
}

// ── knowledge_links / knowledge_document_tags (K3: Mappings & Tags) ────────

const decideLinkSchema = z.object({
  linkId: z.string().uuid(),
  documentId: z.string().uuid(),
  decision: z.enum(["accepted", "rejected"]),
});

export async function decideLinkAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = decideLinkSchema.safeParse({
    linkId: fd.get("linkId"),
    documentId: fd.get("documentId"),
    decision: fd.get("decision"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid." };
  }
  const { linkId, documentId, decision } = parsed.data;
  await db
    .update(knowledgeLinks)
    .set({ status: decision, decidedAt: new Date() })
    .where(and(eq(knowledgeLinks.userId, userId), eq(knowledgeLinks.id, linkId)));
  revalidatePath(`/knowledge/documents/${documentId}`);
  return { ok: true, message: `Mapping ${decision}.` };
}

const removeLinkSchema = z.object({
  linkId: z.string().uuid(),
  documentId: z.string().uuid(),
});

export async function removeLinkAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = removeLinkSchema.safeParse({
    linkId: fd.get("linkId"),
    documentId: fd.get("documentId"),
  });
  if (!parsed.success) {
    return { ok: false, message: "Invalid mapping." };
  }
  await db
    .delete(knowledgeLinks)
    .where(
      and(eq(knowledgeLinks.userId, userId), eq(knowledgeLinks.id, parsed.data.linkId)),
    );
  revalidatePath(`/knowledge/documents/${parsed.data.documentId}`);
  return { ok: true, message: "Mapping removed." };
}

const addLinkSchema = z.object({
  documentId: z.string().uuid(),
  targetType: z.enum(KNOWLEDGE_TARGET_TYPES),
  targetId: z.string().uuid(),
});

export async function addManualLinkAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = addLinkSchema.safeParse({
    documentId: fd.get("documentId"),
    targetType: fd.get("targetType"),
    targetId: fd.get("targetId"),
  });
  if (!parsed.success) {
    return { ok: false, message: "Pick something to link first." };
  }
  const { documentId, targetType, targetId } = parsed.data;
  await db
    .insert(knowledgeLinks)
    .values({
      userId,
      documentId,
      targetType,
      targetId,
      relation: "relevant_to",
      score: 1,
      method: ["manual"],
      rationale: "Added manually.",
      status: "accepted",
      createdBy: "user",
      decidedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        knowledgeLinks.documentId,
        knowledgeLinks.targetType,
        knowledgeLinks.targetId,
      ],
      set: {
        status: "accepted",
        score: 1,
        method: ["manual"],
        rationale: "Added manually.",
        createdBy: "user",
        decidedAt: new Date(),
      },
    });
  revalidatePath(`/knowledge/documents/${documentId}`);
  return { ok: true, message: "Mapping added." };
}

const toggleTagSchema = z.object({
  documentId: z.string().uuid(),
  tagSlug: z.string().min(1),
  add: z.enum(["true", "false"]),
});

export async function toggleTagAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = toggleTagSchema.safeParse({
    documentId: fd.get("documentId"),
    tagSlug: fd.get("tagSlug"),
    add: fd.get("add"),
  });
  if (!parsed.success) {
    return { ok: false, message: "Invalid tag." };
  }
  const { documentId, tagSlug, add } = parsed.data;
  if (add === "true") {
    await db
      .insert(knowledgeDocumentTags)
      .values({ userId, documentId, tagSlug, confidence: 1, method: "manual" })
      .onConflictDoUpdate({
        target: [knowledgeDocumentTags.documentId, knowledgeDocumentTags.tagSlug],
        set: { confidence: 1, method: "manual" },
      });
  } else {
    await db
      .delete(knowledgeDocumentTags)
      .where(
        and(
          eq(knowledgeDocumentTags.userId, userId),
          eq(knowledgeDocumentTags.documentId, documentId),
          eq(knowledgeDocumentTags.tagSlug, tagSlug),
        ),
      );
  }
  revalidatePath(`/knowledge/documents/${documentId}`);
  return { ok: true, message: add === "true" ? "Tag added." : "Tag removed." };
}
