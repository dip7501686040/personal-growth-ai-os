/**
 * Store a piece of visual proof on Cloudinary and index it in
 * resume/media-manifest.json.
 *
 *   pnpm media upload <file> --project <slug> --feature <key> --kind screenshot|video|diagram
 *                            [--caption "..."] [--id <publicId>]
 *   pnpm media list [--project <slug>]
 *
 * You record / screenshot / draw the media; this only stores + indexes it.
 */
import { existsSync } from "node:fs";
import { basename, extname } from "node:path";
import {
  isCloudinaryConfigured,
  mediaUrl,
  resourceTypeFor,
  uploadMedia,
  videoPosterUrl,
} from "@/lib/media/cloudinary";
import {
  addMediaItem,
  allItems,
  itemsForProject,
  type MediaItem,
} from "@/lib/media/manifest";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

async function uploadCmd() {
  const file = process.argv[3];
  if (!file || file.startsWith("--")) {
    throw new Error(
      "usage: pnpm media upload <file> --project <slug> --feature <key> --kind screenshot|video|diagram [--caption ...] [--id ...]",
    );
  }
  if (!existsSync(file)) throw new Error(`no such file: ${file}`);
  if (!isCloudinaryConfigured()) {
    throw new Error("CLOUDINARY_URL not set in .env.local (see .env.example).");
  }

  const project = arg("--project");
  const feature = arg("--feature");
  const kind = arg("--kind") as "video" | "screenshot" | "diagram" | undefined;
  if (!project || !feature || !kind) {
    throw new Error("--project, --feature and --kind are all required");
  }
  if (!["video", "screenshot", "diagram"].includes(kind)) {
    throw new Error("--kind must be video | screenshot | diagram");
  }

  const projectSlug = slug(project);
  const featureKey = slug(feature);
  const resourceType = resourceTypeFor(kind);
  const publicId =
    arg("--id") ??
    `pgai/${projectSlug}/${featureKey}-${slug(basename(file, extname(file)))}`;

  const up = await uploadMedia(file, {
    resourceType,
    publicId,
    caption: arg("--caption"),
    overwrite: true,
  });

  const item: MediaItem = {
    kind,
    resourceType: up.resourceType,
    cloudinaryId: up.publicId,
    format: up.format,
    caption: arg("--caption") ?? "",
    width: up.width,
    height: up.height,
    duration: up.duration,
    addedAt: new Date().toISOString(),
  };
  addMediaItem(projectSlug, featureKey, item);

  console.log(
    `stored ${kind} → ${projectSlug} / ${featureKey}\n` +
      `  cloudinaryId: ${up.publicId}\n` +
      `  url:   ${up.secureUrl}\n` +
      (up.resourceType === "video"
        ? `  poster: ${videoPosterUrl(up.publicId)}\n`
        : `  thumb: ${mediaUrl(up.publicId, { resourceType: "image", format: "jpg", transform: "c_fill,w_640" })}\n`) +
      `  → resume/media-manifest.json`,
  );
}

function listCmd() {
  const project = arg("--project");
  if (project) {
    const rows = itemsForProject(slug(project));
    if (!rows.length) {
      console.log(`(no media for ${slug(project)})`);
      return;
    }
    for (const { featureKey, items } of rows) {
      console.log(`\n${featureKey}`);
      for (const it of items) {
        console.log(`  ${it.kind.padEnd(10)} ${it.cloudinaryId}  ${it.caption}`);
      }
    }
    return;
  }
  const all = allItems();
  if (!all.length) {
    console.log("(manifest is empty)");
    return;
  }
  for (const { projectSlug, featureKey, item } of all) {
    console.log(
      `${projectSlug} / ${featureKey}  ·  ${item.kind}  ·  ${item.cloudinaryId}`,
    );
  }
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === "upload") return uploadCmd();
  if (cmd === "list") return listCmd();
  throw new Error("commands: upload | list");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
