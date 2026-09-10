"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserId } from "@/lib/user";
import {
  deleteJobFolder,
  regeneratePdf,
  regenerateProofBundle,
  regenerateResume,
  writeFolderFile,
} from "@/modules/applications/generate";

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
