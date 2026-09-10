/**
 * Match a proof-bundle feature to the visual proof in resume/media-manifest.json
 * and render it as a portfolio deep-link + Cloudinary URLs, to sit next to the
 * GitHub links in proof-bundle.md.
 *
 * Server / script only.
 */
import { loadProfile } from "@/lib/apply/profile";
import {
  isCloudinaryConfigured,
  mediaUrl,
  videoPosterUrl,
} from "@/lib/media/cloudinary";
import { loadManifest, type MediaItem } from "@/lib/media/manifest";

const PORTFOLIO_FALLBACK = "https://dipankarsaha.vercel.app";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function portfolioBase(): string {
  try {
    return (loadProfile().links.portfolio || PORTFOLIO_FALLBACK).replace(/\/$/, "");
  } catch {
    return PORTFOLIO_FALLBACK;
  }
}

export interface VisualProof {
  kind: MediaItem["kind"];
  caption: string;
  cloudinaryId: string;
  resourceType: MediaItem["resourceType"];
  format: string;
  portfolioUrl: string;
}

/** Manifest media whose (projectSlug, featureKey) matches this proof feature. */
export function visualProofFor(
  projectName: string,
  featureTitle: string,
): VisualProof[] {
  if (!projectName || !featureTitle) return [];
  let manifest;
  try {
    manifest = loadManifest();
  } catch {
    return [];
  }
  const projSlug = slugify(projectName);
  const features = manifest.projects[projSlug];
  if (!features) return [];

  const want = slugify(featureTitle);
  const keys = Object.keys(features);
  const key =
    keys.find((k) => k === want) ??
    keys.find((k) => want.includes(k) || k.includes(want));
  if (!key) return [];

  const base = `${portfolioBase()}/projects/${projSlug}#${key}`;
  return features[key].map((it) => ({
    kind: it.kind,
    caption: it.caption,
    cloudinaryId: it.cloudinaryId,
    resourceType: it.resourceType,
    format: it.format,
    portfolioUrl: base,
  }));
}

function cdnUrl(v: VisualProof): string {
  return v.resourceType === "video"
    ? videoPosterUrl(v.cloudinaryId)
    : mediaUrl(v.cloudinaryId, { resourceType: "image", format: v.format });
}

/**
 * A markdown fragment to append to a proof-bundle feature line — a portfolio
 * deep-link plus (when Cloudinary is configured) each media URL.
 */
export function visualProofMd(projectName: string, featureTitle: string): string {
  const links = visualProofFor(projectName, featureTitle);
  if (links.length === 0) return "";
  const parts = [`visual ${links[0].portfolioUrl}`];
  if (isCloudinaryConfigured()) {
    for (const l of links) parts.push(`${l.kind} ${cdnUrl(l)}`);
  }
  return `  ·  ${parts.join("  ·  ")}`;
}
