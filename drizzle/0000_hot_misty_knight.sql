CREATE TYPE "public"."actor" AS ENUM('user', 'agent');--> statement-breakpoint
CREATE TYPE "public"."agent_event_level" AS ENUM('info', 'warn', 'error');--> statement-breakpoint
CREATE TYPE "public"."agent_name" AS ENUM('learning', 'project', 'career', 'content', 'business', 'chief_of_staff', 'activity_analyzer');--> statement-breakpoint
CREATE TYPE "public"."agent_status" AS ENUM('triggered', 'running', 'gathering_context', 'analyzing', 'recommending', 'waiting_for_approval', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."agent_trigger" AS ENUM('schedule', 'manual', 'chain');--> statement-breakpoint
CREATE TYPE "public"."approval_action" AS ENUM('promote_skill', 'demote_skill', 'change_learning_priority', 'start_project', 'apply_job', 'publish_content', 'contact_client');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."evidence_source_type" AS ENUM('learning_session', 'dsa_attempt', 'project_feature', 'activity_analysis', 'manual', 'agent_suggestion');--> statement-breakpoint
CREATE TYPE "public"."evidence_status" AS ENUM('suggested', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."evidence_strength" AS ENUM('weak', 'moderate', 'strong');--> statement-breakpoint
CREATE TYPE "public"."skill_category" AS ENUM('language', 'framework', 'database', 'infrastructure', 'concept', 'tool', 'practice', 'dsa_pattern');--> statement-breakpoint
CREATE TYPE "public"."skill_level" AS ENUM('interested', 'learning', 'practiced', 'implemented', 'proven');--> statement-breakpoint
CREATE TABLE "agent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"agent_run_id" uuid NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"level" "agent_event_level" DEFAULT 'info' NOT NULL,
	"step" text,
	"message" text NOT NULL,
	"data" jsonb
);
--> statement-breakpoint
ALTER TABLE "agent_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"agent_name" "agent_name" NOT NULL,
	"status" "agent_status" DEFAULT 'triggered' NOT NULL,
	"trigger_source" "agent_trigger" NOT NULL,
	"trigger_key" text,
	"input_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"current_step" text,
	"result" jsonb,
	"error" text,
	"model_used" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"estimated_cost_usd" numeric(10, 6),
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"agent_run_id" uuid,
	"agent_name" "agent_name",
	"action_type" "approval_action" NOT NULL,
	"title" text NOT NULL,
	"reason" text NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expected_outcome" text,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"feedback" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approvals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "skill_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"source_type" "evidence_source_type" NOT NULL,
	"source_id" uuid,
	"summary" text NOT NULL,
	"detail" text,
	"strength" "evidence_strength" DEFAULT 'moderate' NOT NULL,
	"supports_level" "skill_level" NOT NULL,
	"status" "evidence_status" DEFAULT 'suggested' NOT NULL,
	"created_by" "actor" DEFAULT 'user' NOT NULL,
	"agent_run_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "skill_evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"category" "skill_category" NOT NULL,
	"level" "skill_level" DEFAULT 'interested' NOT NULL,
	"confidence" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"last_activity_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skills_confidence_range" CHECK ("skills"."confidence" between 0 and 100)
);
--> statement-breakpoint
ALTER TABLE "skills" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_evidence" ADD CONSTRAINT "skill_evidence_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_evidence" ADD CONSTRAINT "skill_evidence_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_events_run_ts_idx" ON "agent_events" USING btree ("agent_run_id","ts");--> statement-breakpoint
CREATE INDEX "agent_runs_user_agent_created_idx" ON "agent_runs" USING btree ("user_id","agent_name","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_idempotency_idx" ON "agent_runs" USING btree ("user_id","agent_name","trigger_key") WHERE "agent_runs"."trigger_key" is not null;--> statement-breakpoint
CREATE INDEX "approvals_user_status_idx" ON "approvals" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "skill_evidence_skill_idx" ON "skill_evidence" USING btree ("user_id","skill_id");--> statement-breakpoint
CREATE INDEX "skill_evidence_status_idx" ON "skill_evidence" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "skills_user_slug_idx" ON "skills" USING btree ("user_id","slug");--> statement-breakpoint
CREATE INDEX "skills_user_category_idx" ON "skills" USING btree ("user_id","category");--> statement-breakpoint
-- RLS: the app writes via the service Postgres connection (which bypasses RLS).
-- These read-only policies exist so Supabase Realtime / PostgREST can expose a
-- user's own rows to an authenticated client (used from Phase 9). No write
-- policies: mutations go through the app only.
CREATE POLICY "own rows are readable" ON "skills" FOR SELECT TO authenticated USING ((select auth.uid()) = "user_id");--> statement-breakpoint
CREATE POLICY "own rows are readable" ON "skill_evidence" FOR SELECT TO authenticated USING ((select auth.uid()) = "user_id");--> statement-breakpoint
CREATE POLICY "own rows are readable" ON "approvals" FOR SELECT TO authenticated USING ((select auth.uid()) = "user_id");--> statement-breakpoint
CREATE POLICY "own rows are readable" ON "agent_runs" FOR SELECT TO authenticated USING ((select auth.uid()) = "user_id");--> statement-breakpoint
CREATE POLICY "own rows are readable" ON "agent_events" FOR SELECT TO authenticated USING ((select auth.uid()) = "user_id");