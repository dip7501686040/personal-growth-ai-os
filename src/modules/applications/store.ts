/**
 * Cloudflare R2 (S3-compatible) object store — the source of truth for the
 * per-job application folders. Key scheme:
 *
 *     <date>/<company>__<role>/<file>        e.g. 2026-09-09/quill__fullstack-swe/resume.pdf
 *
 * The bucket itself (default name `applications`) is the applications root, so
 * keys carry no extra prefix. Local `applications/` is a working cache synced
 * with `pnpm apply push|pull`; the `/applications` page reads and writes R2.
 *
 * Thin, bucket-bound wrapper over `@/lib/r2/client` — see that module for the
 * account-level client and generic primitives. Server-only.
 */
import { env } from "@/lib/env";
import * as r2 from "@/lib/r2/client";

export { contentTypeFor, isR2Configured } from "@/lib/r2/client";

function bucket(): string {
  return env.R2_BUCKET || "applications";
}

/** Build an object key from its three path parts. */
export function keyFor(date: string, folder: string, file: string): string {
  return `${date}/${folder}/${file}`;
}

export async function putObject(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType?: string,
): Promise<void> {
  return r2.putObject(bucket(), key, body, contentType);
}

export async function getObject(key: string): Promise<Buffer | null> {
  return r2.getObject(bucket(), key);
}

export async function getText(key: string): Promise<string | null> {
  return r2.getText(bucket(), key);
}

export async function objectExists(key: string): Promise<boolean> {
  return r2.objectExists(bucket(), key);
}

/** Every object key under `prefix`, following pagination. */
export async function listKeys(prefix: string): Promise<string[]> {
  return r2.listKeys(bucket(), prefix);
}

/**
 * Immediate "sub-folders" under `prefix` (which must end in `/` or be ""), as
 * full prefixes ending in `/`. Uses the S3 delimiter so it doesn't walk the
 * whole tree.
 */
export async function listFolders(prefix: string): Promise<string[]> {
  return r2.listFolders(bucket(), prefix);
}

/** Delete every object under `prefix`. Returns how many were removed. */
export async function deletePrefix(prefix: string): Promise<number> {
  return r2.deletePrefix(bucket(), prefix);
}
