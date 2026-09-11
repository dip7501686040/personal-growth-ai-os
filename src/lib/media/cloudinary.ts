/**
 * Minimal Cloudinary client — signed upload + delivery-URL builder, no SDK.
 * Used to store the visual proof (demo videos, screenshots, diagrams) that sits
 * next to the GitHub links in proof bundles and on the portfolio.
 *
 * Server / script only. Needs CLOUDINARY_URL = cloudinary://<key>:<secret>@<cloud>.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { env } from "@/lib/env";

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

export function isCloudinaryConfigured(): boolean {
  return Boolean(env.CLOUDINARY_URL);
}

export function cloudinaryConfig(): CloudinaryConfig {
  const raw = env.CLOUDINARY_URL;
  if (!raw) {
    throw new Error(
      "CLOUDINARY_URL not set — copy it from the Cloudinary dashboard " +
        "(cloudinary://<api_key>:<api_secret>@<cloud_name>) into .env.local.",
    );
  }
  const m = raw.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);
  if (!m) throw new Error("CLOUDINARY_URL is malformed.");
  return { apiKey: m[1], apiSecret: m[2], cloudName: m[3] };
}

export type ResourceType = "image" | "video";

/** kind → the Cloudinary resource_type it lives under. */
export function resourceTypeFor(kind: "video" | "screenshot" | "diagram"): ResourceType {
  return kind === "video" ? "video" : "image";
}

function sign(params: Record<string, string>, apiSecret: string): string {
  const toSign = Object.keys(params)
    .filter((k) => params[k] !== "" && k !== "file" && k !== "api_key")
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("sha1").update(toSign + apiSecret).digest("hex");
}

export interface UploadResult {
  publicId: string;
  resourceType: ResourceType;
  format: string;
  url: string;
  secureUrl: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  bytes: number;
}

export interface UploadOpts {
  resourceType: ResourceType;
  folder?: string;
  publicId?: string;
  caption?: string;
  overwrite?: boolean;
}

/** The real upload — from in-memory bytes, so the web UI (Group M) and the
 *  CLI (`pnpm media upload`) share one signing/fetch path. */
export async function uploadBuffer(
  buffer: Buffer | Uint8Array,
  filename: string,
  opts: UploadOpts,
): Promise<UploadResult> {
  const cfg = cloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const signed: Record<string, string> = { timestamp };
  if (opts.folder) signed.folder = opts.folder;
  if (opts.publicId) signed.public_id = opts.publicId;
  if (opts.overwrite) signed.overwrite = "true";
  if (opts.caption) {
    signed.context = `caption=${opts.caption.replace(/([|=])/g, "\\$1")}`;
  }
  const signature = sign(signed, cfg.apiSecret);

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)]), filename);
  form.append("api_key", cfg.apiKey);
  form.append("signature", signature);
  for (const [k, v] of Object.entries(signed)) form.append(k, v);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cfg.cloudName}/${opts.resourceType}/upload`,
    { method: "POST", body: form },
  );
  if (!res.ok) {
    throw new Error(`Cloudinary upload ${res.status}: ${await res.text()}`);
  }
  const j = (await res.json()) as {
    public_id: string;
    resource_type: ResourceType;
    format: string;
    url: string;
    secure_url: string;
    width?: number;
    height?: number;
    duration?: number;
    bytes: number;
  };
  return {
    publicId: j.public_id,
    resourceType: j.resource_type,
    format: j.format,
    url: j.url,
    secureUrl: j.secure_url,
    width: j.width ?? null,
    height: j.height ?? null,
    duration: j.duration ?? null,
    bytes: j.bytes,
  };
}

/** CLI convenience — reads a local file, then `uploadBuffer`. */
export async function uploadMedia(filePath: string, opts: UploadOpts): Promise<UploadResult> {
  return uploadBuffer(readFileSync(filePath), basename(filePath), opts);
}

/** Admin API delete — removes the asset from Cloudinary entirely. */
export async function destroyAsset(
  publicId: string,
  resourceType: ResourceType,
): Promise<void> {
  const cfg = cloudinaryConfig();
  const auth = Buffer.from(`${cfg.apiKey}:${cfg.apiSecret}`).toString("base64");
  const url = new URL(
    `https://api.cloudinary.com/v1_1/${cfg.cloudName}/resources/${resourceType}/upload`,
  );
  url.searchParams.append("public_ids[]", publicId);
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) {
    throw new Error(`Cloudinary destroy ${res.status}: ${await res.text()}`);
  }
}

/** A delivery URL for a stored asset. `transform` is a raw Cloudinary segment. */
export function mediaUrl(
  publicId: string,
  opts: { resourceType: ResourceType; format?: string; transform?: string } = {
    resourceType: "image",
  },
): string {
  const cfg = cloudinaryConfig();
  const t = opts.transform ? `${opts.transform}/` : "";
  const ext = opts.format ? `.${opts.format}` : "";
  return `https://res.cloudinary.com/${cfg.cloudName}/${opts.resourceType}/upload/${t}${publicId}${ext}`;
}

/** A still poster frame for a stored video. */
export function videoPosterUrl(publicId: string): string {
  return mediaUrl(publicId, {
    resourceType: "video",
    format: "jpg",
    transform: "so_0",
  });
}
