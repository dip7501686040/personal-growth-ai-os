import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { ingestionSources, type IngestionSource } from "@/lib/db/schema";
import { enqueueJob } from "../queue";
import { gitHubConnector } from "./github";
import type { SourceConnector } from "./types";

export type { RawDoc, SourceConnector, FetchResult } from "./types";
export { GitHubConnector, gitHubConnector } from "./github";
export {
  ingestUpload,
  parseUpload,
  UPLOAD_CATEGORIES,
  type UploadCategory,
} from "./upload";

const CONNECTORS: Record<string, SourceConnector> = {
  github_repo: gitHubConnector,
};

export function getConnector(kind: string): SourceConnector | null {
  return CONNECTORS[kind] ?? null;
}

// ── ingestion_sources CRUD ────────────────────────────────────────────────

export async function addSource(input: {
  userId: string;
  kind: string;
  externalRef: string;
  config?: Record<string, unknown>;
}): Promise<IngestionSource> {
  const [row] = await db
    .insert(ingestionSources)
    .values({
      userId: input.userId,
      kind: input.kind,
      externalRef: input.externalRef,
      config: (input.config ?? {}) as object,
      status: "active",
    })
    .onConflictDoNothing({
      target: [
        ingestionSources.userId,
        ingestionSources.kind,
        ingestionSources.externalRef,
      ],
    })
    .returning();
  if (row) return row;
  const [existing] = await db
    .select()
    .from(ingestionSources)
    .where(
      and(
        eq(ingestionSources.userId, input.userId),
        eq(ingestionSources.kind, input.kind),
        eq(ingestionSources.externalRef, input.externalRef),
      ),
    )
    .limit(1);
  return existing;
}

export function listSources(
  userId: string,
  kind?: string,
): Promise<IngestionSource[]> {
  return db
    .select()
    .from(ingestionSources)
    .where(
      kind
        ? and(
            eq(ingestionSources.userId, userId),
            eq(ingestionSources.kind, kind),
          )
        : eq(ingestionSources.userId, userId),
    )
    .orderBy(desc(ingestionSources.createdAt));
}

export async function removeSource(userId: string, id: string): Promise<void> {
  await db
    .delete(ingestionSources)
    .where(
      and(eq(ingestionSources.userId, userId), eq(ingestionSources.id, id)),
    );
}

// ── sync ──────────────────────────────────────────────────────────────────

export interface SyncOneResult {
  sourceId: string;
  ref: string;
  enqueued: number;
  deduped: number;
  error?: string;
}

export async function runSourceSync(
  userId: string,
  sourceId: string,
): Promise<SyncOneResult> {
  const [source] = await db
    .select()
    .from(ingestionSources)
    .where(
      and(
        eq(ingestionSources.userId, userId),
        eq(ingestionSources.id, sourceId),
      ),
    )
    .limit(1);
  if (!source) throw new Error("Source not found");

  const connector = getConnector(source.kind);
  if (!connector) throw new Error(`No connector for "${source.kind}"`);

  try {
    const { docs, cursor } = await connector.fetchSince(source);
    let enqueued = 0;
    let deduped = 0;
    for (const d of docs) {
      const { deduped: wasDup } = await enqueueJob({
        userId,
        sourceId: source.id,
        kind: d.kind,
        dedupeKey: d.dedupeKey,
        payload: d.payload,
      });
      if (wasDup) deduped++;
      else enqueued++;
    }
    await db
      .update(ingestionSources)
      .set({
        lastCursor: cursor,
        lastSyncedAt: new Date(),
        status: "active",
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(ingestionSources.id, source.id));
    return { sourceId: source.id, ref: source.externalRef ?? "", enqueued, deduped };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(ingestionSources)
      .set({ status: "error", error: msg.slice(0, 2000), updatedAt: new Date() })
      .where(eq(ingestionSources.id, source.id));
    return {
      sourceId: source.id,
      ref: source.externalRef ?? "",
      enqueued: 0,
      deduped: 0,
      error: msg,
    };
  }
}

export async function syncSources(
  userId: string,
  kind?: string,
): Promise<{ sources: number; enqueued: number; deduped: number; errors: number }> {
  const sources = (await listSources(userId, kind)).filter(
    (s) => s.status !== "paused",
  );
  let enqueued = 0;
  let deduped = 0;
  let errors = 0;
  for (const s of sources) {
    const r = await runSourceSync(userId, s.id);
    enqueued += r.enqueued;
    deduped += r.deduped;
    if (r.error) errors++;
  }
  return { sources: sources.length, enqueued, deduped, errors };
}
