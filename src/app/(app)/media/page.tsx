import { requireUserId } from "@/lib/user";
import { isCloudinaryConfigured, mediaUrl, videoPosterUrl } from "@/lib/media/cloudinary";
import { allItems, loadManifestFromR2 } from "@/lib/media/manifest";
import { isR2Configured, listFiles } from "@/modules/files/store";
import { CloudinaryAssets } from "@/components/media/cloudinary-assets";
import { FilesList } from "@/components/media/files-list";

export const metadata = { title: "Media" };

export default async function MediaPage() {
  await requireUserId();

  const [manifest, fileKeys] = await Promise.all([
    loadManifestFromR2(),
    isR2Configured() ? listFiles() : Promise.resolve<string[]>([]),
  ]);
  const cloudinaryOk = isCloudinaryConfigured();
  const assets = allItems(manifest).map(({ projectSlug, featureKey, item }) => ({
    projectSlug,
    featureKey,
    ...item,
    previewUrl: cloudinaryOk
      ? item.resourceType === "video"
        ? videoPosterUrl(item.cloudinaryId)
        : mediaUrl(item.cloudinaryId, { resourceType: "image", format: item.format })
      : null,
  }));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-lg font-semibold">Media</h2>
        <p className="text-sm text-muted-foreground">
          Every uploaded asset, in one place — Cloudinary (visual proof) and
          the <code className="text-xs">my-files</code> R2 bucket
          (résumé-domain files).
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-semibold">Cloudinary assets</h3>
          <p className="text-xs text-muted-foreground">
            Diagrams, screenshots, and videos indexed in{" "}
            <code className="text-xs">resume/media-manifest.json</code>.
            {!isCloudinaryConfigured() && " CLOUDINARY_URL is not set."}
          </p>
        </div>
        <CloudinaryAssets assets={assets} />
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-semibold">Files (my-files / R2)</h3>
          <p className="text-xs text-muted-foreground">
            The résumé-domain source of truth — master résumé, profile,
            job-search config, and anything else that used to live in{" "}
            <code className="text-xs">resume/</code> in git.
            {!isR2Configured() && " R2 is not configured."}
          </p>
        </div>
        <FilesList fileKeys={fileKeys} />
      </section>
    </div>
  );
}
