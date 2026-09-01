CREATE TYPE "public"."content_platform" AS ENUM('linkedin');--> statement-breakpoint
CREATE TYPE "public"."content_source_type" AS ENUM('learning_session', 'project_feature', 'dsa_attempt', 'dsa_weakness', 'skill_levelup', 'activity_analysis', 'manual');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('idea', 'draft', 'ready_for_review', 'approved', 'published');--> statement-breakpoint
CREATE TABLE "content_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" "content_platform" DEFAULT 'linkedin' NOT NULL,
	"status" "content_status" DEFAULT 'idea' NOT NULL,
	"title" text NOT NULL,
	"hook" text,
	"angle" text,
	"body" text,
	"agent_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "content_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"content_item_id" uuid NOT NULL,
	"source_type" "content_source_type" NOT NULL,
	"source_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_sources" ADD CONSTRAINT "content_sources_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_items_user_status_idx" ON "content_items" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "content_sources_item_idx" ON "content_sources" USING btree ("content_item_id");--> statement-breakpoint
CREATE INDEX "content_sources_lookup_idx" ON "content_sources" USING btree ("user_id","source_type","source_id");--> statement-breakpoint
CREATE POLICY "own rows are readable" ON "content_items" FOR SELECT TO authenticated USING ((select auth.uid()) = "user_id");--> statement-breakpoint
CREATE POLICY "own rows are readable" ON "content_sources" FOR SELECT TO authenticated USING ((select auth.uid()) = "user_id");