import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  contentItems,
  entitySkillLinks,
  projectFeatures,
  projects,
  skills,
} from "@/lib/db/schema";
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
  const skillName = new Map(
    (skillIds.length
      ? await db.select({ id: skills.id, name: skills.name }).from(skills).where(inArray(skills.id, skillIds))
      : []
    ).map((s) => [s.id, s.name]),
  );
  const featName = new Map(
    (featIds.length
      ? await db
          .select({ id: projectFeatures.id, title: projectFeatures.title })
          .from(projectFeatures)
          .where(inArray(projectFeatures.id, featIds))
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
