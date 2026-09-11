import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  contentItems,
  contentSources,
  entitySkillLinks,
  projectFeatures,
  projectSkills,
  projects,
  skills,
} from "@/lib/db/schema";
import { isCloudinaryConfigured, mediaUrl, videoPosterUrl } from "@/lib/media/cloudinary";
import { slugify } from "@/lib/slug";

/**
 * The narrow public surface for the portfolio site (J6). Only data explicitly
 * marked public leaves the private app: content that is `isPublic && published`,
 * and `done` features of projects flagged `isPublic`. Served unauthenticated by
 * `/api/public/*` — keep every field here safe to publish.
 */

export interface PublicContentItem {
  slug: string;
  title: string;
  hook: string | null;
  angle: string | null;
  body: string | null;
  assetType: string | null;
  publishedUrls: Record<string, string> | null;
  skills: string[];
  features: string[];
}

export interface PublicFeature {
  projectSlug: string;
  featureSlug: string;
  projectName: string;
  repoUrl: string | null;
  liveUrl: string | null;
  title: string;
  description: string | null;
  status: string;
  demoVideoUrl: string | null;
  codePaths: Record<string, string> | null;
}

export async function getPublicContent(userId: string): Promise<PublicContentItem[]> {
  const rows = await db
    .select()
    .from(contentItems)
    .where(
      and(
        eq(contentItems.userId, userId),
        eq(contentItems.isPublic, true),
        eq(contentItems.status, "published"),
      ),
    );
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const links = await db
    .select({
      sourceId: entitySkillLinks.sourceId,
      targetType: entitySkillLinks.targetType,
      targetId: entitySkillLinks.targetId,
    })
    .from(entitySkillLinks)
    .where(
      and(
        eq(entitySkillLinks.userId, userId),
        eq(entitySkillLinks.sourceType, "content_item"),
        inArray(entitySkillLinks.sourceId, ids),
      ),
    );
  const skillIds = [...new Set(links.filter((l) => l.targetType === "skill").map((l) => l.targetId))];
  const featIds = [...new Set(links.filter((l) => l.targetType === "project_feature").map((l) => l.targetId))];
  // exclusion invariant: a skipped skill / feature name never reaches the
  // public portfolio, even via a published content item's links.
  const skillName = new Map(
    (skillIds.length
      ? await db
          .select({ id: skills.id, name: skills.name })
          .from(skills)
          .where(and(inArray(skills.id, skillIds), isNull(skills.excludedAt)))
      : []
    ).map((s) => [s.id, s.name]),
  );
  const featName = new Map(
    (featIds.length
      ? await db
          .select({ id: projectFeatures.id, title: projectFeatures.title })
          .from(projectFeatures)
          .innerJoin(projects, eq(projects.id, projectFeatures.projectId))
          .where(
            and(
              inArray(projectFeatures.id, featIds),
              isNull(projectFeatures.excludedAt),
              isNull(projects.excludedAt),
            ),
          )
      : []
    ).map((f) => [f.id, f.title]),
  );

  return rows.map((r) => {
    const forItem = links.filter((l) => l.sourceId === r.id);
    return {
      slug: r.id,
      title: r.title,
      hook: r.hook,
      angle: r.angle,
      body: r.body,
      assetType: r.assetType,
      publishedUrls: r.publishedUrls as Record<string, string> | null,
      skills: forItem
        .filter((l) => l.targetType === "skill")
        .map((l) => skillName.get(l.targetId))
        .filter((n): n is string => !!n),
      features: forItem
        .filter((l) => l.targetType === "project_feature")
        .map((l) => featName.get(l.targetId))
        .filter((n): n is string => !!n),
    };
  });
}

export async function getPublicFeatures(userId: string): Promise<PublicFeature[]> {
  const rows = await db
    .select({
      projectSlug: projects.slug,
      projectName: projects.name,
      repoUrl: projects.repoUrl,
      liveUrl: projects.liveUrl,
      featureId: projectFeatures.id,
      title: projectFeatures.title,
      description: projectFeatures.description,
      status: projectFeatures.status,
      demoVideoUrl: projectFeatures.demoVideoUrl,
      codePaths: projectFeatures.codePaths,
    })
    .from(projectFeatures)
    .innerJoin(projects, eq(projects.id, projectFeatures.projectId))
    .where(
      and(
        eq(projects.userId, userId),
        eq(projects.isPublic, true),
        eq(projectFeatures.status, "done"),
        isNull(projects.excludedAt),
        isNull(projectFeatures.excludedAt),
      ),
    );

  return rows.map((r) => ({
    projectSlug: r.projectSlug,
    featureSlug: slugify(r.title),
    projectName: r.projectName,
    repoUrl: r.repoUrl,
    liveUrl: r.liveUrl,
    title: r.title,
    description: r.description,
    status: r.status,
    demoVideoUrl: r.demoVideoUrl,
    codePaths: r.codePaths as Record<string, string> | null,
  }));
}

// ── Group C — curated portfolio content cards ───────────────────────────────

export interface PublicContentCard {
  id: string;
  title: string;
  caption: string | null;
  kind: string; // diagram | screenshot | video
  url: string; // display image (poster frame for a video)
  videoUrl: string | null; // set only when kind === "video"
  projectSlug: string | null;
  /** matches PublicFeature.featureSlug */
  featureSlug: string | null;
  code: { repoUrl: string | null; links: { label: string; url: string }[] } | null;
}

/** Unauthenticated. Only isPublic && published "portfolio" content_items,
 *  each with its linked feature's code links resolved inline (never stored
 *  redundantly — see content_sources, sourceType "project_feature"). */
export async function getPublicContentCards(userId: string): Promise<PublicContentCard[]> {
  if (!isCloudinaryConfigured()) return [];
  const rows = await db
    .select({
      id: contentItems.id,
      title: contentItems.title,
      caption: contentItems.body,
      kind: contentItems.assetType,
      cloudinaryPublicId: contentItems.cloudinaryPublicId,
      resourceType: contentItems.cloudinaryResourceType,
      format: contentItems.cloudinaryFormat,
    })
    .from(contentItems)
    .where(
      and(
        eq(contentItems.userId, userId),
        eq(contentItems.platform, "portfolio"),
        eq(contentItems.isPublic, true),
        eq(contentItems.status, "published"),
      ),
    )
    .orderBy(contentItems.createdAt);
  const complete = rows.filter(
    (r): r is typeof r & { cloudinaryPublicId: string; resourceType: string; format: string; kind: string } =>
      Boolean(r.cloudinaryPublicId && r.resourceType && r.format && r.kind),
  );
  if (complete.length === 0) return [];

  const ids = complete.map((r) => r.id);
  const sources = await db
    .select({
      contentItemId: contentSources.contentItemId,
      featureId: contentSources.sourceId,
    })
    .from(contentSources)
    .where(
      and(
        eq(contentSources.userId, userId),
        eq(contentSources.sourceType, "project_feature"),
        inArray(contentSources.contentItemId, ids),
      ),
    );
  const featureIds = [...new Set(sources.map((s) => s.featureId).filter((x): x is string => !!x))];
  const features = featureIds.length
    ? await db
        .select({
          id: projectFeatures.id,
          title: projectFeatures.title,
          repoUrl: projects.repoUrl,
          projectSlug: projects.slug,
          codePaths: projectFeatures.codePaths,
        })
        .from(projectFeatures)
        .innerJoin(projects, eq(projects.id, projectFeatures.projectId))
        .where(
          and(
            inArray(projectFeatures.id, featureIds),
            eq(projects.isPublic, true),
            isNull(projects.excludedAt),
            isNull(projectFeatures.excludedAt),
          ),
        )
    : [];
  const featureById = new Map(features.map((f) => [f.id, f]));
  const featureIdByContent = new Map(sources.map((s) => [s.contentItemId, s.featureId]));

  return complete.map((r) => {
    const featureId = featureIdByContent.get(r.id) ?? null;
    const f = featureId ? featureById.get(featureId) : undefined;
    const codePaths = (f?.codePaths as Record<string, string> | null) ?? null;
    const links = f
      ? [
          ...(f.repoUrl ? [{ label: "Repository", url: f.repoUrl }] : []),
          ...Object.entries(codePaths ?? {}).map(([label, path]) => ({
            label,
            url: `${(f.repoUrl ?? "").replace(/\/$/, "")}/tree/main/${String(path).replace(/^\//, "")}`,
          })),
        ]
      : [];
    const isVideo = r.resourceType === "video";
    return {
      id: r.id,
      title: r.title,
      caption: r.caption,
      kind: r.kind,
      url: isVideo
        ? videoPosterUrl(r.cloudinaryPublicId)
        : mediaUrl(r.cloudinaryPublicId, { resourceType: "image", format: r.format }),
      videoUrl: isVideo
        ? mediaUrl(r.cloudinaryPublicId, { resourceType: "video", format: r.format })
        : null,
      projectSlug: f?.projectSlug ?? null,
      featureSlug: f ? slugify(f.title) : null,
      code: f ? { repoUrl: f.repoUrl, links } : null,
    };
  });
}

// ── Group P — dynamic project catalog ───────────────────────────────────────

export interface PublicProject {
  slug: string;
  name: string;
  tagline: string;
  description: string | null;
  problemSolved: string | null;
  architecture: string | null;
  highlights: string[];
  repoUrl: string | null;
  liveUrl: string | null;
  tech: string[];
}

/** Unauthenticated. isPublic, non-excluded projects — tech derived from
 *  linked skills, tagline falls back to description. This is the
 *  portfolio's project catalog; nothing is hand-maintained there anymore. */
export async function getPublicProjects(userId: string): Promise<PublicProject[]> {
  const rows = await db
    .select({
      id: projects.id,
      slug: projects.slug,
      name: projects.name,
      tagline: projects.tagline,
      description: projects.description,
      problemSolved: projects.problemSolved,
      architecture: projects.architecture,
      highlights: projects.highlights,
      repoUrl: projects.repoUrl,
      liveUrl: projects.liveUrl,
    })
    .from(projects)
    .where(
      and(
        eq(projects.userId, userId),
        eq(projects.isPublic, true),
        isNull(projects.excludedAt),
      ),
    );
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const skillRows = await db
    .select({ projectId: projectSkills.projectId, skillName: skills.name })
    .from(projectSkills)
    .innerJoin(skills, eq(skills.id, projectSkills.skillId))
    .where(
      and(
        eq(projectSkills.userId, userId),
        inArray(projectSkills.projectId, ids),
        isNull(skills.excludedAt),
      ),
    );
  const techByProject = new Map<string, string[]>();
  for (const r of skillRows) {
    const arr = techByProject.get(r.projectId) ?? [];
    if (!arr.includes(r.skillName)) arr.push(r.skillName);
    techByProject.set(r.projectId, arr);
  }

  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    tagline: r.tagline || r.description || "",
    description: r.description,
    problemSolved: r.problemSolved,
    architecture: r.architecture,
    highlights: Array.isArray(r.highlights) ? (r.highlights as string[]) : [],
    repoUrl: r.repoUrl,
    liveUrl: r.liveUrl,
    tech: techByProject.get(r.id) ?? [],
  }));
}
