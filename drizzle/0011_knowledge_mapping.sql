CREATE TYPE "public"."knowledge_target_type" AS ENUM('skill', 'project', 'career_opportunity', 'content_item', 'business_opportunity', 'learning_session', 'dsa_pattern');--> statement-breakpoint
CREATE TABLE "entity_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"target_type" "knowledge_target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"text_hash" text NOT NULL,
	"embedding" vector(768),
	"embedding_model" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entity_embeddings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "knowledge_document_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"tag_slug" text NOT NULL,
	"confidence" real DEFAULT 0 NOT NULL,
	"method" text DEFAULT 'centroid_similarity' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_document_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "knowledge_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"target_type" "knowledge_target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"relation" text DEFAULT 'relevant_to' NOT NULL,
	"score" real DEFAULT 0 NOT NULL,
	"method" text[] DEFAULT '{}'::text[] NOT NULL,
	"rationale" text,
	"status" "evidence_status" DEFAULT 'suggested' NOT NULL,
	"created_by" "actor" DEFAULT 'agent' NOT NULL,
	"agent_run_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "knowledge_taxonomy" (
	"slug" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"description" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"embedding" vector(768),
	"embedding_model" text
);
--> statement-breakpoint
ALTER TABLE "knowledge_document_tags" ADD CONSTRAINT "knowledge_document_tags_document_id_knowledge_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_document_tags" ADD CONSTRAINT "knowledge_document_tags_tag_slug_knowledge_taxonomy_slug_fk" FOREIGN KEY ("tag_slug") REFERENCES "public"."knowledge_taxonomy"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_links" ADD CONSTRAINT "knowledge_links_document_id_knowledge_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_links" ADD CONSTRAINT "knowledge_links_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "entity_embeddings_target_idx" ON "entity_embeddings" USING btree ("user_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "entity_embeddings_embedding_idx" ON "entity_embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_document_tags_doc_tag_idx" ON "knowledge_document_tags" USING btree ("document_id","tag_slug");--> statement-breakpoint
CREATE INDEX "knowledge_document_tags_user_tag_idx" ON "knowledge_document_tags" USING btree ("user_id","tag_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_links_doc_target_idx" ON "knowledge_links" USING btree ("document_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "knowledge_links_reverse_idx" ON "knowledge_links" USING btree ("user_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "knowledge_links_user_status_idx" ON "knowledge_links" USING btree ("user_id","status");