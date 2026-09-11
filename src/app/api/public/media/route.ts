import { NextResponse } from "next/server";
import { mediaUrl, videoPosterUrl, isCloudinaryConfigured } from "@/lib/media/cloudinary";
import { allItems, loadManifestFromR2 } from "@/lib/media/manifest";

export const revalidate = 300;

export interface PublicMediaItem {
  projectSlug: string;
  /** matches PublicFeature.featureSlug from /api/public/features */
  featureKey: string;
  kind: "video" | "screenshot" | "diagram";
  /** display image — the still/poster for a video, the image itself otherwise */
  url: string;
  /** the underlying video, only set when kind === "video" */
  videoUrl: string | null;
  caption: string;
  width: number | null;
  height: number | null;
}

/** Unauthenticated. Visual proof (resume/media-manifest.json, mirrored to R2
 *  by `pnpm media upload`) for the portfolio's case-study content grids. */
export async function GET() {
  const manifest = await loadManifestFromR2();
  const items: PublicMediaItem[] = isCloudinaryConfigured()
    ? allItems(manifest).map(({ projectSlug, featureKey, item }) => ({
        projectSlug,
        featureKey,
        kind: item.kind,
        url:
          item.resourceType === "video"
            ? videoPosterUrl(item.cloudinaryId)
            : mediaUrl(item.cloudinaryId, {
                resourceType: "image",
                format: item.format,
              }),
        videoUrl:
          item.resourceType === "video"
            ? mediaUrl(item.cloudinaryId, {
                resourceType: "video",
                format: item.format,
              })
            : null,
        caption: item.caption,
        width: item.width,
        height: item.height,
      }))
    : [];
  return NextResponse.json(
    { items },
    { headers: { "access-control-allow-origin": "*" } },
  );
}
