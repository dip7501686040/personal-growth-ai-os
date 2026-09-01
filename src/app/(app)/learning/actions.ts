"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserId } from "@/lib/user";
import {
  createDsaProblem,
  createLearningSession,
  recordAttempt,
} from "@/modules/learning/service";

export type ActionState = { ok: boolean; message: string } | null;
const err = (message: string): ActionState => ({ ok: false, message });

const int = z.coerce.number().int().nonnegative().optional();
const conf = z.coerce.number().int().min(0).max(100).optional();

// ── Learning session ───────────────────────────────────────────────────────

const sessionSchema = z.object({
  topic: z.string().trim().min(1, "Topic is required.").max(120),
  category: z.enum(["technology", "system_design", "dsa", "revision"]),
  description: z.string().trim().max(2000).optional(),
  resourceUrl: z.union([z.url(), z.literal("")]).optional(),
  durationMinutes: int,
  confidenceBefore: conf,
  confidenceAfter: conf,
  notes: z.string().trim().max(2000).optional(),
});

export async function logSessionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = sessionSchema.safeParse({
    topic: formData.get("topic"),
    category: formData.get("category"),
    description: formData.get("description") || undefined,
    resourceUrl: formData.get("resourceUrl") || undefined,
    durationMinutes: formData.get("durationMinutes") || undefined,
    confidenceBefore: formData.get("confidenceBefore") || undefined,
    confidenceAfter: formData.get("confidenceAfter") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return err(parsed.error.issues[0].message);

  const skillIds = formData
    .getAll("skillIds")
    .map(String)
    .filter((s) => /^[0-9a-f-]{36}$/i.test(s));

  try {
    await createLearningSession(
      userId,
      {
        ...parsed.data,
        resourceUrl: parsed.data.resourceUrl || undefined,
      },
      skillIds,
    );
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not save session.");
  }
  revalidatePath("/learning");
  revalidatePath("/skills");
  return { ok: true, message: "Learning session logged." };
}

// ── DSA problem ────────────────────────────────────────────────────────────

const problemSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(200),
  sourceUrl: z.union([z.url(), z.literal("")]).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  topic: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function addProblemAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = problemSchema.safeParse({
    title: formData.get("title"),
    sourceUrl: formData.get("sourceUrl") || undefined,
    difficulty: formData.get("difficulty"),
    topic: formData.get("topic") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return err(parsed.error.issues[0].message);

  const patternIds = formData
    .getAll("patternIds")
    .map(String)
    .filter((s) => /^[0-9a-f-]{36}$/i.test(s));
  if (patternIds.length === 0) return err("Pick at least one pattern.");

  try {
    await createDsaProblem(
      userId,
      { ...parsed.data, sourceUrl: parsed.data.sourceUrl || undefined },
      patternIds,
    );
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not add problem.");
  }
  revalidatePath("/learning/dsa");
  return { ok: true, message: "Problem added." };
}

// ── DSA attempt ────────────────────────────────────────────────────────────

const attemptSchema = z.object({
  problemId: z.uuid("Pick a problem."),
  solved: z.coerce.boolean().optional().default(false),
  timeTakenMinutes: int,
  hintsUsed: int,
  confidenceBefore: conf,
  confidenceAfter: conf,
  failureReason: z.enum([
    "none",
    "could_not_identify_pattern",
    "knew_pattern_impl_bug",
    "tle",
    "other",
  ]),
  notes: z.string().trim().max(2000).optional(),
});

export async function logAttemptAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = attemptSchema.safeParse({
    problemId: formData.get("problemId"),
    solved: formData.get("solved") === "on" || formData.get("solved") === "true",
    timeTakenMinutes: formData.get("timeTakenMinutes") || undefined,
    hintsUsed: formData.get("hintsUsed") || undefined,
    confidenceBefore: formData.get("confidenceBefore") || undefined,
    confidenceAfter: formData.get("confidenceAfter") || undefined,
    failureReason: formData.get("failureReason") || "none",
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return err(parsed.error.issues[0].message);

  try {
    await recordAttempt(userId, parsed.data);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not log attempt.");
  }
  revalidatePath("/learning/dsa");
  revalidatePath("/learning");
  revalidatePath("/skills");
  return { ok: true, message: "Attempt logged." };
}
