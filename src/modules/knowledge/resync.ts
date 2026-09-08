import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { entityEmbeddings, knowledgeLinks } from "@/lib/db/schema";
import { listDocumentsForMapping } from "@/lib/knowledge";
import { drainContextEvents } from "@/modules/ingestion/refresh";
import { backfillEntityEmbeddings, embedEntity, getEntityWatermark } from "./entities";
import { mapDocument } from "./mapping";
import { linkEntityToSkills, type EntitySkillSourceType } from "./entity-skill-links";
import { DECISION_TARGET_TYPES, type KnowledgeTargetType } from "./target-types";

/**
 * Phase 6 — the whole knowledge-freshness mechanism now that
 * `knowledge-refresh` / `knowledge-map` / `ingest-drain` are no longer
 * scheduled. Every mutation that changes something the knowledge base should
 * reflect calls `bestEffortResync` (or, for the polymorphic
 * career/content/business entities, `resyncEntity` / `purgePolymorphicRefs`).
 * The durable `context_events` outbox is still the safety net: a failed resync
 * leaves rows undrained for the next call or `pnpm knowledge:resync`.
 */

export interface RemapResult {
  scanned: number;
  mapped: number;
  skipped: number;
  links: number;
  autoAccepted: number;
}

/**
 * Re-map documents whose content changed since they were last mapped, or that
 * predate the current entity corpus (watermark). `full: true` re-maps every
 * non-superseded doc. Bounded by wall-clock time so an inline call stays
 * snappy; the manual `--all` path passes a long deadline.
 */
export async function remapStaleDocuments(
  userId: string,
  opts: { full?: boolean; deadlineMs?: number } = {},
): Promise<RemapResult> {
  const watermark = await getEntityWatermark(userId);
  const deadline = Date.now() + (opts.deadlineMs ?? 8_000);
  const res: RemapResult = { scanned: 0, mapped: 0, skipped: 0, links: 0, autoAccepted: 0 };

  let cursor: string | null = null;
  while (Date.now() < deadline) {
    const page = await listDocumentsForMapping(userId, { cursor, limit: 50 });
    if (page.items.length === 0) break;
    for (const d of page.items) {
      if (Date.now() >= deadline) break;
      res.scanned++;
      const stale =
        opts.full ||
        !d.lastMappedAt ||
        d.lastMappedAt < d.updatedAt ||
        d.lastMappedAt < watermark;
      if (!stale) {
        res.skipped++;
        continue;
      }
      const r = await mapDocument(userId, d.id);
      res.mapped++;
      res.links += r.inserted;
      res.autoAccepted += r.autoAccepted;
    }
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  return res;
}

export interface ResyncResult {
  events: number;
  docs: number;
  chunks: number;
  remap: RemapResult;
}

/**
 * Drain the outbox → rebuild/refresh internal docs, re-embed changed entities,
 * then re-map stale documents. This is `knowledge-refresh` + `knowledge-map`
 * combined, run inline. Cheap when nothing changed (hash guards throughout).
 */
export async function resyncKnowledge(
  userId: string,
  opts: { full?: boolean } = {},
): Promise<ResyncResult> {
  // Inline calls stay snappy (small outbox bite, decision-tier embeddings only,
  // short remap deadline); the manual `--all` path clears whatever has piled up
  // and re-embeds every entity type.
  const drained = await drainContextEvents(userId, opts.full ? 200 : 15);
  const embedded = await backfillEntityEmbeddings(
    userId,
    opts.full ? undefined : DECISION_TARGET_TYPES,
  );
  const changed = embedded.reduce((n, e) => n + e.embedded, 0);

  // Nothing new distilled and no entity vector moved → nothing to re-map
  // (the incremental path only maps against a changed corpus). `--all` always
  // does the full sweep.
  const noop = !opts.full && drained.documents === 0 && changed === 0;
  const remap = noop
    ? { scanned: 0, mapped: 0, skipped: 0, links: 0, autoAccepted: 0 }
    : await remapStaleDocuments(userId, {
        full: opts.full,
        deadlineMs: opts.full ? 120_000 : 6_000,
      });
  return { events: drained.processed, docs: drained.documents, chunks: drained.chunks, remap };
}

/** Fire-and-forget resync for a mutation handler. Never throws — a failure just
 *  leaves the outbox for the next call. Awaited so the caller's
 *  `revalidatePath` reflects the new links, but wrapped so it can't break the
 *  originating write. */
export async function bestEffortResync(userId: string): Promise<void> {
  try {
    await resyncKnowledge(userId);
  } catch (err) {
    console.warn(
      "[bestEffortResync] skipped:",
      err instanceof Error ? err.message : err,
    );
  }
}

// ── polymorphic entities (content_item; career/business are out of the graph) ──

const POLY_SOURCE: Partial<Record<KnowledgeTargetType, EntitySkillSourceType>> = {
  content_item: "content_item",
};

/**
 * Re-embed a polymorphic entity and recompute its skill/feature links from the
 * given canonical text. Used when a **published** content item is created or
 * edited (drafts never enter the graph — see docs §"Exclusion invariant" /
 * plan §6c). Best-effort.
 */
export async function resyncEntity(
  userId: string,
  targetType: KnowledgeTargetType,
  id: string,
  text: string,
): Promise<void> {
  try {
    await embedEntity(userId, targetType, id, text);
    const src = POLY_SOURCE[targetType];
    if (src) await linkEntityToSkills(userId, src, id, text);
  } catch (err) {
    console.warn(
      "[resyncEntity] skipped:",
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Drop a polymorphic entity's cached graph edges — its `entity_embeddings`
 * vector, its `entity_skill_links`, and any not-yet-reviewed `knowledge_links`
 * pointing at it. Called before a content/career/business row is deleted (their
 * deletes are bare `DELETE FROM <table>` with no FK cascade to these tables),
 * and when a content item leaves `published`.
 */
export async function purgePolymorphicRefs(
  userId: string,
  targetType: KnowledgeTargetType,
  id: string,
): Promise<void> {
  await db
    .delete(entityEmbeddings)
    .where(
      and(
        eq(entityEmbeddings.userId, userId),
        eq(entityEmbeddings.targetType, targetType),
        eq(entityEmbeddings.targetId, id),
      ),
    );
  await db.execute(
    sql`delete from entity_skill_links where user_id = ${userId} and (
      (source_type::text = ${targetType} and source_id = ${id})
      or (target_type::text = ${targetType} and target_id = ${id})
    )`,
  );
  await db
    .delete(knowledgeLinks)
    .where(
      and(
        eq(knowledgeLinks.userId, userId),
        eq(knowledgeLinks.targetType, targetType),
        eq(knowledgeLinks.targetId, id),
        eq(knowledgeLinks.status, "suggested"),
      ),
    );
}
