"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUserId } from "@/lib/user";
import { slugify } from "@/lib/slug";
import {
  addFeature,
  createProject,
  createProjectFromIdea,
  deleteProject,
  linkSkill,
  setFeatureStatus,
  unlinkSkill,
  updateProject,
  type ProjectIdea,
} from "@/modules/projects/service";

export type ActionState = { ok: boolean; message: string } | null;
const err = (message: string): ActionState => ({ ok: false, message });

const PROJECT_STATUS = ["idea", "planning", "building", "paused", "completed"] as const;
const FEATURE_STATUS = ["planned", "in_progress", "done"] as const;
const SKILL_ROLE = ["planned", "used", "demonstrated"] as const;

// ── Project ────────────────────────────────────────────────────────────────

const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  description: z.string().trim().max(2000).optional(),
  problemSolved: z.string().trim().max(2000).optional(),
  status: z.enum(PROJECT_STATUS).default("idea"),
});

export async function createProjectAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = createProjectSchema.safeParse({
    name: fd.get("name"),
    description: fd.get("description") || undefined,
    problemSolved: fd.get("problemSolved") || undefined,
    status: fd.get("status") || "idea",
  });
  if (!parsed.success) return err(parsed.error.issues[0].message);
  try {
    await createProject(userId, parsed.data);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not create project.");
  }
  revalidatePath("/projects");
  return { ok: true, message: `Created "${parsed.data.name}".` };
}

const updateProjectSchema = z.object({
  projectId: z.uuid(),
  slug: z.string().min(1),
  description: z.string().trim().max(4000).optional(),
  problemSolved: z.string().trim().max(4000).optional(),
  architecture: z.string().trim().max(4000).optional(),
  status: z.enum(PROJECT_STATUS).optional(),
});

export async function updateProjectAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = updateProjectSchema.safeParse({
    projectId: fd.get("projectId"),
    slug: fd.get("slug"),
    description: fd.get("description") ?? undefined,
    problemSolved: fd.get("problemSolved") ?? undefined,
    architecture: fd.get("architecture") ?? undefined,
    status: fd.get("status") || undefined,
  });
  if (!parsed.success) return err(parsed.error.issues[0].message);
  const { projectId, slug, ...patch } = parsed.data;
  try {
    await updateProject(userId, projectId, patch);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not update project.");
  }
  revalidatePath(`/projects/${slug}`);
  revalidatePath("/projects");
  return { ok: true, message: "Saved." };
}

export async function deleteProjectAction(fd: FormData): Promise<void> {
  const userId = await requireUserId();
  const projectId = z.uuid().parse(fd.get("projectId"));
  await deleteProject(userId, projectId);
  revalidatePath("/projects");
  revalidatePath("/skills");
  redirect("/projects");
}

// ── Feature ────────────────────────────────────────────────────────────────

const addFeatureSchema = z.object({
  projectId: z.uuid(),
  slug: z.string().min(1),
  title: z.string().trim().min(1, "Title is required.").max(200),
  description: z.string().trim().max(2000).optional(),
  status: z.enum(FEATURE_STATUS).default("planned"),
});

export async function addFeatureAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = addFeatureSchema.safeParse({
    projectId: fd.get("projectId"),
    slug: fd.get("slug"),
    title: fd.get("title"),
    description: fd.get("description") || undefined,
    status: fd.get("status") || "planned",
  });
  if (!parsed.success) return err(parsed.error.issues[0].message);
  try {
    await addFeature(userId, parsed.data.projectId, {
      title: parsed.data.title,
      description: parsed.data.description,
      status: parsed.data.status,
    });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not add feature.");
  }
  revalidatePath(`/projects/${parsed.data.slug}`);
  revalidatePath("/skills");
  return { ok: true, message: "Feature added." };
}

const featureStatusSchema = z.object({
  featureId: z.uuid(),
  slug: z.string().min(1),
  status: z.enum(FEATURE_STATUS),
});

export async function setFeatureStatusAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = featureStatusSchema.safeParse({
    featureId: fd.get("featureId"),
    slug: fd.get("slug"),
    status: fd.get("status"),
  });
  if (!parsed.success) return err(parsed.error.issues[0].message);
  try {
    await setFeatureStatus(userId, parsed.data.featureId, parsed.data.status);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not update feature.");
  }
  revalidatePath(`/projects/${parsed.data.slug}`);
  revalidatePath("/skills");
  return {
    ok: true,
    message:
      parsed.data.status === "done"
        ? "Feature done — linked skills got project evidence."
        : "Feature updated.",
  };
}

// ── Skill links ────────────────────────────────────────────────────────────

const linkSchema = z.object({
  projectId: z.uuid(),
  slug: z.string().min(1),
  featureId: z.union([z.uuid(), z.literal("")]).optional(),
  skillId: z.uuid("Pick a skill."),
  role: z.enum(SKILL_ROLE),
});

export async function linkSkillAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = linkSchema.safeParse({
    projectId: fd.get("projectId"),
    slug: fd.get("slug"),
    featureId: fd.get("featureId") || undefined,
    skillId: fd.get("skillId"),
    role: fd.get("role"),
  });
  if (!parsed.success) return err(parsed.error.issues[0].message);
  try {
    await linkSkill(userId, {
      projectId: parsed.data.projectId,
      featureId: parsed.data.featureId || null,
      skillId: parsed.data.skillId,
      role: parsed.data.role,
    });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not link skill.");
  }
  revalidatePath(`/projects/${parsed.data.slug}`);
  revalidatePath("/skills");
  return { ok: true, message: "Skill linked." };
}

export async function unlinkSkillAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const linkId = z.uuid().safeParse(fd.get("linkId"));
  const slug = String(fd.get("slug") ?? "");
  if (!linkId.success) return err("Bad link id.");
  try {
    await unlinkSkill(userId, linkId.data);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not unlink skill.");
  }
  revalidatePath(`/projects/${slug}`);
  revalidatePath("/skills");
  return { ok: true, message: "Unlinked." };
}

// ── Create from agent idea ─────────────────────────────────────────────────

export async function createFromIdeaAction(fd: FormData): Promise<void> {
  const userId = await requireUserId();
  const idea = JSON.parse(String(fd.get("idea"))) as ProjectIdea;
  const project = await createProjectFromIdea(userId, idea);
  revalidatePath("/projects");
  revalidatePath("/skills");
  redirect(`/projects/${slugify(project.name)}`);
}
