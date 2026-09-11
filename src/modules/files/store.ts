/**
 * `my-files` R2 bucket — the source of truth for every résumé-domain file
 * (master.json, profile.json, job-search.json, media-manifest.json, and
 * anything else that used to live under resume/ in git). Same account as
 * the `applications` bucket, different bucket, generic keys (no date/folder
 * nesting) — e.g. "resume/master.json", "resume/profile.json".
 *
 * Server-only.
 */
import { env } from "@/lib/env";
import * as r2 from "@/lib/r2/client";

export { contentTypeFor, isR2Configured } from "@/lib/r2/client";

function bucket(): string {
  return env.R2_FILES_BUCKET || "my-files";
}

export async function putFile(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType?: string,
): Promise<void> {
  return r2.putObject(bucket(), key, body, contentType);
}

export async function getFile(key: string): Promise<Buffer | null> {
  return r2.getObject(bucket(), key);
}

export async function getFileText(key: string): Promise<string | null> {
  return r2.getText(bucket(), key);
}

export async function fileExists(key: string): Promise<boolean> {
  return r2.objectExists(bucket(), key);
}

/** Every key under `prefix` (default: the whole bucket). */
export async function listFiles(prefix = ""): Promise<string[]> {
  return r2.listKeys(bucket(), prefix);
}

/** Immediate "sub-folders" under `prefix`, as prefixes ending in "/". */
export async function listFileFolders(prefix = ""): Promise<string[]> {
  return r2.listFolders(bucket(), prefix);
}

export async function deleteFile(key: string): Promise<void> {
  return r2.deleteObject(bucket(), key);
}
