/**
 * Cloudflare R2 (S3-compatible) primitives, parameterized by bucket. The
 * account-level client is shared; every call names which bucket it targets.
 *
 * `src/modules/applications/store.ts` (bucket `applications`) and
 * `src/modules/files/store.ts` (bucket `my-files`) are thin, bucket-bound
 * wrappers over this. Server-only.
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

export function r2Client(): S3Client {
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
  ".svg": "image/svg+xml",
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
};

export function contentTypeFor(key: string): string {
  const dot = key.lastIndexOf(".");
  const ext = dot >= 0 ? key.slice(dot).toLowerCase() : "";
  return CONTENT_TYPE[ext] ?? "application/octet-stream";
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
  bucket: string,
  key: string,
  body: Buffer | Uint8Array | string,
  contentType?: string,
): Promise<void> {
  await r2Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: typeof body === "string" ? Buffer.from(body, "utf8") : body,
      ContentType: contentType ?? contentTypeFor(key),
    }),
  );
}

export async function getObject(bucket: string, key: string): Promise<Buffer | null> {
  try {
    const r = await r2Client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!r.Body) return null;
    return Buffer.from(await r.Body.transformToByteArray());
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}

export async function getText(bucket: string, key: string): Promise<string | null> {
  const b = await getObject(bucket, key);
  return b ? b.toString("utf8") : null;
}

export async function objectExists(bucket: string, key: string): Promise<boolean> {
  try {
    await r2Client().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (e) {
    if (isNotFound(e)) return false;
    throw e;
  }
}

export async function listKeys(bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = [];
  let token: string | undefined;
  do {
    const r = await r2Client().send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
    );
    for (const o of r.Contents ?? []) if (o.Key) out.push(o.Key);
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return out.sort();
}

export async function listFolders(bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = [];
  let token: string | undefined;
  do {
    const r = await r2Client().send(
      new ListObjectsV2Command({
        Bucket: bucket,
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

export async function deleteObject(bucket: string, key: string): Promise<void> {
  await r2Client().send(
    new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: [{ Key: key }], Quiet: true } }),
  );
}

export async function deletePrefix(bucket: string, prefix: string): Promise<number> {
  if (!prefix) throw new Error("deletePrefix: refusing to delete an entire bucket");
  const keys = await listKeys(bucket, prefix);
  if (keys.length === 0) return 0;
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    await r2Client().send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }
  return keys.length;
}
