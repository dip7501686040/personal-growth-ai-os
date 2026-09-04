import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgeDocuments, knowledgeLinks } from "@/lib/db/schema";
import { fetchEntityLabels } from "../entities";
import { TARGET_TYPE_LABEL } from "../target-types";
import { generateCandidates } from "./candidates";
import type { RationaleBudget } from "./rationale";
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
 * document. Never overwrites an existing link — `onConflictDoNothing` on
 * (document, target_type, target_id) means an already-`suggested`,
 * `accepted`, or `rejected` row is left untouched. Call `relinkDocument` to
 * refresh the not-yet-reviewed ones.
 */
export async function mapDocument(
  userId: string,
  documentId: string,
  opts?: { agentRunId?: string | null; llmBudget?: RationaleBudget },
): Promise<MapDocumentResult> {
  const [doc] = await db
    .select({
      id: knowledgeDocuments.id,
      title: knowledgeDocuments.title,
      body: knowledgeDocuments.body,
      sourceKind: knowledgeDocuments.sourceKind,
      sourceRef: knowledgeDocuments.sourceRef,
    })
    .from(knowledgeDocuments)
    .where(
      and(
        eq(knowledgeDocuments.userId, userId),
        eq(knowledgeDocuments.id, documentId),
      ),
    )
    .limit(1);
  if (!doc) return EMPTY_RESULT(documentId);

  const raw = await generateCandidates(userId, doc);
  const scored = raw.map(scoreCandidate).filter((c) => c.score >= SCORE_FLOOR);

  const idsByType = new Map<string, string[]>();
  for (const c of scored) {
    const arr = idsByType.get(c.targetType) ?? [];
    arr.push(c.targetId);
    idsByType.set(c.targetType, arr);
  }
  const labels = new Map<string, { label: string; text: string }>();
  for (const [type, ids] of idsByType) {
    const m = await fetchEntityLabels(
      userId,
      type as (typeof scored)[number]["targetType"],
      ids,
    );
    for (const [id, v] of m) labels.set(`${type}:${id}`, v);
  }

  const budget: RationaleBudget = opts?.llmBudget ?? { used: 0, max: 2 };
  const excerpt = doc.body.slice(0, 500);

  let inserted = 0;
  let autoAccepted = 0;
  for (const c of scored) {
    const info = labels.get(`${c.targetType}:${c.targetId}`);
    const targetLabel = info?.label ?? TARGET_TYPE_LABEL[c.targetType];

    const rationale = await rationaleFor({
      userId,
      agentRunId: opts?.agentRunId,
      candidate: c,
      targetLabel,
      targetText: info?.text ?? "",
      docTitle: doc.title,
      docExcerpt: excerpt,
      sourceRef: doc.sourceRef,
      budget,
    });

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

  return { documentId, candidates: scored.length, inserted, autoAccepted, tags };
}

/**
 * Clear this doc's not-yet-reviewed links and regenerate — a manual "re-map".
 * Never touches accepted/rejected rows (those are the user's decisions).
 */
export async function relinkDocument(
  userId: string,
  documentId: string,
  opts?: { agentRunId?: string | null; llmBudget?: RationaleBudget },
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
