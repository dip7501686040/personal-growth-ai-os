/**
 * Match a proof-bundle feature to its portfolio card(s) (Group C's
 * `content_items`, platform "portfolio" — the source of truth for visual
 * proof). A feature can carry two cards — a UI view and a terminal/code
 * view — forming one proof "cycle": what a user sees, then what's behind it.
 * proof-bundle.md links to the portfolio card itself (visualProofUrl below);
 * the card page is what shows the visual(s) and the GitHub code links.
 *
 * Server / script only.
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projectFeatures, projects } from "@/lib/db/schema";
import { loadProfile } from "@/lib/apply/profile";
import { mediaUrl, videoPosterUrl } from "@/lib/media/cloudinary";
import { slugify } from "@/lib/slug";
import { findCardsForFeature, type CardRole } from "@/modules/content/service";

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
  role: CardRole;
  kind: "diagram" | "screenshot" | "video";
  caption: string | null;
  cdnUrl: string;
  portfolioUrl: string;
}

function cdnUrlFor(publicId: string, resourceType: "image" | "video", format: string | null): string {
  return resourceType === "video"
    ? videoPosterUrl(publicId)
    : mediaUrl(publicId, { resourceType: "image", format: format ?? undefined });
}

/** Every portfolio card linked to this feature — UI view first, then
 *  terminal/code view, matching how a reviewer should walk through it. */
export async function visualProofFor(
  userId: string,
  featureId: string,
): Promise<VisualProof[]> {
  const cards = await findCardsForFeature(userId, featureId);
  const withMedia = cards.filter((c) => c.cloudinaryPublicId && c.cloudinaryResourceType);
  if (withMedia.length === 0) return [];

  const [row] = await db
    .select({ projectSlug: projects.slug, featureTitle: projectFeatures.title })
    .from(projectFeatures)
    .innerJoin(projects, eq(projects.id, projectFeatures.projectId))
    .where(eq(projectFeatures.id, featureId))
    .limit(1);
  if (!row) return [];

  const base = await portfolioBase();
  const portfolioUrl = `${base}/projects/${row.projectSlug}#${slugify(row.featureTitle)}`;

  const out = withMedia.map((card) => {
    const role: CardRole = (card.cloudinaryPublicId ?? "").endsWith("-ui") ? "ui" : "terminal";
    return {
      role,
      kind: card.assetType as "diagram" | "screenshot" | "video",
      caption: card.body,
      cdnUrl: cdnUrlFor(
        card.cloudinaryPublicId!,
        card.cloudinaryResourceType as "image" | "video",
        card.cloudinaryFormat,
      ),
      portfolioUrl,
    };
  });
  return out.sort((a, b) => (a.role === "ui" ? -1 : 1) - (b.role === "ui" ? -1 : 1));
}

/**
 * The one link a proof-bundle feature line needs: the portfolio card's own
 * page. The card itself already shows the visual(s) and the "View code"
 * GitHub links (Group C) — repeating repo/code-path/CDN URLs here just
 * duplicates what the portfolio already presents better. Returns null when
 * the feature has no card yet (proofBundleMd falls back to the repo link).
 */
export async function visualProofUrl(userId: string, featureId: string): Promise<string | null> {
  const cards = await visualProofFor(userId, featureId);
  return cards[0]?.portfolioUrl ?? null;
}
