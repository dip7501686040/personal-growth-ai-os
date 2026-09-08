"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserId } from "@/lib/user";
import {
  EVIDENCE_STRENGTHS,
  SKILL_CATEGORIES,
  SKILL_LEVELS,
} from "@/modules/skills/levels";
import { bestEffortResync } from "@/modules/knowledge/resync";
import {
  acceptAllSuggestedEvidence,
  addEvidence,
  createChildSkill,
  createSkill,
  getMergePreview,
  mergeSkills,
  requestLevelChange,
  setEvidenceStatus,
  setSkillExcluded,
  setSkillParent,
  updateSkillCategory,
  updateSkillLabel,
  type MergePreview,
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
  await bestEffortResync(userId);
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
    await bestEffortResync(userId);
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
  await bestEffortResync(userId);
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
  await bestEffortResync(userId);
  revalidatePath("/skills");
  return { ok: true, message: `Evidence ${parsed.data.decision}.` };
}

// ── Accept every suggested evidence row (post repo-sync review) ─────────────

export async function acceptAllEvidenceAction(): Promise<ActionState> {
  const userId = await requireUserId();
  try {
    const n = await acceptAllSuggestedEvidence(userId);
    await bestEffortResync(userId);
    revalidatePath("/skills");
    return n > 0
      ? { ok: true, message: `Accepted ${n} evidence row${n === 1 ? "" : "s"}; levels recomputed.` }
      : { ok: true, message: "Nothing to accept." };
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not accept evidence.");
  }
}

// ── Skip / un-skip a skill ────────────────────────────────────────────────

const skillExcludedSchema = z.object({
  skillId: z.uuid(),
  excluded: z.boolean(),
});

export async function setSkillExcludedAction(
  input: z.infer<typeof skillExcludedSchema>,
): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = skillExcludedSchema.safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0].message);
  try {
    await setSkillExcluded(userId, parsed.data.skillId, parsed.data.excluded);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not update skill.");
  }
  await bestEffortResync(userId);
  revalidatePath("/skills");
  return {
    ok: true,
    message: parsed.data.excluded ? "Skill skipped." : "Skill back in use.",
  };
}

// ── Label / parent / child / merge (Phase 4) ─────────────────────────────

const labelSchema = z.object({
  skillId: z.uuid(),
  label: z.string().trim().max(80).nullable(),
});

export async function updateSkillLabelAction(
  input: z.infer<typeof labelSchema>,
): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = labelSchema.safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0].message);
  try {
    await updateSkillLabel(userId, parsed.data.skillId, parsed.data.label || null);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not rename.");
  }
  await bestEffortResync(userId);
  revalidatePath("/skills");
  return { ok: true, message: "Label updated." };
}

const parentSchema = z.object({
  skillId: z.uuid(),
  parentId: z.uuid().nullable(),
});

export async function setSkillParentAction(
  input: z.infer<typeof parentSchema>,
): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = parentSchema.safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0].message);
  try {
    await setSkillParent(userId, parsed.data.skillId, parsed.data.parentId);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not group skill.");
  }
  await bestEffortResync(userId);
  revalidatePath("/skills");
  return {
    ok: true,
    message: parsed.data.parentId ? "Nested under parent." : "Moved to top level.",
  };
}

const categorySchema = z.object({
  skillId: z.uuid(),
  category: z.enum(SKILL_CATEGORIES),
  slug: z.string().optional(),
});

export async function setSkillCategoryAction(
  input: z.infer<typeof categorySchema>,
): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0].message);
  try {
    await updateSkillCategory(userId, parsed.data.skillId, parsed.data.category);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not move skill.");
  }
  await bestEffortResync(userId);
  revalidatePath("/skills");
  if (parsed.data.slug) revalidatePath(`/skills/${parsed.data.slug}`);
  return { ok: true, message: "Category updated." };
}

const childSchema = z.object({
  parentId: z.uuid(),
  name: z.string().trim().min(1, "Name is required.").max(80),
  label: z.string().trim().max(80).optional(),
  category: z.enum(SKILL_CATEGORIES),
});

export async function createChildSkillAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = childSchema.safeParse({
    parentId: formData.get("parentId"),
    name: formData.get("name"),
    label: formData.get("label") || undefined,
    category: formData.get("category"),
  });
  if (!parsed.success) return err(parsed.error.issues[0].message);
  try {
    await createChildSkill(userId, parsed.data.parentId, {
      name: parsed.data.name,
      label: parsed.data.label,
      category: parsed.data.category,
    });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not add child skill.");
  }
  await bestEffortResync(userId);
  revalidatePath("/skills");
  return { ok: true, message: `Added "${parsed.data.label || parsed.data.name}".` };
}

const mergeSchema = z.object({
  targetId: z.uuid(),
  sourceIds: z.array(z.uuid()).min(1),
});

export async function mergePreviewAction(
  input: z.infer<typeof mergeSchema>,
): Promise<{ ok: true; preview: MergePreview } | { ok: false; message: string }> {
  const userId = await requireUserId();
  const parsed = mergeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  try {
    const preview = await getMergePreview(
      userId,
      parsed.data.targetId,
      parsed.data.sourceIds,
    );
    return { ok: true, preview };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not preview merge." };
  }
}

export async function mergeSkillsAction(
  input: z.infer<typeof mergeSchema>,
): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = mergeSchema.safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0].message);
  try {
    const { merged } = await mergeSkills(
      userId,
      parsed.data.targetId,
      parsed.data.sourceIds,
    );
    await bestEffortResync(userId);
    revalidatePath("/skills");
    return { ok: true, message: `Merged ${merged} skill${merged === 1 ? "" : "s"} in.` };
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not merge skills.");
  }
}
