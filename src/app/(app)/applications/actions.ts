"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserId } from "@/lib/user";
import { loadJobSearchConfig, runJobSearch, type RunJobSearchOpts } from "@/lib/jobs/search";
import type { JobSearchResult } from "@/lib/jobs/types";
import { sendDraft } from "@/lib/outreach/gmail";
import { parseBundleDir, sectionOf } from "@/lib/outreach/parse";
import { deriveGraphSearchTerms, makeGraphMatcher } from "@/modules/jobs/graph";
import {
  deleteJobFolder,
  readFolderFile,
  regeneratePdf,
  regenerateProofBundle,
  regenerateResume,
  writeFolderFile,
} from "@/modules/applications/generate";
import {
  recordTouchpoint,
  requestApply,
  requestContentProcessing,
} from "@/modules/applications/service";

export type ActionState = { ok: boolean; message: string } | null;

const err = (message: string): ActionState => ({ ok: false, message });

const folderRef = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  folder: z.string().min(1).max(120).regex(/^[a-z0-9][a-z0-9_-]*$/i),
});

const saveSchema = folderRef.extend({
  file: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9._-]*\.(md|txt|json|html)$/i, "editable text files only"),
  content: z.string().max(200_000),
});

function revalidate(date: string, folder: string) {
  revalidatePath("/applications");
  revalidatePath(`/applications/${date}/${folder}`);
}

export async function saveFileAction(
  _prev: ActionState,
  input: { date: string; folder: string; file: string; content: string },
): Promise<ActionState> {
  await requireUserId();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0].message);
  const { date, folder, file, content } = parsed.data;

  if (file === "job.json") {
    try {
      JSON.parse(content);
    } catch {
      return err("job.json is not valid JSON.");
    }
  }
  try {
    await writeFolderFile(date, folder, file, content);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not save.");
  }
  revalidate(date, folder);
  return { ok: true, message: `Saved ${file}.` };
}

export async function regenResumeAction(
  _prev: ActionState,
  input: { date: string; folder: string },
): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = folderRef.safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0].message);
  try {
    const { pdfOk } = await regenerateResume(
      userId,
      parsed.data.date,
      parsed.data.folder,
    );
    revalidate(parsed.data.date, parsed.data.folder);
    return {
      ok: true,
      message: pdfOk
        ? "Résumé regenerated (md, html, pdf)."
        : "Résumé regenerated (md, html) — no Chrome for the PDF.",
    };
  } catch (e) {
    return err(e instanceof Error ? e.message : "Regenerate failed.");
  }
}

export async function regenProofAction(
  _prev: ActionState,
  input: { date: string; folder: string },
): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = folderRef.safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0].message);
  try {
    const { skills, features } = await regenerateProofBundle(
      userId,
      parsed.data.date,
      parsed.data.folder,
    );
    revalidate(parsed.data.date, parsed.data.folder);
    return {
      ok: true,
      message: `Proof bundle regenerated — ${skills} skills / ${features} features.`,
    };
  } catch (e) {
    return err(e instanceof Error ? e.message : "Regenerate failed.");
  }
}

export async function regenPdfAction(
  _prev: ActionState,
  input: { date: string; folder: string },
): Promise<ActionState> {
  await requireUserId();
  const parsed = folderRef.safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0].message);
  try {
    const { pdfOk } = await regeneratePdf(parsed.data.date, parsed.data.folder);
    revalidate(parsed.data.date, parsed.data.folder);
    return pdfOk
      ? { ok: true, message: "resume.pdf re-printed from resume.html." }
      : err("No Chrome/Chromium found to print the PDF.");
  } catch (e) {
    return err(e instanceof Error ? e.message : "Print failed.");
  }
}

// ── J1/J4: queue intent for a Claude Code session to pick up ───────────────

const idList = z.array(z.uuid()).min(1).max(200);

export async function processContentAction(ids: string[]): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = idList.safeParse(ids);
  if (!parsed.success) return err("Pick at least one job.");
  const n = await requestContentProcessing(userId, parsed.data);
  revalidatePath("/applications");
  return {
    ok: true,
    message: `Queued ${n} job(s) for content processing — tell a Claude Code session to "process the queue".`,
  };
}

export async function applyAction(ids: string[]): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = idList.safeParse(ids);
  if (!parsed.success) return err("Pick at least one job.");
  const n = await requestApply(userId, parsed.data);
  revalidatePath("/applications");
  return {
    ok: true,
    message: `Queued ${n} job(s) to apply — a session runs apply-fill/apply-drive, you still click Submit.`,
  };
}

// ── J3: deterministic fetch + score, run in-request (no agent judgment) ────

export type SearchJobsState =
  | { ok: true; result: JobSearchResult }
  | { ok: false; message: string };

export async function searchJobsAction(): Promise<SearchJobsState> {
  const userId = await requireUserId();
  try {
    const cfg = await loadJobSearchConfig();
    const graphOn = cfg.useGraphMatch !== false;
    let extraTerms: string[] = [];
    let graphMatch: RunJobSearchOpts["graphMatch"];
    if (graphOn) {
      try {
        extraTerms = await deriveGraphSearchTerms(userId);
        graphMatch = makeGraphMatcher(userId);
      } catch {
        // graph layer unavailable — fall back to the manual layer only
      }
    }
    const result = await runJobSearch(cfg, { extraTerms, graphMatch });
    return { ok: true, result };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Search failed." };
  }
}

// ── J6: outreach & follow-ups, one place per job ────────────────────────────

const touchpointKind = z.enum([
  "submitted",
  "recruiter_pitch",
  "referral_pitch",
  "follow_up_1",
  "follow_up_2",
  "interview",
  "note",
]);
const touchpointChannel = z.enum([
  "portal",
  "email",
  "linkedin",
  "whatsapp",
  "twitter",
  "instagram",
  "facebook",
  "discord",
  "slack",
  "telegram",
  "other",
]);

export async function sendDraftAction(input: {
  applicationId: string;
  draftId: string;
  kind: string;
}): Promise<ActionState> {
  const userId = await requireUserId();
  const kind = touchpointKind.safeParse(input.kind);
  if (!kind.success) return err("Pick what this draft is (pitch / follow-up).");
  try {
    await sendDraft(input.draftId);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Gmail send failed.");
  }
  await recordTouchpoint(userId, {
    applicationId: input.applicationId,
    kind: kind.data,
    channel: "email",
  });
  revalidatePath("/applications");
  return { ok: true, message: "Sent — logged as a touchpoint." };
}

export async function logTouchpointAction(input: {
  applicationId: string;
  kind: string;
  channel: string;
  note?: string;
}): Promise<ActionState> {
  const userId = await requireUserId();
  const kind = touchpointKind.safeParse(input.kind);
  const channel = touchpointChannel.safeParse(input.channel);
  if (!kind.success || !channel.success) return err("Pick a kind and channel.");
  await recordTouchpoint(userId, {
    applicationId: input.applicationId,
    kind: kind.data,
    channel: channel.data,
    note: input.note?.trim() || undefined,
  });
  revalidatePath("/applications");
  return { ok: true, message: "Logged." };
}

export interface OutreachContent {
  recruiter: { note: string; message: string };
  referral: { note: string; message: string };
}

/** Lazy-loaded per card — reads the two pitch files out of R2/local for one
 *  job's bundleDir (`applications/<date>/<folder>`). */
export async function loadOutreachContentAction(
  bundleDir: string | null,
): Promise<OutreachContent | null> {
  await requireUserId();
  const ref = parseBundleDir(bundleDir);
  if (!ref) return null;
  const [pitchR, pitchF] = await Promise.all([
    readFolderFile(ref.date, ref.folder, "pitch-recruiter.md"),
    readFolderFile(ref.date, ref.folder, "pitch-referral.md"),
  ]);
  const pick = (md: string | null) => ({
    note: sectionOf(md ?? "", "LinkedIn connection note") || "(not written yet)",
    message: sectionOf(md ?? "", "Message") || "(not written yet)",
  });
  return { recruiter: pick(pitchR), referral: pick(pitchF) };
}

export async function deleteFolderAction(
  _prev: ActionState,
  input: { date: string; folder: string },
): Promise<ActionState> {
  await requireUserId();
  const parsed = folderRef.safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0].message);
  try {
    const { removed } = await deleteJobFolder(
      parsed.data.date,
      parsed.data.folder,
    );
    revalidatePath("/applications");
    return { ok: true, message: `Deleted ${parsed.data.folder} (${removed} files).` };
  } catch (e) {
    return err(e instanceof Error ? e.message : "Delete failed.");
  }
}
