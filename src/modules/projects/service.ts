import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  projectFeatures,
  projectSkills,
  projects,
  skillEvidence,
  skills,
  type Project,
  type ProjectFeature,
} from "@/lib/db/schema";
import { slugify } from "@/lib/slug";
import { recordContextEvent } from "@/modules/context/events";
import { recomputeSkill, upsertSkillByName } from "@/modules/skills/service";
import type { SkillCategory } from "@/modules/skills/levels";

type FeatureStatus = "planned" | "in_progress" | "done";
type SkillRole = "planned" | "used" | "demonstrated";
type ProjectStatus = "idea" | "planning" | "building" | "paused" | "completed";

// ── Reads ──────────────────────────────────────────────────────────────────

export type ProjectListItem = Project & {
  featuresTotal: number;
  featuresDone: number;
  skillsCount: number;
};

export async function listProjects(userId: string): Promise<ProjectListItem[]> {
  const rows = await db
    .select({
      project: projects,
      featuresTotal: sql<number>`count(distinct ${projectFeatures.id})::int`,
      featuresDone: sql<number>`count(distinct ${projectFeatures.id}) filter (where ${projectFeatures.status} = 'done')::int`,
      skillsCount: sql<number>`count(distinct ${projectSkills.skillId})::int`,
    })
    .from(projects)
    .leftJoin(projectFeatures, eq(projectFeatures.projectId, projects.id))
    .leftJoin(projectSkills, eq(projectSkills.projectId, projects.id))
    .where(eq(projects.userId, userId))
    .groupBy(projects.id)
    .orderBy(desc(projects.updatedAt));

  return rows.map((r) => ({
    ...r.project,
    featuresTotal: r.featuresTotal,
    featuresDone: r.featuresDone,
    skillsCount: r.skillsCount,
  }));
}

export type FeatureWithSkills = ProjectFeature & {
  skills: { linkId: string; skillId: string; name: string; role: SkillRole }[];
};

export async function getProject(
  userId: string,
  slug: string,
): Promise<{
  project: Project;
  features: FeatureWithSkills[];
  projectSkills: { linkId: string; skillId: string; name: string; role: SkillRole }[];
} | null> {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.userId, userId), eq(projects.slug, slug)))
    .limit(1);
  if (!project) return null;

  const features = await db
    .select()
    .from(projectFeatures)
    .where(eq(projectFeatures.projectId, project.id))
    .orderBy(projectFeatures.createdAt);

  const links = await db
    .select({
      linkId: projectSkills.id,
      featureId: projectSkills.featureId,
      skillId: projectSkills.skillId,
      name: skills.name,
      role: projectSkills.role,
    })
    .from(projectSkills)
    .innerJoin(skills, eq(skills.id, projectSkills.skillId))
    .where(eq(projectSkills.projectId, project.id));

  return {
    project,
    features: features.map((f) => ({
      ...f,
      skills: links
        .filter((l) => l.featureId === f.id)
        .map((l) => ({ linkId: l.linkId, skillId: l.skillId, name: l.name, role: l.role })),
    })),
    projectSkills: links
      .filter((l) => l.featureId === null)
      .map((l) => ({ linkId: l.linkId, skillId: l.skillId, name: l.name, role: l.role })),
  };
}

// ── Writes ─────────────────────────────────────────────────────────────────

export async function createProject(
  userId: string,
  input: {
    name: string;
    description?: string;
    problemSolved?: string;
    architecture?: string;
    status?: ProjectStatus;
  },
): Promise<Project> {
  const slug = slugify(input.name);
  const [dupe] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.userId, userId), eq(projects.slug, slug)))
    .limit(1);
  if (dupe) throw new Error(`A project "${input.name}" already exists.`);

  const [row] = await db
    .insert(projects)
    .values({
      userId,
      name: input.name.trim(),
      slug,
      description: input.description?.trim() || null,
      problemSolved: input.problemSolved?.trim() || null,
      architecture: input.architecture?.trim() || null,
      status: input.status ?? "idea",
    })
    .returning();
  await recordContextEvent({
    userId,
    kind: "project_updated",
    refId: row.id,
  });
  return row;
}

/**
 * Get the project with this name (by slug), or create it as an `idea`.
 * Used by the Extraction Agent — fills a blank description when it learns one,
 * but never overwrites what the user has written.
 */
export async function upsertProjectByName(
  userId: string,
  name: string,
  description?: string,
): Promise<Project> {
  const slug = slugify(name);
  const [existing] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.userId, userId), eq(projects.slug, slug)))
    .limit(1);

  if (existing) {
    if (!existing.description && description?.trim()) {
      const [updated] = await db
        .update(projects)
        .set({ description: description.trim(), updatedAt: new Date() })
        .where(eq(projects.id, existing.id))
        .returning();
      await recordContextEvent({ userId, kind: "project_updated", refId: updated.id });
      return updated;
    }
    return existing;
  }

  const [row] = await db
    .insert(projects)
    .values({
      userId,
      name: name.trim(),
      slug,
      description: description?.trim() || null,
      status: "idea",
    })
    .onConflictDoNothing({ target: [projects.userId, projects.slug] })
    .returning();
  if (row) {
    await recordContextEvent({ userId, kind: "project_updated", refId: row.id });
    return row;
  }

  const [after] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.userId, userId), eq(projects.slug, slug)))
    .limit(1);
  return after;
}

export async function updateProject(
  userId: string,
  projectId: string,
  patch: Partial<{
    description: string;
    problemSolved: string;
    architecture: string;
    status: ProjectStatus;
  }>,
): Promise<void> {
  await db
    .update(projects)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(projects.userId, userId), eq(projects.id, projectId)));
  await recordContextEvent({
    userId,
    kind: "project_updated",
    refId: projectId,
  });
}

export async function deleteProject(
  userId: string,
  projectId: string,
): Promise<void> {
  const featureIds = (
    await db
      .select({ id: projectFeatures.id })
      .from(projectFeatures)
      .where(eq(projectFeatures.projectId, projectId))
  ).map((r) => r.id);

  let affected: string[] = [];
  if (featureIds.length > 0) {
    affected = (
      await db
        .select({ skillId: skillEvidence.skillId })
        .from(skillEvidence)
        .where(
          and(
            eq(skillEvidence.userId, userId),
            eq(skillEvidence.sourceType, "project_feature"),
            inArray(skillEvidence.sourceId, featureIds),
          ),
        )
    ).map((r) => r.skillId);

    await db
      .delete(skillEvidence)
      .where(
        and(
          eq(skillEvidence.userId, userId),
          eq(skillEvidence.sourceType, "project_feature"),
          inArray(skillEvidence.sourceId, featureIds),
        ),
      );
  }

  await db
    .delete(projects)
    .where(and(eq(projects.userId, userId), eq(projects.id, projectId)));

  for (const skillId of new Set(affected)) {
    await recomputeSkill(userId, skillId);
  }
}

export async function addFeature(
  userId: string,
  projectId: string,
  input: { title: string; description?: string; status?: FeatureStatus },
): Promise<ProjectFeature> {
  const [row] = await db
    .insert(projectFeatures)
    .values({
      userId,
      projectId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      status: input.status ?? "planned",
      completedAt: input.status === "done" ? new Date() : null,
    })
    .returning();
  await recordContextEvent({ userId, kind: "project_updated", refId: projectId });
  return row;
}

export async function setFeatureStatus(
  userId: string,
  featureId: string,
  status: FeatureStatus,
): Promise<void> {
  const [row] = await db
    .update(projectFeatures)
    .set({
      status,
      completedAt: status === "done" ? new Date() : null,
    })
    .where(
      and(eq(projectFeatures.userId, userId), eq(projectFeatures.id, featureId)),
    )
    .returning({ projectId: projectFeatures.projectId });
  if (row) {
    await recordContextEvent({ userId, kind: "project_updated", refId: row.projectId });
  }
  await syncFeatureEvidence(userId, featureId);
}

export async function linkSkill(
  userId: string,
  input: {
    projectId: string;
    featureId?: string | null;
    skillId: string;
    role: SkillRole;
  },
): Promise<void> {
  const featureId = input.featureId ?? null;
  const [existing] = await db
    .select({ id: projectSkills.id })
    .from(projectSkills)
    .where(
      and(
        eq(projectSkills.projectId, input.projectId),
        eq(projectSkills.skillId, input.skillId),
        featureId
          ? eq(projectSkills.featureId, featureId)
          : sql`${projectSkills.featureId} is null`,
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(projectSkills)
      .set({ role: input.role })
      .where(eq(projectSkills.id, existing.id));
  } else {
    await db.insert(projectSkills).values({
      userId,
      projectId: input.projectId,
      featureId,
      skillId: input.skillId,
      role: input.role,
    });
  }
  if (featureId) await syncFeatureEvidence(userId, featureId);
}

export async function unlinkSkill(
  userId: string,
  linkId: string,
): Promise<void> {
  const [row] = await db
    .delete(projectSkills)
    .where(and(eq(projectSkills.userId, userId), eq(projectSkills.id, linkId)))
    .returning({ featureId: projectSkills.featureId });
  if (row?.featureId) await syncFeatureEvidence(userId, row.featureId);
}

/**
 * Reconciles project_feature skill-evidence for one feature: a `done` feature's
 * used/demonstrated skills get IMPLEMENTED-level evidence; anything else has its
 * evidence removed. Affected skills are recomputed.
 */
export async function syncFeatureEvidence(
  userId: string,
  featureId: string,
): Promise<void> {
  const [feature] = await db
    .select()
    .from(projectFeatures)
    .where(
      and(eq(projectFeatures.userId, userId), eq(projectFeatures.id, featureId)),
    )
    .limit(1);
  if (!feature) return;

  const links = await db
    .select({ skillId: projectSkills.skillId, role: projectSkills.role })
    .from(projectSkills)
    .where(
      and(
        eq(projectSkills.userId, userId),
        eq(projectSkills.featureId, featureId),
      ),
    );

  const existing = await db
    .select()
    .from(skillEvidence)
    .where(
      and(
        eq(skillEvidence.userId, userId),
        eq(skillEvidence.sourceType, "project_feature"),
        eq(skillEvidence.sourceId, featureId),
      ),
    );

  const affected = new Set<string>();
  const wanted =
    feature.status === "done"
      ? links.filter((l) => l.role !== "planned")
      : [];

  for (const link of wanted) {
    const strength = link.role === "demonstrated" ? "strong" : "moderate";
    const ex = existing.find((e) => e.skillId === link.skillId);
    if (ex) {
      if (ex.strength !== strength || ex.status !== "accepted") {
        await db
          .update(skillEvidence)
          .set({ strength, status: "accepted", decidedAt: new Date() })
          .where(eq(skillEvidence.id, ex.id));
        affected.add(link.skillId);
      }
    } else {
      await db.insert(skillEvidence).values({
        userId,
        skillId: link.skillId,
        sourceType: "project_feature",
        sourceId: featureId,
        summary: `Shipped feature: ${feature.title}`,
        supportsLevel: "implemented",
        strength,
        status: "accepted",
        createdBy: "user",
        decidedAt: new Date(),
      });
      affected.add(link.skillId);
    }
  }

  for (const e of existing) {
    if (!wanted.some((l) => l.skillId === e.skillId)) {
      await db.delete(skillEvidence).where(eq(skillEvidence.id, e.id));
      affected.add(e.skillId);
    }
  }

  for (const skillId of affected) await recomputeSkill(userId, skillId);
}

export interface ProjectIdea {
  name: string;
  pitch: string;
  problemSolved: string;
  targetSkills: string[];
  suggestedFeatures: { title: string; skills: string[] }[];
}

/** Creates a planning-stage project (+ planned features + skill links) from an agent idea. */
export async function createProjectFromIdea(
  userId: string,
  idea: ProjectIdea,
): Promise<Project> {
  const project = await createProject(userId, {
    name: idea.name,
    description: idea.pitch,
    problemSolved: idea.problemSolved,
    status: "planning",
  });

  const resolveSkill = async (name: string) =>
    upsertSkillByName(userId, name, "concept" as SkillCategory);

  for (const name of idea.targetSkills) {
    const skill = await resolveSkill(name);
    await db
      .insert(projectSkills)
      .values({
        userId,
        projectId: project.id,
        skillId: skill.id,
        role: "planned",
      })
      .onConflictDoNothing();
  }

  for (const f of idea.suggestedFeatures) {
    const feature = await addFeature(userId, project.id, {
      title: f.title,
      status: "planned",
    });
    for (const name of f.skills) {
      const skill = await resolveSkill(name);
      await db
        .insert(projectSkills)
        .values({
          userId,
          projectId: project.id,
          featureId: feature.id,
          skillId: skill.id,
          role: "planned",
        })
        .onConflictDoNothing();
    }
  }

  return project;
}

// ── Context for the Project agent ──────────────────────────────────────────

export async function getProjectSnapshot(userId: string) {
  const [projectRows, skillRows, evidenceRows] = await Promise.all([
    listProjects(userId),
    db
      .select({ id: skills.id, name: skills.name, level: skills.level, category: skills.category })
      .from(skills)
      .where(eq(skills.userId, userId)),
    db
      .select({ skillId: skillEvidence.skillId })
      .from(skillEvidence)
      .where(
        and(
          eq(skillEvidence.userId, userId),
          eq(skillEvidence.sourceType, "project_feature"),
          eq(skillEvidence.status, "accepted"),
        ),
      ),
  ]);

  const provenViaProject = new Set(evidenceRows.map((r) => r.skillId));

  return {
    projects: projectRows.map((p) => ({
      name: p.name,
      status: p.status,
      features: `${p.featuresDone}/${p.featuresTotal} done`,
      skills: p.skillsCount,
    })),
    strengths: skillRows
      .filter((s) => s.level === "implemented" || s.level === "proven")
      .map((s) => s.name),
    inProgress: skillRows
      .filter((s) => s.level === "learning" || s.level === "practiced")
      .map((s) => s.name),
    // learned but never demonstrated in a project → the gap the agent should target
    unproven: skillRows
      .filter(
        (s) =>
          (s.level === "practiced" || s.level === "implemented") &&
          !provenViaProject.has(s.id),
      )
      .map((s) => s.name),
  };
}
