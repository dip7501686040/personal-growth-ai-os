/**
 * Match a proof-bundle feature to its portfolio card (Group C's `content_items`,
 * platform "portfolio" — the source of truth for visual proof) and render it as
 * a portfolio deep-link + Cloudinary CDN URL, to sit next to the GitHub links
 * in proof-bundle.md.
 *
 * Server / script only.
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projectFeatures, projects } from "@/lib/db/schema";
import { loadProfile } from "@/lib/apply/profile";
import {
  isCloudinaryConfigured,
  mediaUrl,
  videoPosterUrl,
} from "@/lib/media/cloudinary";
import { slugify } from "@/lib/slug";
import { findCardForFeature } from "@/modules/content/service";

const PORTFOLIO_FALLBACK = "https://dipankarsaha.vercel.app";

async function portfolioBase(): Promise<string> {
  try {
    const p = await loadProfile();
    return (p.links.portfolio || PORTFOLIO_FALLBACK).replace(/\/$/, "");
  } catch {
    return PORTFOLIO_FALLBACK;
  }
}

export interface VisualProof {
  kind: "diagram" | "screenshot" | "video";
  caption: string | null;
  cdnUrl: string;
  portfolioUrl: string;
}

/** The portfolio card (if any) linked to this feature via contentSources. */
export async function visualProofFor(
  userId: string,
  featureId: string,
): Promise<VisualProof | null> {
  const card = await findCardForFeature(userId, featureId);
  if (!card || !card.cloudinaryPublicId || !card.cloudinaryResourceType) return null;

  const [row] = await db
    .select({ projectSlug: projects.slug, featureTitle: projectFeatures.title })
    .from(projectFeatures)
    .innerJoin(projects, eq(projects.id, projectFeatures.projectId))
    .where(eq(projectFeatures.id, featureId))
    .limit(1);
  if (!row) return null;

  const base = await portfolioBase();
  const cdnUrl =
    card.cloudinaryResourceType === "video"
      ? videoPosterUrl(card.cloudinaryPublicId)
      : mediaUrl(card.cloudinaryPublicId, {
          resourceType: "image",
          format: card.cloudinaryFormat ?? undefined,
        });

  return {
    kind: card.assetType as "diagram" | "screenshot" | "video",
    caption: card.body,
    cdnUrl,
    portfolioUrl: `${base}/projects/${row.projectSlug}#${slugify(row.featureTitle)}`,
  };
}

/**
 * A markdown fragment to append to a proof-bundle feature line — a portfolio
 * deep-link plus (when Cloudinary is configured) the media's CDN URL.
 */
export async function visualProofMd(userId: string, featureId: string): Promise<string> {
  const v = await visualProofFor(userId, featureId);
  if (!v) return "";
  const parts = [`visual ${v.portfolioUrl}`];
  if (isCloudinaryConfigured()) parts.push(`${v.kind} ${v.cdnUrl}`);
  return `  ·  ${parts.join("  ·  ")}`;
}
