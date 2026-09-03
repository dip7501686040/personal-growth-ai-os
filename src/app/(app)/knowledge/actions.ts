"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserId } from "@/lib/user";
import { extractionAgent } from "@/modules/agents/extraction-agent";
import { countPendingJobs } from "@/modules/ingestion/queue";
import { drainContextEvents } from "@/modules/ingestion/refresh";
import {
  addSource,
  ingestUpload,
  removeSource,
  runSourceSync,
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
