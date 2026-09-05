CREATE TYPE "public"."entity_skill_source_type" AS ENUM('career_opportunity', 'content_item', 'business_opportunity');--> statement-breakpoint
CREATE TABLE "entity_skill_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_type" "entity_skill_source_type" NOT NULL,
	"source_id" uuid NOT NULL,
	"target_type" "knowledge_target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"score" real DEFAULT 0 NOT NULL,
	"method" text[] DEFAULT '{}'::text[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entity_skill_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "entity_skill_links_key_idx" ON "entity_skill_links" USING btree ("source_type","source_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "entity_skill_links_source_idx" ON "entity_skill_links" USING btree ("user_id","source_type","source_id");--> statement-breakpoint
CREATE INDEX "entity_skill_links_target_idx" ON "entity_skill_links" USING btree ("user_id","target_type","target_id");