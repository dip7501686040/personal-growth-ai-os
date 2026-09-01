CREATE TYPE "public"."activity_event_type" AS ENUM('coding_session');--> statement-breakpoint
CREATE TYPE "public"."activity_source" AS ENUM('claude_code');--> statement-breakpoint
CREATE TYPE "public"."activity_status" AS ENUM('received', 'analyzed', 'failed');--> statement-breakpoint
CREATE TABLE "activity_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"analysis_date" date NOT NULL,
	"activity_event_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"agent_run_id" uuid,
	"summary" text NOT NULL,
	"work_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"suggested_skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"potential_proof" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content_opportunities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_analyses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"client_event_id" text NOT NULL,
	"source" "activity_source" DEFAULT 'claude_code' NOT NULL,
	"event_type" "activity_event_type" DEFAULT 'coding_session' NOT NULL,
	"session_id" text,
	"project_name" text,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"files_created" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"files_modified" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"files_deleted" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"git_branch" text,
	"git_commits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"git_stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"session_summary" text,
	"status" "activity_status" DEFAULT 'received' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ingest_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"label" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ingest_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activity_analyses" ADD CONSTRAINT "activity_analyses_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_analyses_user_date_idx" ON "activity_analyses" USING btree ("user_id","analysis_date");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_events_client_id_idx" ON "activity_events" USING btree ("user_id","client_event_id");--> statement-breakpoint
CREATE INDEX "activity_events_user_status_idx" ON "activity_events" USING btree ("user_id","status","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ingest_tokens_hash_idx" ON "ingest_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "ingest_tokens_user_idx" ON "ingest_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "own rows are readable" ON "activity_events" FOR SELECT TO authenticated USING ((select auth.uid()) = "user_id");--> statement-breakpoint
CREATE POLICY "own rows are readable" ON "activity_analyses" FOR SELECT TO authenticated USING ((select auth.uid()) = "user_id");--> statement-breakpoint
CREATE POLICY "own rows are readable" ON "ingest_tokens" FOR SELECT TO authenticated USING ((select auth.uid()) = "user_id");