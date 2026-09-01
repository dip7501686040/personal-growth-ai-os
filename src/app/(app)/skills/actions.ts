"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserId } from "@/lib/user";
import {
  EVIDENCE_STRENGTHS,
  SKILL_CATEGORIES,
  SKILL_LEVELS,
} from "@/modules/skills/levels";
import {
  addEvidence,
  createSkill,
  requestLevelChange,
  setEvidenceStatus,
} from "@/modules/skills/service";

export type ActionState = { ok: boolean; message: string } | null;

const err = (message: string): ActionState => ({ ok: false, message });

// ── Create skill ────────────────────────────────────────────────────────────

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(80),
  category: z.enum(SKILL_CATEGORIES),
  notes: z.string().trim().max(500).optional(),
});

export async function createSkillAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    category: formData.get("category"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return err(parsed.error.issues[0].message);

  try {
    await createSkill(userId, parsed.data);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not add skill.");
  }
  revalidatePath("/skills");
  return { ok: true, message: `Added "${parsed.data.name}".` };
}

// ── Change level ────────────────────────────────────────────────────────────

const changeLevelSchema = z.object({
  skillId: z.uuid(),
  slug: z.string().min(1),
  targetLevel: z.enum(SKILL_LEVELS),
  justification: z.string().trim().max(1000).optional().default(""),
});

export async function changeLevelAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = changeLevelSchema.safeParse({
    skillId: formData.get("skillId"),
    slug: formData.get("slug"),
    targetLevel: formData.get("targetLevel"),
    justification: formData.get("justification") ?? "",
  });
  if (!parsed.success) return err(parsed.error.issues[0].message);

  try {
    const result = await requestLevelChange(
      userId,
      parsed.data.skillId,
      parsed.data.targetLevel,
      parsed.data.justification,
    );
    revalidatePath(`/skills/${parsed.data.slug}`);
    revalidatePath("/skills");
    revalidatePath("/approvals");
    return result.applied
      ? { ok: true, message: "Level updated." }
      : {
          ok: true,
          message:
            "That jump needs review — sent to the Approval Inbox. Level unchanged for now.",
        };
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not change level.");
  }
}

// ── Add evidence ────────────────────────────────────────────────────────────

const addEvidenceSchema = z.object({
  skillId: z.uuid(),
  slug: z.string().min(1),
  summary: z.string().trim().min(1, "Summary is required.").max(300),
  detail: z.string().trim().max(2000).optional(),
  supportsLevel: z.enum(SKILL_LEVELS),
  strength: z.enum(EVIDENCE_STRENGTHS),
});

export async function addEvidenceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = addEvidenceSchema.safeParse({
    skillId: formData.get("skillId"),
    slug: formData.get("slug"),
    summary: formData.get("summary"),
    detail: formData.get("detail") || undefined,
    supportsLevel: formData.get("supportsLevel"),
    strength: formData.get("strength"),
  });
  if (!parsed.success) return err(parsed.error.issues[0].message);

  try {
    await addEvidence(userId, parsed.data.skillId, {
      summary: parsed.data.summary,
      detail: parsed.data.detail,
      sourceType: "manual",
      supportsLevel: parsed.data.supportsLevel,
      strength: parsed.data.strength,
      status: "accepted",
      createdBy: "user",
    });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not add evidence.");
  }
  revalidatePath(`/skills/${parsed.data.slug}`);
  revalidatePath("/skills");
  return { ok: true, message: "Evidence added." };
}

// ── Accept / reject a suggested evidence row ────────────────────────────────

const evidenceDecisionSchema = z.object({
  evidenceId: z.uuid(),
  slug: z.string().min(1),
  decision: z.enum(["accepted", "rejected"]),
});

export async function decideEvidenceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = evidenceDecisionSchema.safeParse({
    evidenceId: formData.get("evidenceId"),
    slug: formData.get("slug"),
    decision: formData.get("decision"),
  });
  if (!parsed.success) return err(parsed.error.issues[0].message);

  try {
    await setEvidenceStatus(userId, parsed.data.evidenceId, parsed.data.decision);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not update evidence.");
  }
  revalidatePath(`/skills/${parsed.data.slug}`);
  revalidatePath("/skills");
  return { ok: true, message: `Evidence ${parsed.data.decision}.` };
}
