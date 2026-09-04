import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  knowledgeDocumentTags,
  knowledgeDocuments,
  knowledgeLinks,
  knowledgeTaxonomy,
} from "@/lib/db/schema";
import { fetchEntityLabels, listAllEntities } from "../entities";
import {
  KNOWLEDGE_TARGET_TYPES,
  TARGET_TYPE_LABEL,
  type KnowledgeTargetType,
} from "../target-types";

export interface DocumentLinkRow {
  id: string;
  targetType: KnowledgeTargetType;
  targetId: string;
  targetLabel: string;
  relation: string;
  score: number;
  method: string[];
  rationale: string | null;
  status: "suggested" | "accepted" | "rejected";
  createdBy: "user" | "agent";
  createdAt: string;
}

/** A document's links, labeled, newest-scored first. */
export async function listDocumentLinks(
  userId: string,
  documentId: string,
): Promise<DocumentLinkRow[]> {
  const rows = await db
    .select()
    .from(knowledgeLinks)
    .where(
      and(
        eq(knowledgeLinks.userId, userId),
        eq(knowledgeLinks.documentId, documentId),
      ),
    )
    .orderBy(desc(knowledgeLinks.score));

  const idsByType = new Map<KnowledgeTargetType, string[]>();
  for (const r of rows) {
    const arr = idsByType.get(r.targetType) ?? [];
    arr.push(r.targetId);
    idsByType.set(r.targetType, arr);
  }
  const labels = new Map<string, string>();
  for (const [type, ids] of idsByType) {
    const m = await fetchEntityLabels(userId, type, ids);
    for (const [id, v] of m) labels.set(`${type}:${id}`, v.label);
  }

  return rows.map((r) => ({
    id: r.id,
    targetType: r.targetType,
    targetId: r.targetId,
    targetLabel:
      labels.get(`${r.targetType}:${r.targetId}`) ?? TARGET_TYPE_LABEL[r.targetType],
    relation: r.relation,
    score: Number(r.score),
    method: r.method,
    rationale: r.rationale,
    status: r.status,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
  }));
}

export interface DocumentTagRow {
  tagSlug: string;
  label: string;
  confidence: number;
}

export async function listDocumentTags(
  userId: string,
  documentId: string,
): Promise<DocumentTagRow[]> {
  const rows = await db
    .select({
      tagSlug: knowledgeDocumentTags.tagSlug,
      confidence: knowledgeDocumentTags.confidence,
      label: knowledgeTaxonomy.label,
    })
    .from(knowledgeDocumentTags)
    .innerJoin(
      knowledgeTaxonomy,
      eq(knowledgeTaxonomy.slug, knowledgeDocumentTags.tagSlug),
    )
    .where(
      and(
        eq(knowledgeDocumentTags.userId, userId),
        eq(knowledgeDocumentTags.documentId, documentId),
      ),
    );
  return rows.map((r) => ({
    tagSlug: r.tagSlug,
    label: r.label,
    confidence: Number(r.confidence),
  }));
}

export interface TaxonomyOption {
  slug: string;
  label: string;
}

export async function listAllTaxonomyTags(): Promise<TaxonomyOption[]> {
  return db
    .select({ slug: knowledgeTaxonomy.slug, label: knowledgeTaxonomy.label })
    .from(knowledgeTaxonomy)
    .orderBy(knowledgeTaxonomy.sortOrder);
}

export interface LinkTargetOption {
  targetType: KnowledgeTargetType;
  targetId: string;
  label: string;
}

/** Every possible manual-link target for a user — the "Add mapping" picker's
 *  source list. ~100 rows at this app's scale; fetched once server-side and
 *  filtered client-side rather than round-tripping per keystroke. */
export async function listAllLinkTargets(
  userId: string,
): Promise<LinkTargetOption[]> {
  const out: LinkTargetOption[] = [];
  for (const type of KNOWLEDGE_TARGET_TYPES) {
    const rows = await listAllEntities(userId, type);
    for (const r of rows) {
      out.push({ targetType: type, targetId: r.id, label: r.label });
    }
  }
  return out;
}

export interface FocusTarget {
  targetType: KnowledgeTargetType;
  targetId: string;
}

export interface RelatedKnowledgeHit {
  documentId: string;
  title: string;
  docType: string;
  sourceKind: string;
  content: string;
  score: number;
  /** what this doc is linked to, for transparency in the rendered prompt */
  via: string;
}

/**
 * Reverse `knowledge_links` lookup: the accepted documents behind a set of
 * focus entities (the opportunity being matched, the project being advanced,
 * ...) — this is the K5 payoff, feeding an agent the knowledge that's already
 * been confirmed relevant to what it's working on, ahead of generic semantic
 * retrieval. Only `accepted` links count; `suggested` ones haven't been
 * reviewed and shouldn't drive an agent's output yet.
 */
export async function getRelatedKnowledge(
  userId: string,
  focusEntities: FocusTarget[],
  limit = 6,
): Promise<RelatedKnowledgeHit[]> {
  if (focusEntities.length === 0) return [];

  const byType = new Map<KnowledgeTargetType, string[]>();
  for (const f of focusEntities) {
    const arr = byType.get(f.targetType) ?? [];
    arr.push(f.targetId);
    byType.set(f.targetType, arr);
  }

  const linkRows: {
    documentId: string;
    score: number;
    targetType: KnowledgeTargetType;
    targetId: string;
  }[] = [];
  for (const [targetType, ids] of byType) {
    const rows = await db
      .select({
        documentId: knowledgeLinks.documentId,
        score: knowledgeLinks.score,
        targetType: knowledgeLinks.targetType,
        targetId: knowledgeLinks.targetId,
      })
      .from(knowledgeLinks)
      .where(
        and(
          eq(knowledgeLinks.userId, userId),
          eq(knowledgeLinks.status, "accepted"),
          eq(knowledgeLinks.targetType, targetType),
          inArray(knowledgeLinks.targetId, ids),
        ),
      );
    linkRows.push(...rows);
  }
  if (linkRows.length === 0) return [];

  // one document can be linked via several focus entities — keep the strongest
  const byDoc = new Map<string, (typeof linkRows)[number]>();
  for (const r of linkRows) {
    const cur = byDoc.get(r.documentId);
    if (!cur || r.score > cur.score) byDoc.set(r.documentId, r);
  }

  const docs = await db
    .select({
      id: knowledgeDocuments.id,
      title: knowledgeDocuments.title,
      body: knowledgeDocuments.body,
      docType: knowledgeDocuments.docType,
      sourceKind: knowledgeDocuments.sourceKind,
    })
    .from(knowledgeDocuments)
    .where(
      and(
        eq(knowledgeDocuments.userId, userId),
        isNull(knowledgeDocuments.supersededAt),
        inArray(knowledgeDocuments.id, [...byDoc.keys()]),
      ),
    );

  const labels = new Map<string, string>();
  for (const [targetType, ids] of byType) {
    const m = await fetchEntityLabels(userId, targetType, ids);
    for (const [id, v] of m) labels.set(`${targetType}:${id}`, v.label);
  }

  return docs
    .map((d) => {
      const link = byDoc.get(d.id)!;
      return {
        documentId: d.id,
        title: d.title,
        docType: d.docType,
        sourceKind: d.sourceKind,
        content: d.body,
        score: Number(link.score),
        via: labels.get(`${link.targetType}:${link.targetId}`) ?? TARGET_TYPE_LABEL[link.targetType],
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
