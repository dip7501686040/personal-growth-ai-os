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
 * Server-only. Do not import from a "use client" module.
 */
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env } from "@/lib/env";

let cached: S3Client | null = null;

export function isR2Configured(): boolean {
  return Boolean(
    env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY,
  );
}

function client(): S3Client {
  if (cached) return cached;
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error(
      "R2 is not configured — set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and " +
        "R2_SECRET_ACCESS_KEY in .env.local (see .env.example).",
    );
  }
  cached = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
    // R2 rejects the AWS SDK's default flexible-checksum trailers on some
    // requests — only send/validate them when the operation actually requires it.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return cached;
}

function bucket(): string {
  return env.R2_BUCKET || "applications";
}

const CONTENT_TYPE: Record<string, string> = {
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json",
  ".pdf": "application/pdf",
  ".html": "text/html; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export function contentTypeFor(key: string): string {
  const dot = key.lastIndexOf(".");
  const ext = dot >= 0 ? key.slice(dot).toLowerCase() : "";
  return CONTENT_TYPE[ext] ?? "application/octet-stream";
}

/** Build an object key from its three path parts. */
export function keyFor(date: string, folder: string, file: string): string {
  return `${date}/${folder}/${file}`;
}

function isNotFound(e: unknown): boolean {
  const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    err?.name === "NoSuchKey" ||
    err?.name === "NotFound" ||
    err?.$metadata?.httpStatusCode === 404
  );
}

export async function putObject(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType?: string,
): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: typeof body === "string" ? Buffer.from(body, "utf8") : body,
      ContentType: contentType ?? contentTypeFor(key),
    }),
  );
}

export async function getObject(key: string): Promise<Buffer | null> {
  try {
    const r = await client().send(
      new GetObjectCommand({ Bucket: bucket(), Key: key }),
    );
    if (!r.Body) return null;
    return Buffer.from(await r.Body.transformToByteArray());
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}

export async function getText(key: string): Promise<string | null> {
  const b = await getObject(key);
  return b ? b.toString("utf8") : null;
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await client().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return true;
  } catch (e) {
    if (isNotFound(e)) return false;
    throw e;
  }
}

/** Every object key under `prefix`, following pagination. */
export async function listKeys(prefix: string): Promise<string[]> {
  const out: string[] = [];
  let token: string | undefined;
  do {
    const r = await client().send(
      new ListObjectsV2Command({
        Bucket: bucket(),
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const o of r.Contents ?? []) if (o.Key) out.push(o.Key);
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return out.sort();
}

/**
 * Immediate "sub-folders" under `prefix` (which must end in `/` or be ""), as
 * full prefixes ending in `/`. Uses the S3 delimiter so it doesn't walk the
 * whole tree.
 */
export async function listFolders(prefix: string): Promise<string[]> {
  const out: string[] = [];
  let token: string | undefined;
  do {
    const r = await client().send(
      new ListObjectsV2Command({
        Bucket: bucket(),
        Prefix: prefix,
        Delimiter: "/",
        ContinuationToken: token,
      }),
    );
    for (const p of r.CommonPrefixes ?? []) if (p.Prefix) out.push(p.Prefix);
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return out.sort();
}

/** Delete every object under `prefix`. Returns how many were removed. */
export async function deletePrefix(prefix: string): Promise<number> {
  if (!prefix) throw new Error("deletePrefix: refusing to delete the whole bucket");
  const keys = await listKeys(prefix);
  if (keys.length === 0) return 0;
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    await client().send(
      new DeleteObjectsCommand({
        Bucket: bucket(),
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }
  return keys.length;
}
