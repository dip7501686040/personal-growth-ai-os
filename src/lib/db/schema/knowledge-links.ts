import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import {
  actorEnum,
  createdAt,
  evidenceStatusEnum,
  knowledgeTargetTypeEnum,
  updatedAt,
  userId,
} from "./_shared";
import { agentRuns } from "./agents";
import { knowledgeDocuments } from "./knowledge";

/**
 * Classification of knowledge — Phase K1 (Knowledge mapping & classification).
 *
 * Two axes:
 *  - `knowledge_links`: a doc ⇒ the concrete thing that gives it a reason to
 *    exist (a skill, a project, a learning session, ...). This is the primary
 *    axis — chips/search browse by these real entities, not by category.
 *  - `knowledge_taxonomy` / `knowledge_document_tags`: a secondary subject-area
 *    tag for docs that aren't cleanly "about" one entity (an architecture
 *    decision, a debugging lesson, an infra note, ...).
 */

/**
 * Global reference list of subject-area tags (seeded once; edit/add rows as
 * the corpus grows). Not user-scoped — like `dsa_patterns`. `embedding` is the
 * label+description centroid used to classify a doc by cosine similarity.
 */
export const knowledgeTaxonomy = pgTable("knowledge_taxonomy", {
  slug: text("slug").primaryKey(),
  label: text("label").notNull(),
  description: text("description").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  embedding: vector("embedding", { dimensions: 768 }),
  embeddingModel: text("embedding_model"),
});

/** Doc ⇒ taxonomy tag (many-to-many, scored). Usually one or two per doc. */
export const knowledgeDocumentTags = pgTable(
  "knowledge_document_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    documentId: uuid("document_id")
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
    tagSlug: text("tag_slug")
      .notNull()
      .references(() => knowledgeTaxonomy.slug, { onDelete: "cascade" }),
    confidence: real("confidence").notNull().default(0),
    /** centroid_similarity | rule | manual */
    method: text("method").notNull().default("centroid_similarity"),
    createdAt,
  },
  (t) => [
    uniqueIndex("knowledge_document_tags_doc_tag_idx").on(
      t.documentId,
      t.tagSlug,
    ),
    index("knowledge_document_tags_user_tag_idx").on(t.userId, t.tagSlug),
  ],
).enableRLS();

/**
 * A typed, explainable edge from a knowledge document to whatever gives it a
 * reason to exist. Mirrors `skill_evidence`'s suggested → accepted → rejected
 * review flow — nothing here drives UI/context until accepted, except a small
 * set of auto-accept rules applied at write time (see modules/knowledge/mapping).
 */
export const knowledgeLinks = pgTable(
  "knowledge_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    documentId: uuid("document_id")
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
    targetType: knowledgeTargetTypeEnum("target_type").notNull(),
    /** Points into skills / projects / career_opportunities / content_items /
     *  business_opportunities / learning_sessions / dsa_patterns per targetType.
     *  Polymorphic — enforced in code, not a DB FK (the target set spans
     *  multiple tables). */
    targetId: uuid("target_id").notNull(),
    /** demonstrates | used_in | relevant_to | evidence_for | inspired_by */
    relation: text("relation").notNull().default("relevant_to"),
    /** fused 0..1 confidence */
    score: real("score").notNull().default(0),
    /** embedding | lexical | skill_name | shared_source | llm | manual — combined */
    method: text("method")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    rationale: text("rationale"),
    status: evidenceStatusEnum("status").notNull().default("suggested"),
    createdBy: actorEnum("created_by").notNull().default("agent"),
    agentRunId: uuid("agent_run_id").references(() => agentRuns.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt,
  },
  (t) => [
    uniqueIndex("knowledge_links_doc_target_idx").on(
      t.documentId,
      t.targetType,
      t.targetId,
    ),
    // reverse lookup: "knowledge linked to skill X" / project X / ...
    index("knowledge_links_reverse_idx").on(
      t.userId,
      t.targetType,
      t.targetId,
    ),
    index("knowledge_links_user_status_idx").on(t.userId, t.status),
  ],
).enableRLS();

/**
 * Cached embedding for a link-target entity (a skill, project, career
 * opportunity, ...), so doc⇒entity similarity is a plain pgvector kNN instead
 * of re-embedding entities on every linking pass. `text_hash` makes
 * re-embedding idempotent when the entity's canonical text changes.
 */
export const entityEmbeddings = pgTable(
  "entity_embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    targetType: knowledgeTargetTypeEnum("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    textHash: text("text_hash").notNull(),
    embedding: vector("embedding", { dimensions: 768 }),
    embeddingModel: text("embedding_model"),
    updatedAt,
    createdAt,
  },
  (t) => [
    uniqueIndex("entity_embeddings_target_idx").on(
      t.userId,
      t.targetType,
      t.targetId,
    ),
    index("entity_embeddings_embedding_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
  ],
).enableRLS();

export type KnowledgeTaxonomy = typeof knowledgeTaxonomy.$inferSelect;
export type KnowledgeDocumentTag = typeof knowledgeDocumentTags.$inferSelect;
export type NewKnowledgeDocumentTag = typeof knowledgeDocumentTags.$inferInsert;
export type KnowledgeLink = typeof knowledgeLinks.$inferSelect;
export type NewKnowledgeLink = typeof knowledgeLinks.$inferInsert;
export type EntityEmbedding = typeof entityEmbeddings.$inferSelect;
export type NewEntityEmbedding = typeof entityEmbeddings.$inferInsert;
