import { and, eq, isNull, like, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  knowledgeDocuments,
  projectFeatures,
  projectSkills,
  projects,
  skillEvidence,
  skills,
} from "@/lib/db/schema";
import {
  checkCrossSourceDuplicate,
  embedDocument,
  upsertDocumentRow,
} from "@/lib/knowledge";
import { slugify } from "@/lib/slug";
import { recordContextEvent } from "@/modules/context/events";
import { backfillEntityEmbeddings } from "@/modules/knowledge/entities";
import { mapDocument } from "@/modules/knowledge/mapping";
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

export type KnowledgeDocType = "repo_summary" | "decision" | "concept" | "learning";

/**
 * A distilled fact about the repo to fold into the knowledge base — a repo
 * summary, an architecture decision, a concept, a per-feature note. Written by
 * the `/sync-repo` skill (local analysis, no app LLM cost). NOT raw files.
 */
export interface SyncProposalKnowledge {
  /** stable kebab id, unique within this repo — the reconcile anchor
   *  (sourceRef becomes `<repoUrl|sync-repo:slug>#<slug>`). */
  slug: string;
  docType: KnowledgeDocType;
  title: string;
  body: string;
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
  /**
   * Optional. When present (even as `[]`) the sync **reconciles** this repo's
   * knowledge documents: upsert each, then supersede any repo-scoped doc not in
   * this run. Omit the key entirely to leave knowledge untouched.
   */
  knowledge?: SyncProposalKnowledge[];
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
  knowledge: {
    /** rows created or refreshed (content changed) this run */
    upserted: number;
    /** identical content — nothing to re-embed */
    unchanged: number;
    /** chunks embedded across all upserted docs */
    embedded: number;
    /** knowledge_links inserted by mapDocument */
    linked: number;
    /** cross-source duplicates — superseded, not linked */
    duplicates: number;
    /** repo-scoped docs absent from this run — superseded */
    superseded: number;
    /** docs whose embed/link step failed (row kept for a later resync) */
    embedErrors: number;
  };
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

  // ── knowledge documents (Phase 2) ───────────────────────────────────────
  // Fold the repo's distilled facts into the knowledge base, idempotently, in
  // the same run — replaces the retired `github-sync` cron + Extraction Agent.
  const knowledge: SyncResult["knowledge"] = {
    upserted: 0,
    unchanged: 0,
    embedded: 0,
    linked: 0,
    duplicates: 0,
    superseded: 0,
    embedErrors: 0,
  };
  const manageKnowledge = Array.isArray(proposal.knowledge);

  if (manageKnowledge) {
    const repoAnchor = p.repoUrl?.trim().replace(/\/+$/, "") || `sync-repo:${slug}`;
    const proposed = proposal.knowledge ?? [];
    const seenRefs: string[] = [];

    // Make freshly-synced skills/features linkable before mapping docs to them.
    // Best-effort: an embedding outage just skips the kNN half of the match.
    try {
      await backfillEntityEmbeddings(userId, ["skill", "project_feature"]);
    } catch (err) {
      console.warn(
        "[applySyncProposal] entity-embedding backfill skipped:",
        err instanceof Error ? err.message : err,
      );
    }

    for (const k of proposed) {
      const sourceRef = `${repoAnchor}#${k.slug}`;
      seenRefs.push(sourceRef);
      const body = k.body.trim();
      const { document, created } = await upsertDocumentRow({
        userId,
        docType: k.docType,
        title: k.title.trim(),
        body,
        sourceKind: "github_repo",
        sourceRef,
        meta: { via: "sync-repo", projectSlug: slug, repoUrl: p.repoUrl ?? null },
      });
      if (!created) {
        knowledge.unchanged++;
        continue;
      }
      knowledge.upserted++;
      try {
        knowledge.embedded += await embedDocument(userId, document.id, body);
        const duplicateOf = await checkCrossSourceDuplicate(userId, document.id);
        if (duplicateOf) {
          knowledge.duplicates++;
        } else {
          const r = await mapDocument(userId, document.id);
          knowledge.linked += r.inserted;
        }
      } catch (err) {
        knowledge.embedErrors++;
        console.warn(
          `[applySyncProposal] knowledge "${k.slug}" embed/link skipped:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    // Stale: repo-scoped docs from a prior run that this run no longer emits.
    const superseded = await db
      .update(knowledgeDocuments)
      .set({ supersededAt: new Date() })
      .where(
        and(
          eq(knowledgeDocuments.userId, userId),
          eq(knowledgeDocuments.sourceKind, "github_repo"),
          like(knowledgeDocuments.sourceRef, `${repoAnchor}#%`),
          isNull(knowledgeDocuments.supersededAt),
          seenRefs.length
            ? notInArray(knowledgeDocuments.sourceRef, seenRefs)
            : sql`true`,
        ),
      )
      .returning({ id: knowledgeDocuments.id });
    knowledge.superseded = superseded.length;
  }

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
    knowledge,
  };
}

/** State a `/sync-repo` run needs for an incremental diff: the last synced SHA,
 *  every feature sourceKey, and every knowledge-doc slug already recorded for
 *  this project. */
export async function getSyncState(
  userId: string,
  slug: string,
): Promise<{
  found: boolean;
  status: ProjectStatus | null;
  lastSyncedSha: string | null;
  featureKeys: string[];
  knowledgeSlugs: string[];
}> {
  const [project] = await db
    .select({
      id: projects.id,
      status: projects.status,
      lastSyncedSha: projects.lastSyncedSha,
      repoUrl: projects.repoUrl,
    })
    .from(projects)
    .where(and(eq(projects.userId, userId), eq(projects.slug, slug)))
    .limit(1);
  if (!project) {
    return {
      found: false,
      status: null,
      lastSyncedSha: null,
      featureKeys: [],
      knowledgeSlugs: [],
    };
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

  const repoAnchor =
    project.repoUrl?.trim().replace(/\/+$/, "") || `sync-repo:${slug}`;
  const kdocs = await db
    .select({ sourceRef: knowledgeDocuments.sourceRef })
    .from(knowledgeDocuments)
    .where(
      and(
        eq(knowledgeDocuments.userId, userId),
        eq(knowledgeDocuments.sourceKind, "github_repo"),
        like(knowledgeDocuments.sourceRef, `${repoAnchor}#%`),
        isNull(knowledgeDocuments.supersededAt),
      ),
    );

  return {
    found: true,
    status: project.status as ProjectStatus,
    lastSyncedSha: project.lastSyncedSha,
    featureKeys: feats.map((f) => f.sourceKey!).filter(Boolean),
    knowledgeSlugs: kdocs
      .map((d) => d.sourceRef?.split("#").slice(1).join("#"))
      .filter((s): s is string => !!s),
  };
}
