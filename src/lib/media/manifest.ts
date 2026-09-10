/**
 * resume/media-manifest.json — the index of visual proof.
 * Shape: projectSlug → featureKey → MediaItem[]. Committed (an index, not secrets).
 *
 * Server / script only.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const mediaItemSchema = z.object({
  kind: z.enum(["video", "screenshot", "diagram"]),
  resourceType: z.enum(["image", "video"]),
  cloudinaryId: z.string(),
  format: z.string(),
  caption: z.string().default(""),
  width: z.number().nullable().default(null),
  height: z.number().nullable().default(null),
  duration: z.number().nullable().default(null),
  addedAt: z.string(),
});

export type MediaItem = z.infer<typeof mediaItemSchema>;

const manifestSchema = z.object({
  _note: z.string().optional(),
  projects: z.record(z.string(), z.record(z.string(), z.array(mediaItemSchema))),
});

export type MediaManifest = z.infer<typeof manifestSchema>;

const PATH = join(process.cwd(), "resume", "media-manifest.json");

const EMPTY: MediaManifest = {
  _note:
    "Visual proof index. projectSlug → featureKey → media. Written by `pnpm media upload`.",
  projects: {},
};

export function loadManifest(): MediaManifest {
  if (!existsSync(PATH)) return structuredClone(EMPTY);
  return manifestSchema.parse(JSON.parse(readFileSync(PATH, "utf8")));
}

export function saveManifest(m: MediaManifest): void {
  writeFileSync(PATH, JSON.stringify(m, null, 2) + "\n");
}

export function addMediaItem(
  projectSlug: string,
  featureKey: string,
  item: MediaItem,
): MediaManifest {
  const m = loadManifest();
  m.projects[projectSlug] ??= {};
  m.projects[projectSlug][featureKey] ??= [];
  const list = m.projects[projectSlug][featureKey];
  const at = list.findIndex((x) => x.cloudinaryId === item.cloudinaryId);
  if (at >= 0) list[at] = item;
  else list.push(item);
  saveManifest(m);
  return m;
}

export function itemsForFeature(
  projectSlug: string,
  featureKey: string,
  m: MediaManifest = loadManifest(),
): MediaItem[] {
  return m.projects[projectSlug]?.[featureKey] ?? [];
}

export function itemsForProject(
  projectSlug: string,
  m: MediaManifest = loadManifest(),
): { featureKey: string; items: MediaItem[] }[] {
  return Object.entries(m.projects[projectSlug] ?? {}).map(([featureKey, items]) => ({
    featureKey,
    items,
  }));
}

export function allItems(
  m: MediaManifest = loadManifest(),
): { projectSlug: string; featureKey: string; item: MediaItem }[] {
  const out: { projectSlug: string; featureKey: string; item: MediaItem }[] = [];
  for (const [projectSlug, features] of Object.entries(m.projects)) {
    for (const [featureKey, items] of Object.entries(features)) {
      for (const item of items) out.push({ projectSlug, featureKey, item });
    }
  }
  return out;
}
