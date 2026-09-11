"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserId } from "@/lib/user";
import { destroyAsset, uploadBuffer, type ResourceType } from "@/lib/media/cloudinary";
import {
  loadManifestFromR2,
  removeMediaItem,
  syncManifestToR2,
  updateMediaItem,
} from "@/lib/media/manifest";
import { deleteFile, getFile, putFile } from "@/modules/files/store";

export type ActionState = { ok: boolean; message: string } | null;

const err = (message: string): ActionState => ({ ok: false, message });

function revalidate() {
  revalidatePath("/media");
}

async function fileFromForm(formData: FormData, field = "file"): Promise<Buffer | null> {
  const f = formData.get(field);
  if (!(f instanceof File) || f.size === 0) return null;
  return Buffer.from(await f.arrayBuffer());
}

// ── Cloudinary assets ───────────────────────────────────────────────────────

const assetRefSchema = z.object({
  projectSlug: z.string().min(1),
  featureKey: z.string().min(1),
  cloudinaryId: z.string().min(1),
  resourceType: z.enum(["image", "video"]),
});

export async function updateCaptionAction(
  _prev: ActionState,
  input: { projectSlug: string; featureKey: string; cloudinaryId: string; caption: string },
): Promise<ActionState> {
  await requireUserId();
  const parsed = assetRefSchema
    .omit({ resourceType: true })
    .extend({ caption: z.string().max(300) })
    .safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0].message);
  const { projectSlug, featureKey, cloudinaryId, caption } = parsed.data;
  updateMediaItem(projectSlug, featureKey, cloudinaryId, { caption });
  await syncManifestToR2();
  revalidate();
  return { ok: true, message: "Caption updated." };
}

export async function reuploadAssetAction(formData: FormData): Promise<ActionState> {
  await requireUserId();
  const parsed = assetRefSchema.safeParse({
    projectSlug: formData.get("projectSlug"),
    featureKey: formData.get("featureKey"),
    cloudinaryId: formData.get("cloudinaryId"),
    resourceType: formData.get("resourceType"),
  });
  if (!parsed.success) return err(parsed.error.issues[0].message);
  const buffer = await fileFromForm(formData);
  if (!buffer) return err("No file selected.");

  const { projectSlug, featureKey, cloudinaryId, resourceType } = parsed.data;
  try {
    const up = await uploadBuffer(buffer, cloudinaryId, {
      resourceType,
      publicId: cloudinaryId,
      overwrite: true,
    });
    updateMediaItem(projectSlug, featureKey, cloudinaryId, {});
    const manifest = await loadManifestFromR2();
    const item = manifest.projects[projectSlug]?.[featureKey]?.find(
      (x) => x.cloudinaryId === cloudinaryId,
    );
    if (item) {
      item.format = up.format;
      item.width = up.width;
      item.height = up.height;
      item.duration = up.duration;
    }
    await syncManifestToR2(manifest);
    revalidate();
    return { ok: true, message: "Re-uploaded." };
  } catch (e) {
    return err(e instanceof Error ? e.message : "Re-upload failed.");
  }
}

export async function deleteAssetAction(
  _prev: ActionState,
  input: {
    projectSlug: string;
    featureKey: string;
    cloudinaryId: string;
    resourceType: ResourceType;
  },
): Promise<ActionState> {
  await requireUserId();
  const parsed = assetRefSchema.safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0].message);
  const { projectSlug, featureKey, cloudinaryId, resourceType } = parsed.data;
  try {
    await destroyAsset(cloudinaryId, resourceType);
  } catch (e) {
    // still remove from the manifest even if Cloudinary already lost it
    console.error("Cloudinary destroy failed:", e);
  }
  removeMediaItem(projectSlug, featureKey, cloudinaryId);
  await syncManifestToR2();
  revalidate();
  return {
    ok: true,
    message: "Deleted. Any content card or proof-bundle line referencing it will show a broken link until regenerated.",
  };
}

// ── my-files (R2) ────────────────────────────────────────────────────────────

const keySchema = z.string().min(1).max(300).regex(/^[^/][\S]*$/, "no leading slash");

export async function uploadFileAction(formData: FormData): Promise<ActionState> {
  await requireUserId();
  const keyParsed = keySchema.safeParse(formData.get("key"));
  if (!keyParsed.success) return err(keyParsed.error.issues[0].message);
  const buffer = await fileFromForm(formData);
  if (!buffer) return err("No file selected.");
  await putFile(keyParsed.data, buffer);
  revalidate();
  return { ok: true, message: `Saved ${keyParsed.data}.` };
}

export async function renameFileAction(
  _prev: ActionState,
  input: { oldKey: string; newKey: string },
): Promise<ActionState> {
  await requireUserId();
  const parsed = z.object({ oldKey: keySchema, newKey: keySchema }).safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0].message);
  const { oldKey, newKey } = parsed.data;
  if (oldKey === newKey) return err("New name is the same as the old one.");
  const body = await getFile(oldKey);
  if (!body) return err(`${oldKey} not found.`);
  await putFile(newKey, body);
  await deleteFile(oldKey);
  revalidate();
  return { ok: true, message: `Renamed to ${newKey}.` };
}

export async function deleteFileAction(
  _prev: ActionState,
  key: string,
): Promise<ActionState> {
  await requireUserId();
  const parsed = keySchema.safeParse(key);
  if (!parsed.success) return err(parsed.error.issues[0].message);
  await deleteFile(parsed.data);
  revalidate();
  return { ok: true, message: `Deleted ${parsed.data}.` };
}
