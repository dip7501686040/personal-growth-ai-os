"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isDemoUserId } from "@/lib/demo";
import { requireUserId } from "@/lib/user";
import { loadJobSearchConfig, runJobSearch, type RunJobSearchOpts } from "@/lib/jobs/search";
import {
  clearLatestSearchRun,
  loadLatestSearchRun,
  saveLatestSearchRun,
} from "@/lib/jobs/persisted-run";
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
  scaffoldJobFolder,
  writeFolderFile,
} from "@/modules/applications/generate";
import {
  deleteApplication,
  recordApplication,
  recordTouchpoint,
  requestApply,
  requestContentProcessing,
} from "@/modules/applications/service";

// searchJobsAction runs all 9 job sources (each internally parallel, but
// Adzuna/SerpApi's concurrent sub-requests still take up to ~12s each) plus
// knowledge-graph matching for ~50 jobs — measured at ~140s end-to-end on
// 2026-09-17 after fixing the sources to stop losing all their results on a
// single slow request. A Server Action's timeout is governed by this file's
// own `maxDuration`, not the page's — without it the "Search jobs" button
// was hitting a much shorter default and rendering blank. Vercel clamps to
// whatever the plan actually allows, so setting this generously is safe.
export const maxDuration = 300;

export type ActionState = { ok: boolean; message: string } | null;

const err = (message: string): ActionState => ({ ok: false, message });

/** The `applications/` tree (résumés, proof bundles, job.json) lives in one
 *  shared R2/local filesystem prefix with no per-user partitioning — unlike
 *  every other table in this app, it predates there being a second real
 *  account. The demo account can *view* its own reserved "demo-"-prefixed
 *  sample folders (gated in the applications page / detail page / file
 *  route by isDemoFolder), but every write action below stays blocked
 *  regardless of which folder it targets: a write here could corrupt the
 *  real owner's actual résumé/proof-bundle files, and demo folders are
 *  static, reseeded content the demo account was never meant to edit. */
const NOT_IN_DEMO = "Not available in the demo — this touches shared file storage, not demo-only data.";
async function blockedForDemo(userId: string): Promise<boolean> {
  return isDemoUserId(userId);
}

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
  const userId = await requireUserId();
  if (await blockedForDemo(userId)) return err(NOT_IN_DEMO);
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
  if (await blockedForDemo(userId)) return err(NOT_IN_DEMO);
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
  if (await blockedForDemo(userId)) return err(NOT_IN_DEMO);
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
  const userId = await requireUserId();
  if (await blockedForDemo(userId)) return err(NOT_IN_DEMO);
  const parsed = folderRef.safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0].message);
  try {
    const { pdfOk } = await regeneratePdf(parsed.data.date, parsed.data.folder);
    revalidate(parsed.data.date, parsed.data.folder);
    return pdfOk
      ? { ok: true, message: "Résumé PDF re-printed from resume.html." }
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
  if (await blockedForDemo(userId)) {
    return { ok: false, message: "Not available in the demo — this uses real, rate-limited API quota." };
  }
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
    await saveLatestSearchRun(result, cfg);
    return { ok: true, result };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Search failed." };
  }
}

/** Scaffold + record one or more jobs picked from the last persisted search
 *  run (`pnpm jobs` / the "Search jobs" button both save here) — the web
 *  equivalent of `pnpm apply-prep --pick ...` followed by `pnpm apply
 *  record`. Re-loads the run server-side rather than trusting whatever the
 *  client last rendered, so indices always resolve against the same
 *  groupA-then-groupB array the page/CLI both use. */
export async function prepSearchJobsAction(indices: number[]): Promise<ActionState> {
  const userId = await requireUserId();
  if (await blockedForDemo(userId)) return err(NOT_IN_DEMO);
  if (indices.length === 0) return err("Nothing selected.");

  const run = await loadLatestSearchRun();
  if (!run) {
    return err("No saved search run — click \"Search jobs\" first (or run `pnpm jobs`).");
  }
  const all = [...run.result.groupA, ...run.result.groupB];
  const date = new Date().toISOString().slice(0, 10);

  let prepped = 0;
  const skipped: string[] = [];
  for (const i of indices) {
    const job = all[i];
    if (!job) {
      skipped.push(`index ${i} out of range`);
      continue;
    }
    const out = await scaffoldJobFolder({ userId, job, cfg: run.cfg, result: run.result, date });
    await recordApplication(userId, {
      company: job.company,
      role: job.role,
      jdText: `${job.role} at ${job.company}\n${job.descriptionSnippet ?? ""}`.trim(),
      jdUrl: job.url,
      source: job.source,
      contactName: job.contactName ?? undefined,
      contactChannel: job.contactEmail ? "email" : undefined,
      // the "remote_kind" DB enum has no "unknown" (unlike ScoredJob's
      // RemoteKind, which legitimately returns it) — forwarding it crashes
      // the insert, so leave the column null instead. Same guard as
      // scripts/apply.ts's `record` command.
      remoteKind: (["remote", "onsite_foreign", "onsite_india"] as const).includes(
        job.remoteKind as never,
      )
        ? (job.remoteKind as "remote" | "onsite_foreign" | "onsite_india")
        : undefined,
      salaryLpa: job.salaryLpa ?? undefined,
      companyType: job.companyType,
      fundingNote: job.funding?.note ?? undefined,
      replyLikelihood: job.replyLikelihood,
      skillMatch: job.skillMatch,
      flags: job.flags,
      bundleDir: `applications/${out.date}/${out.folder}`,
    });
    prepped += 1;
  }

  revalidatePath("/applications");
  if (prepped === 0) return err(`Nothing prepped (${skipped.join(", ")}).`);
  return {
    ok: true,
    message:
      `Prepped ${prepped} job(s) — now in "Select → content → apply" below.` +
      (skipped.length ? ` (${skipped.join(", ")})` : ""),
  };
}

/** "Done for today" — drops the saved search run so the panel goes back to
 *  empty until the next `pnpm jobs` / "Search jobs" run. Anything already
 *  prepped is untouched: those picks live in job_applications, not here. */
export async function clearSearchRunAction(): Promise<ActionState> {
  const userId = await requireUserId();
  if (await blockedForDemo(userId)) return err(NOT_IN_DEMO);
  await clearLatestSearchRun();
  revalidatePath("/applications");
  return { ok: true, message: "Cleared — see you tomorrow." };
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
  const userId = await requireUserId();
  if (await blockedForDemo(userId)) return null;
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

/** Drop a job you've decided not to pursue (e.g. a stack mismatch found while
 *  reviewing it) — removes the ledger row and its R2/local folder together,
 *  straight from the /applications ledger, no need to open the folder first. */
export async function deleteApplicationAction(id: string): Promise<ActionState> {
  const userId = await requireUserId();
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return err("Invalid application id.");
  try {
    const row = await deleteApplication(userId, parsedId.data);
    if (!row) return err("Not found.");
    // Demo rows never carry a real bundleDir, but skip the shared-storage
    // delete outright for the demo account regardless — see blockedForDemo.
    const ref = (await blockedForDemo(userId)) ? null : parseBundleDir(row.bundleDir);
    if (ref) await deleteJobFolder(ref.date, ref.folder);
    revalidatePath("/applications");
    return { ok: true, message: "Deleted." };
  } catch (e) {
    return err(e instanceof Error ? e.message : "Delete failed.");
  }
}

export async function deleteFolderAction(
  _prev: ActionState,
  input: { date: string; folder: string },
): Promise<ActionState> {
  const userId = await requireUserId();
  if (await blockedForDemo(userId)) return err(NOT_IN_DEMO);
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
