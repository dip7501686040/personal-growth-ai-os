import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgeDocuments, knowledgeLinks } from "@/lib/db/schema";
import { fetchEntityLabels } from "../entities";
import { TARGET_TYPE_LABEL } from "../target-types";
import { generateCandidates } from "./candidates";
import { rationaleFor } from "./rationale";
import { scoreCandidate, SCORE_FLOOR } from "./score";
import { classifyDocumentTags } from "./tags";

export interface MapDocumentResult {
  documentId: string;
  candidates: number;
  inserted: number;
  autoAccepted: number;
  tags: number;
}

const EMPTY_RESULT = (documentId: string): MapDocumentResult => ({
  documentId,
  candidates: 0,
  inserted: 0,
  autoAccepted: 0,
  tags: 0,
});

/**
 * Generate + score + persist knowledge_links (and taxonomy tags) for one
 * document. Never overwrites an existing link — a candidate that already has
 * a row (suggested, accepted, or rejected) is skipped before any work is done
 * on it, not just at insert time. Call `relinkDocument` to refresh the
 * not-yet-reviewed ones.
 */
export async function mapDocument(
  userId: string,
  documentId: string,
  opts?: { agentRunId?: string | null },
): Promise<MapDocumentResult> {
  const [doc] = await db
    .select({
      id: knowledgeDocuments.id,
      title: knowledgeDocuments.title,
      body: knowledgeDocuments.body,
      sourceKind: knowledgeDocuments.sourceKind,
      sourceRef: knowledgeDocuments.sourceRef,
      supersededAt: knowledgeDocuments.supersededAt,
    })
    .from(knowledgeDocuments)
    .where(
      and(
        eq(knowledgeDocuments.userId, userId),
        eq(knowledgeDocuments.id, documentId),
      ),
    )
    .limit(1);
  // a duplicate marked superseded right after embedding (Phase 4) is never
  // mapped, even if a caller still holds its id from before that check ran
  if (!doc || doc.supersededAt) return EMPTY_RESULT(documentId);

  const raw = await generateCandidates(userId, doc);
  const scored = raw.map(scoreCandidate).filter((c) => c.score >= SCORE_FLOOR);

  // Skip anything that already has a row — cheap up front, so no candidate
  // that would just hit onConflictDoNothing pays for a label lookup either.
  const existing = await db
    .select({
      targetType: knowledgeLinks.targetType,
      targetId: knowledgeLinks.targetId,
    })
    .from(knowledgeLinks)
    .where(eq(knowledgeLinks.documentId, documentId));
  const existingKeys = new Set(existing.map((e) => `${e.targetType}:${e.targetId}`));
  const fresh = scored.filter((c) => !existingKeys.has(`${c.targetType}:${c.targetId}`));

  const idsByType = new Map<string, string[]>();
  for (const c of fresh) {
    const arr = idsByType.get(c.targetType) ?? [];
    arr.push(c.targetId);
    idsByType.set(c.targetType, arr);
  }
  const labels = new Map<string, { label: string; text: string }>();
  for (const [type, ids] of idsByType) {
    const m = await fetchEntityLabels(
      userId,
      type as (typeof fresh)[number]["targetType"],
      ids,
    );
    for (const [id, v] of m) labels.set(`${type}:${id}`, v);
  }

  let inserted = 0;
  let autoAccepted = 0;
  for (const c of fresh) {
    const info = labels.get(`${c.targetType}:${c.targetId}`);
    const targetLabel = info?.label ?? TARGET_TYPE_LABEL[c.targetType];
    const rationale = rationaleFor(c, targetLabel, doc.sourceRef);

    const [row] = await db
      .insert(knowledgeLinks)
      .values({
        userId,
        documentId,
        targetType: c.targetType,
        targetId: c.targetId,
        relation: c.relation,
        score: c.score,
        method: c.method,
        rationale,
        status: c.autoAccept ? "accepted" : "suggested",
        createdBy: "agent",
        agentRunId: opts?.agentRunId ?? null,
        decidedAt: c.autoAccept ? new Date() : null,
      })
      .onConflictDoNothing({
        target: [
          knowledgeLinks.documentId,
          knowledgeLinks.targetType,
          knowledgeLinks.targetId,
        ],
      })
      .returning({ id: knowledgeLinks.id });

    if (row) {
      inserted++;
      if (c.autoAccept) autoAccepted++;
    }
  }

  const tags = await classifyDocumentTags(userId, doc);

  // Record that this doc has seen the current entity corpus — lets the
  // nightly sweep skip it next time until either changes (Phase 3).
  await db
    .update(knowledgeDocuments)
    .set({ lastMappedAt: new Date() })
    .where(eq(knowledgeDocuments.id, documentId));

  return { documentId, candidates: fresh.length, inserted, autoAccepted, tags };
}

/**
 * Clear this doc's not-yet-reviewed links and regenerate — a manual "re-map".
 * Never touches accepted/rejected rows (those are the user's decisions).
 */
export async function relinkDocument(
  userId: string,
  documentId: string,
  opts?: { agentRunId?: string | null },
): Promise<MapDocumentResult> {
  await db
    .delete(knowledgeLinks)
    .where(
      and(
        eq(knowledgeLinks.userId, userId),
        eq(knowledgeLinks.documentId, documentId),
        eq(knowledgeLinks.status, "suggested"),
      ),
    );
  return mapDocument(userId, documentId, opts);
}
