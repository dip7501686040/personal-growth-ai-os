/**
 * resume/media-manifest.json — the index of visual proof.
 * Shape: projectSlug → featureKey → MediaItem[]. Committed (an index, not secrets).
 *
 * Server / script only.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { getFileText, isR2Configured, putFile } from "@/modules/files/store";

/**
 * The manifest is mirrored to the `my-files` R2 bucket (same one as every
 * other resume-domain file — Group R) so the deployed public API can serve a
 * freshly-uploaded item within its revalidate window — no git push / redeploy
 * needed for new media. The local file stays the dev fallback / git backup.
 */
const R2_KEY = "resume/media-manifest.json";

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

/** Mirror the manifest to R2 so a deployed reader sees new items without a git push. */
export async function syncManifestToR2(m: MediaManifest = loadManifest()): Promise<boolean> {
  if (!isR2Configured()) return false;
  try {
    await putFile(R2_KEY, JSON.stringify(m, null, 2), "application/json");
    return true;
  } catch {
    return false; // bucket not provisioned / not reachable yet
  }
}

/** R2 (fresh, no deploy needed) when configured, else the local committed file. */
export async function loadManifestFromR2(): Promise<MediaManifest> {
  if (isR2Configured()) {
    try {
      const text = await getFileText(R2_KEY);
      if (text != null) return manifestSchema.parse(JSON.parse(text));
    } catch {
      // bucket not provisioned / not reachable yet — fall through to local
    }
  }
  return loadManifest();
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

/** Remove one item by its Cloudinary public ID (Group M — /media delete). */
export function removeMediaItem(
  projectSlug: string,
  featureKey: string,
  cloudinaryId: string,
): MediaManifest {
  const m = loadManifest();
  const list = m.projects[projectSlug]?.[featureKey];
  if (list) {
    m.projects[projectSlug][featureKey] = list.filter(
      (x) => x.cloudinaryId !== cloudinaryId,
    );
    if (m.projects[projectSlug][featureKey].length === 0) {
      delete m.projects[projectSlug][featureKey];
    }
    if (Object.keys(m.projects[projectSlug]).length === 0) {
      delete m.projects[projectSlug];
    }
  }
  saveManifest(m);
  return m;
}

/** Patch one item's editable fields (caption today) without touching the asset. */
export function updateMediaItem(
  projectSlug: string,
  featureKey: string,
  cloudinaryId: string,
  patch: Partial<Pick<MediaItem, "caption">>,
): MediaManifest {
  const m = loadManifest();
  const list = m.projects[projectSlug]?.[featureKey];
  const item = list?.find((x) => x.cloudinaryId === cloudinaryId);
  if (item) Object.assign(item, patch);
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
