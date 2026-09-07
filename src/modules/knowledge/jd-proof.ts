import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  contentItems,
  entitySkillLinks,
  learningSessions,
  learningSessionSkills,
  projectFeatures,
  projects,
  skills,
} from "@/lib/db/schema";
import { backfillEntityEmbeddings } from "./entities";
import { getProofOfWork } from "./entity-skill-links";
import { matchSkillsAndFeatures } from "./mapping/entity-candidates";
import { DECISION_TARGET_TYPES } from "./target-types";

export interface CodeLink {
  label: string;
  url: string;
}

interface FeatureMeta {
  repoUrl: string | null;
  liveUrl: string | null;
  demoVideoUrl: string | null;
  codePaths: Record<string, string> | null;
  projectName: string;
  projectSlug: string;
}

export interface JdSkillMatch {
  skillId: string;
  name: string;
  level: string;
  category: string;
  score: number;
  /** Shipped project features that demonstrate this skill (used/demonstrated role). */
  proof: {
    featureId: string;
    featureTitle: string;
    projectName: string;
    status: string;
    role: string;
    repoUrl: string | null;
    demoVideoUrl: string | null;
    codeLinks: CodeLink[];
  }[];
}

export interface JdFeatureMatch {
  featureId: string;
  title: string;
  status: string;
  projectName: string;
  repoUrl: string | null;
  liveUrl: string | null;
  demoVideoUrl: string | null;
  codeLinks: CodeLink[];
  score: number;
}

export interface JdProof {
  skills: JdSkillMatch[];
  features: JdFeatureMatch[];
  relatedContent: {
    id: string;
    title: string;
    status: string;
    assetType: string | null;
    publishedUrls: Record<string, string> | null;
  }[];
  relatedLearning: { id: string; topic: string; category: string }[];
}

function codeLinks(meta: FeatureMeta | undefined): CodeLink[] {
  if (!meta?.repoUrl || !meta.codePaths) return [];
  return Object.entries(meta.codePaths).map(([label, path]) => ({
    label,
    url: `${meta.repoUrl!.replace(/\/$/, "")}/tree/main/${String(path).replace(/^\//, "")}`,
  }));
}

/**
 * Everything the job-application flow needs to build a proof-of-work bundle for
 * one JD — deterministic (embedding + lexical match, then plain SQL joins; no
 * LLM completion). Exposed as the `get_proof_for_jd` MCP tool.
 */
export async function getProofForJd(
  userId: string,
  jdText: string,
): Promise<JdProof> {
  // make sure freshly-synced skills/features are embeddable (hash-guarded, ~free)
  await backfillEntityEmbeddings(userId, DECISION_TARGET_TYPES);

  const scored = await matchSkillsAndFeatures(userId, jdText, {
    keepNameMatches: true,
  });
  const skillScore = new Map<string, number>();
  const featureScore = new Map<string, number>();
  for (const c of scored) {
    if (c.targetType === "skill") skillScore.set(c.targetId, c.score);
    else if (c.targetType === "project_feature")
      featureScore.set(c.targetId, c.score);
  }

  const skillIds = [...skillScore.keys()];
  const directFeatureIds = [...featureScore.keys()];

  // ── skill rows + proof-of-work ──────────────────────────────────────────
  const skillRows = skillIds.length
    ? await db
        .select({
          id: skills.id,
          name: skills.name,
          level: skills.level,
          category: skills.category,
        })
        .from(skills)
        .where(and(eq(skills.userId, userId), inArray(skills.id, skillIds)))
    : [];

  const proofMap = await getProofOfWork(userId, skillIds);

  // metadata for every feature referenced (proof features + direct matches)
  const allFeatureIds = new Set<string>(directFeatureIds);
  for (const items of proofMap.values())
    for (const it of items) allFeatureIds.add(it.featureId);

  const featureMeta = new Map<string, FeatureMeta>();
  if (allFeatureIds.size) {
    const rows = await db
      .select({
        id: projectFeatures.id,
        demoVideoUrl: projectFeatures.demoVideoUrl,
        codePaths: projectFeatures.codePaths,
        repoUrl: projects.repoUrl,
        liveUrl: projects.liveUrl,
        projectName: projects.name,
        projectSlug: projects.slug,
      })
      .from(projectFeatures)
      .innerJoin(projects, eq(projects.id, projectFeatures.projectId))
      .where(
        and(
          eq(projectFeatures.userId, userId),
          inArray(projectFeatures.id, [...allFeatureIds]),
        ),
      );
    for (const r of rows) {
      featureMeta.set(r.id, {
        repoUrl: r.repoUrl,
        liveUrl: r.liveUrl,
        demoVideoUrl: r.demoVideoUrl,
        codePaths: r.codePaths as Record<string, string> | null,
        projectName: r.projectName,
        projectSlug: r.projectSlug,
      });
    }
  }

  const skillsOut: JdSkillMatch[] = skillRows
    .map((s) => ({
      skillId: s.id,
      name: s.name,
      level: s.level,
      category: s.category,
      score: skillScore.get(s.id) ?? 0,
      proof: (proofMap.get(s.id) ?? []).map((p) => {
        const meta = featureMeta.get(p.featureId);
        return {
          featureId: p.featureId,
          featureTitle: p.featureTitle,
          projectName: p.projectName,
          status: p.status,
          role: p.role,
          repoUrl: meta?.repoUrl ?? null,
          demoVideoUrl: meta?.demoVideoUrl ?? null,
          codeLinks: codeLinks(meta),
        };
      }),
    }))
    .sort((a, b) => b.score - a.score);

  // ── directly-matched features ──────────────────────────────────────────
  const directRows = directFeatureIds.length
    ? await db
        .select({
          id: projectFeatures.id,
          title: projectFeatures.title,
          status: projectFeatures.status,
        })
        .from(projectFeatures)
        .where(
          and(
            eq(projectFeatures.userId, userId),
            inArray(projectFeatures.id, directFeatureIds),
          ),
        )
    : [];

  const featuresOut: JdFeatureMatch[] = directRows
    .map((f) => {
      const meta = featureMeta.get(f.id);
      return {
        featureId: f.id,
        title: f.title,
        status: f.status,
        projectName: meta?.projectName ?? "",
        repoUrl: meta?.repoUrl ?? null,
        liveUrl: meta?.liveUrl ?? null,
        demoVideoUrl: meta?.demoVideoUrl ?? null,
        codeLinks: codeLinks(meta),
        score: featureScore.get(f.id) ?? 0,
      };
    })
    .sort((a, b) => b.score - a.score);

  // ── related content (shares a matched skill / feature) ─────────────────
  const targetConds = [
    ...skillIds.map((id) =>
      and(eq(entitySkillLinks.targetType, "skill"), eq(entitySkillLinks.targetId, id)),
    ),
    ...directFeatureIds.map((id) =>
      and(
        eq(entitySkillLinks.targetType, "project_feature"),
        eq(entitySkillLinks.targetId, id),
      ),
    ),
  ];
  let relatedContent: JdProof["relatedContent"] = [];
  if (targetConds.length) {
    const rows = await db
      .selectDistinct({
        id: contentItems.id,
        title: contentItems.title,
        status: contentItems.status,
        assetType: contentItems.assetType,
        publishedUrls: contentItems.publishedUrls,
      })
      .from(entitySkillLinks)
      .innerJoin(contentItems, eq(contentItems.id, entitySkillLinks.sourceId))
      .where(
        and(
          eq(entitySkillLinks.userId, userId),
          eq(entitySkillLinks.sourceType, "content_item"),
          or(...targetConds),
        ),
      );
    relatedContent = rows.slice(0, 10).map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      assetType: r.assetType,
      publishedUrls: r.publishedUrls as Record<string, string> | null,
    }));
  }

  // ── related learning (exact, via learning_session_skills) ──────────────
  let relatedLearning: JdProof["relatedLearning"] = [];
  if (skillIds.length) {
    const rows = await db
      .select({
        id: learningSessions.id,
        topic: learningSessions.topic,
        category: learningSessions.category,
        occurredAt: learningSessions.occurredAt,
      })
      .from(learningSessionSkills)
      .innerJoin(
        learningSessions,
        eq(learningSessions.id, learningSessionSkills.sessionId),
      )
      .where(
        and(
          eq(learningSessions.userId, userId),
          inArray(learningSessionSkills.skillId, skillIds),
        ),
      );
    const byId = new Map(rows.map((r) => [r.id, r]));
    relatedLearning = [...byId.values()]
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, 10)
      .map((r) => ({ id: r.id, topic: r.topic, category: r.category }));
  }

  return {
    skills: skillsOut,
    features: featuresOut,
    relatedContent,
    relatedLearning,
  };
}
