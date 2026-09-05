import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  activityAnalyses,
  contextEvents,
  learningSessions,
  projectFeatures,
  projects,
  skills,
  type ContextEvent,
} from "@/lib/db/schema";
import {
  checkCrossSourceDuplicate,
  embedDocument,
  upsertDocumentRow,
  type UpsertDocInput,
} from "@/lib/knowledge";
import { mapDocument } from "@/modules/knowledge/mapping";

interface DocSpec {
  docType: UpsertDocInput["docType"];
  title: string;
  body: string;
  sourceRef: string;
}

/** Turn one outbox row into a knowledge-document spec (deterministic, no LLM). */
async function specFor(
  userId: string,
  ev: ContextEvent,
): Promise<DocSpec | null> {
  if (!ev.refId) return null;

  if (ev.kind === "learning_logged") {
    const [s] = await db
      .select()
      .from(learningSessions)
      .where(
        and(
          eq(learningSessions.userId, userId),
          eq(learningSessions.id, ev.refId),
        ),
      )
      .limit(1);
    if (!s) return null;
    return {
      docType: "learning",
      title: `Learning: ${s.topic}`,
      body: [
        `Category: ${s.category}.`,
        s.description ? `What: ${s.description}` : "",
        s.notes ? `Notes: ${s.notes}` : "",
        s.confidenceBefore != null && s.confidenceAfter != null
          ? `Confidence went ${s.confidenceBefore} -> ${s.confidenceAfter} (of 5).`
          : "",
        `Studied on ${s.occurredAt.toISOString().slice(0, 10)}.`,
      ]
        .filter(Boolean)
        .join("\n"),
      sourceRef: `learning_session:${s.id}`,
    };
  }

  if (ev.kind === "skill_changed") {
    const [sk] = await db
      .select()
      .from(skills)
      .where(and(eq(skills.userId, userId), eq(skills.id, ev.refId)))
      .limit(1);
    if (!sk) return null;
    return {
      docType: "profile",
      title: `Skill: ${sk.name}`,
      body:
        `${sk.name} (${sk.category}) is at level "${sk.level}", confidence ${sk.confidence}/100.` +
        (sk.notes ? ` ${sk.notes}` : ""),
      sourceRef: `skill:${sk.id}`,
    };
  }

  if (ev.kind === "project_updated") {
    const [p] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.userId, userId), eq(projects.id, ev.refId)))
      .limit(1);
    if (!p) return null;

    const features = await db
      .select({ title: projectFeatures.title, status: projectFeatures.status })
      .from(projectFeatures)
      .where(
        and(eq(projectFeatures.userId, userId), eq(projectFeatures.projectId, p.id)),
      )
      .orderBy(asc(projectFeatures.createdAt));

    return {
      docType: "repo_summary",
      title: `Project: ${p.name}`,
      body: [
        p.description ?? "",
        p.problemSolved ? `Problem solved: ${p.problemSolved}` : "",
        p.architecture ? `Architecture: ${p.architecture}` : "",
        `Status: ${p.status}.`,
        features.length
          ? `Features:\n${features.map((f) => `- ${f.title} (${f.status})`).join("\n")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
      sourceRef: `project:${p.id}`,
    };
  }

  if (ev.kind === "activity_analyzed") {
    const [a] = await db
      .select()
      .from(activityAnalyses)
      .where(
        and(
          eq(activityAnalyses.userId, userId),
          eq(activityAnalyses.id, ev.refId),
        ),
      )
      .limit(1);
    if (!a) return null;
    return {
      docType: "learning",
      title: `Dev activity ${a.analysisDate}`,
      body: `${a.summary}\nWork: ${JSON.stringify(a.workCategories)}`,
      sourceRef: `activity_analysis:${a.id}`,
    };
  }

  return null;
}

export interface RefreshResult {
  processed: number;
  documents: number;
  chunks: number;
}

/**
 * Drain the context-events outbox: build/refresh a knowledge document for each
 * unprocessed row, re-embed it when the content changed, and mark it done.
 */
export async function drainContextEvents(
  userId: string,
  limit = 50,
): Promise<RefreshResult> {
  const rows = await db
    .select()
    .from(contextEvents)
    .where(
      and(
        eq(contextEvents.userId, userId),
        isNull(contextEvents.processedAt),
      ),
    )
    .orderBy(asc(contextEvents.createdAt))
    .limit(limit);

  let documents = 0;
  let chunks = 0;

  for (const ev of rows) {
    const spec = await specFor(userId, ev);
    if (spec) {
      const { document, created } = await upsertDocumentRow({
        userId,
        docType: spec.docType,
        title: spec.title,
        body: spec.body,
        sourceKind: "internal",
        sourceRef: spec.sourceRef,
        meta: { contextEventId: ev.id, kind: ev.kind },
      });
      if (created) {
        documents++;
        chunks += await embedDocument(userId, document.id, spec.body);
        const duplicateOf = await checkCrossSourceDuplicate(userId, document.id);
        if (!duplicateOf) {
          // map it the same run it's created, not just the same night —
          // mirrors the ExtractionAgent's embed->link step for external docs
          await mapDocument(userId, document.id);
        }
      }
    }
    await db
      .update(contextEvents)
      .set({ processedAt: new Date() })
      .where(eq(contextEvents.id, ev.id));
  }

  return { processed: rows.length, documents, chunks };
}

/** Count of context_events not yet drained into a knowledge document. */
export async function countPendingContextEvents(userId: string): Promise<number> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(contextEvents)
    .where(
      and(eq(contextEvents.userId, userId), isNull(contextEvents.processedAt)),
    );
  return n;
}
