import { and, eq, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  projectFeatures,
  projectSkills,
  projects,
  skillEvidence,
  skills,
} from "@/lib/db/schema";
import { slugify } from "@/lib/slug";
import { recordContextEvent } from "@/modules/context/events";
import type { SkillCategory } from "@/modules/skills/levels";

type FeatureStatus = "planned" | "in_progress" | "done";
type ProjectStatus = "idea" | "planning" | "building" | "paused" | "completed";
type SkillRole = "used" | "demonstrated";

export interface SyncProposalSkill {
  name: string;
  category?: SkillCategory;
  role: SkillRole;
}

export interface SyncProposalFeature {
  /** `repo:<url>:feature:<slug>` — stable identity for reconcile. */
  sourceKey: string;
  title: string;
  description?: string;
  status: FeatureStatus;
  completedAt?: string;
  demoVideoUrl?: string;
  codePaths?: Record<string, string>;
  skills: SyncProposalSkill[];
}

export interface SyncProposal {
  project: {
    name: string;
    slug?: string;
    repoUrl?: string;
    liveUrl?: string;
    repoPath?: string;
    description?: string;
    problemSolved?: string;
    architecture?: string;
    status: ProjectStatus;
    lastSyncedSha?: string;
  };
  features: SyncProposalFeature[];
}

export interface SyncResult {
  project: {
    id: string;
    slug: string;
    statusBefore: ProjectStatus | "(new)";
    statusAfter: ProjectStatus;
  };
  featuresInserted: number;
  featuresUpdated: number;
  featuresUnchanged: number;
  staleFeatures: { title: string; sourceKey: string; lastSeenAt: string | null }[];
  evidenceSuggested: number;
  evidenceSkipped: number;
  skillsCreated: string[];
}

const RANK: Record<Exclude<ProjectStatus, "paused">, number> = {
  idea: 0,
  planning: 1,
  building: 2,
  completed: 3,
};

/** Only ever move a project forward; never auto-pause, never disturb a paused one. */
function advanceProject(
  current: ProjectStatus,
  proposed: ProjectStatus,
): ProjectStatus {
  if (current === "paused" || proposed === "paused") return current;
  return RANK[proposed] > RANK[current] ? proposed : current;
}

const FRANK: Record<FeatureStatus, number> = {
  planned: 0,
  in_progress: 1,
  done: 2,
};
function advanceFeature(
  current: FeatureStatus,
  proposed: FeatureStatus,
): FeatureStatus {
  return FRANK[proposed] > FRANK[current] ? proposed : current;
}

/**
 * Apply one `/sync-repo` proposal to the DB — idempotent: match features by
 * `sourceKey`, move statuses forward only, fill (never clobber) user-written
 * prose, add `suggested` project-feature evidence for a done feature's
 * used/demonstrated skills, and never touch an already accepted/rejected
 * evidence row. Levels are NOT recomputed here — that happens when the user
 * accepts the suggested evidence.
 */
export async function applySyncProposal(
  userId: string,
  proposal: SyncProposal,
): Promise<SyncResult> {
  const slug = proposal.project.slug?.trim() || slugify(proposal.project.name);
  const p = proposal.project;

  // ── project upsert ──────────────────────────────────────────────────────
  const [existingProject] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.userId, userId), eq(projects.slug, slug)))
    .limit(1);

  let projectId: string;
  let statusBefore: SyncResult["project"]["statusBefore"];
  let statusAfter: ProjectStatus;

  if (existingProject) {
    projectId = existingProject.id;
    statusBefore = existingProject.status as ProjectStatus;
    statusAfter = advanceProject(statusBefore, p.status);
    await db
      .update(projects)
      .set({
        status: statusAfter,
        repoUrl: p.repoUrl ?? existingProject.repoUrl,
        liveUrl: p.liveUrl ?? existingProject.liveUrl,
        repoPath: existingProject.repoPath ?? p.repoPath ?? null,
        // fill-only: never overwrite prose the user has written
        description: existingProject.description || p.description || null,
        problemSolved: existingProject.problemSolved || p.problemSolved || null,
        architecture: existingProject.architecture || p.architecture || null,
        lastSyncedSha: p.lastSyncedSha ?? existingProject.lastSyncedSha,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));
  } else {
    statusBefore = "(new)";
    statusAfter = p.status;
    const [row] = await db
      .insert(projects)
      .values({
        userId,
        name: proposal.project.name.trim(),
        slug,
        status: p.status,
        repoUrl: p.repoUrl ?? null,
        liveUrl: p.liveUrl ?? null,
        repoPath: p.repoPath ?? null,
        description: p.description ?? null,
        problemSolved: p.problemSolved ?? null,
        architecture: p.architecture ?? null,
        lastSyncedSha: p.lastSyncedSha ?? null,
        lastSyncedAt: new Date(),
      })
      .returning({ id: projects.id });
    projectId = row.id;
  }

  // ── skill resolver (tracks newly-created) ───────────────────────────────
  const skillsCreated: string[] = [];
  const skillIdCache = new Map<string, string>();
  const resolveSkill = async (
    name: string,
    category: SkillCategory = "concept",
  ): Promise<string> => {
    const key = name.toLowerCase();
    const cached = skillIdCache.get(key);
    if (cached) return cached;
    const sslug = slugify(name);
    const [hit] = await db
      .select({ id: skills.id })
      .from(skills)
      .where(and(eq(skills.userId, userId), eq(skills.slug, sslug)))
      .limit(1);
    if (hit) {
      skillIdCache.set(key, hit.id);
      return hit.id;
    }
    const [made] = await db
      .insert(skills)
      .values({ userId, name: name.trim(), slug: sslug, category })
      .onConflictDoNothing({ target: [skills.userId, skills.slug] })
      .returning({ id: skills.id });
    if (made) {
      skillsCreated.push(name.trim());
      skillIdCache.set(key, made.id);
      return made.id;
    }
    const [after] = await db
      .select({ id: skills.id })
      .from(skills)
      .where(and(eq(skills.userId, userId), eq(skills.slug, sslug)))
      .limit(1);
    skillIdCache.set(key, after.id);
    return after.id;
  };

  // ── features ────────────────────────────────────────────────────────────
  let featuresInserted = 0;
  let featuresUpdated = 0;
  let featuresUnchanged = 0;
  let evidenceSuggested = 0;
  let evidenceSkipped = 0;

  for (const f of proposal.features) {
    const [existing] = await db
      .select()
      .from(projectFeatures)
      .where(
        and(
          eq(projectFeatures.userId, userId),
          eq(projectFeatures.sourceKey, f.sourceKey),
        ),
      )
      .limit(1);

    let featureId: string;
    let featureStatus: FeatureStatus;

    if (existing) {
      featureId = existing.id;
      featureStatus = advanceFeature(existing.status as FeatureStatus, f.status);
      const nextCodePaths = {
        ...((existing.codePaths as Record<string, string> | null) ?? {}),
        ...(f.codePaths ?? {}),
      };
      const patch = {
        title: f.title.trim(),
        description: f.description?.trim() || existing.description,
        status: featureStatus,
        completedAt:
          featureStatus === "done"
            ? (existing.completedAt ??
              (f.completedAt ? new Date(f.completedAt) : new Date()))
            : null,
        demoVideoUrl: existing.demoVideoUrl ?? f.demoVideoUrl ?? null,
        codePaths: Object.keys(nextCodePaths).length ? nextCodePaths : null,
      };
      const changed =
        patch.title !== existing.title ||
        patch.description !== existing.description ||
        patch.status !== existing.status ||
        patch.demoVideoUrl !== existing.demoVideoUrl ||
        JSON.stringify(patch.codePaths) !== JSON.stringify(existing.codePaths);

      await db
        .update(projectFeatures)
        .set({ ...patch, lastSeenAt: new Date() })
        .where(eq(projectFeatures.id, featureId));
      if (changed) featuresUpdated++;
      else featuresUnchanged++;
    } else {
      featureStatus = f.status;
      const [row] = await db
        .insert(projectFeatures)
        .values({
          userId,
          projectId,
          title: f.title.trim(),
          description: f.description?.trim() || null,
          status: featureStatus,
          completedAt:
            featureStatus === "done"
              ? f.completedAt
                ? new Date(f.completedAt)
                : new Date()
              : null,
          demoVideoUrl: f.demoVideoUrl ?? null,
          codePaths: f.codePaths ?? null,
          sourceKey: f.sourceKey,
          lastSeenAt: new Date(),
        })
        .returning({ id: projectFeatures.id });
      featureId = row.id;
      featuresInserted++;
    }

    // skill links (feature-scoped)
    for (const s of f.skills) {
      const skillId = await resolveSkill(s.name, s.category);
      const [link] = await db
        .select({ id: projectSkills.id })
        .from(projectSkills)
        .where(
          and(
            eq(projectSkills.projectId, projectId),
            eq(projectSkills.featureId, featureId),
            eq(projectSkills.skillId, skillId),
          ),
        )
        .limit(1);
      if (link) {
        await db
          .update(projectSkills)
          .set({ role: s.role })
          .where(eq(projectSkills.id, link.id));
      } else {
        await db.insert(projectSkills).values({
          userId,
          projectId,
          featureId,
          skillId,
          role: s.role,
        });
      }

      // suggested evidence — only for a shipped feature
      if (featureStatus === "done") {
        const [ev] = await db
          .select({ id: skillEvidence.id })
          .from(skillEvidence)
          .where(
            and(
              eq(skillEvidence.userId, userId),
              eq(skillEvidence.skillId, skillId),
              eq(skillEvidence.sourceType, "project_feature"),
              eq(skillEvidence.sourceId, featureId),
            ),
          )
          .limit(1);
        if (ev) {
          evidenceSkipped++;
        } else {
          await db.insert(skillEvidence).values({
            userId,
            skillId,
            sourceType: "project_feature",
            sourceId: featureId,
            summary: `Shipped in ${proposal.project.name}: ${f.title.trim()}`,
            supportsLevel: "implemented",
            strength: s.role === "demonstrated" ? "strong" : "moderate",
            status: "suggested",
            createdBy: "agent",
          });
          evidenceSuggested++;
        }
      }
    }
  }

  // ── stale features (were synced before, not in this proposal) ────────────
  const seenKeys = proposal.features.map((f) => f.sourceKey);
  const stale = await db
    .select({
      title: projectFeatures.title,
      sourceKey: projectFeatures.sourceKey,
      lastSeenAt: projectFeatures.lastSeenAt,
    })
    .from(projectFeatures)
    .where(
      and(
        eq(projectFeatures.userId, userId),
        eq(projectFeatures.projectId, projectId),
        sql`${projectFeatures.sourceKey} is not null`,
        seenKeys.length
          ? notInArray(projectFeatures.sourceKey, seenKeys)
          : sql`true`,
      ),
    );

  await recordContextEvent({
    userId,
    kind: "project_updated",
    refId: projectId,
  });

  return {
    project: { id: projectId, slug, statusBefore, statusAfter },
    featuresInserted,
    featuresUpdated,
    featuresUnchanged,
    staleFeatures: stale.map((s) => ({
      title: s.title,
      sourceKey: s.sourceKey ?? "",
      lastSeenAt: s.lastSeenAt?.toISOString() ?? null,
    })),
    evidenceSuggested,
    evidenceSkipped,
    skillsCreated,
  };
}

/** State a `/sync-repo` run needs for an incremental diff: the last synced SHA
 *  and every feature sourceKey already recorded for this project. */
export async function getSyncState(
  userId: string,
  slug: string,
): Promise<{
  found: boolean;
  status: ProjectStatus | null;
  lastSyncedSha: string | null;
  featureKeys: string[];
}> {
  const [project] = await db
    .select({
      id: projects.id,
      status: projects.status,
      lastSyncedSha: projects.lastSyncedSha,
    })
    .from(projects)
    .where(and(eq(projects.userId, userId), eq(projects.slug, slug)))
    .limit(1);
  if (!project) {
    return { found: false, status: null, lastSyncedSha: null, featureKeys: [] };
  }
  const feats = await db
    .select({ sourceKey: projectFeatures.sourceKey })
    .from(projectFeatures)
    .where(
      and(
        eq(projectFeatures.projectId, project.id),
        sql`${projectFeatures.sourceKey} is not null`,
      ),
    );
  return {
    found: true,
    status: project.status as ProjectStatus,
    lastSyncedSha: project.lastSyncedSha,
    featureKeys: feats.map((f) => f.sourceKey!).filter(Boolean),
  };
}
