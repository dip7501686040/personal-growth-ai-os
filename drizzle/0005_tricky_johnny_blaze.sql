CREATE TYPE "public"."business_complexity" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."business_status" AS ENUM('idea', 'exploring', 'validated', 'dropped');--> statement-breakpoint
CREATE TABLE "business_opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"agent_run_id" uuid,
	"title" text NOT NULL,
	"problem" text NOT NULL,
	"target_customer" text NOT NULL,
	"proposed_solution" text NOT NULL,
	"tech_stack" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"skill_match_score" integer DEFAULT 0 NOT NULL,
	"complexity" "business_complexity" DEFAULT 'medium' NOT NULL,
	"build_scope" text,
	"monetization_model" text,
	"market" text,
	"business_type" text,
	"status" "business_status" DEFAULT 'idea' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_opportunities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "business_opportunities" ADD CONSTRAINT "business_opportunities_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "business_opportunities_user_idx" ON "business_opportunities" USING btree ("user_id","status");--> statement-breakpoint
CREATE POLICY "own rows are readable" ON "business_opportunities" FOR SELECT TO authenticated USING ((select auth.uid()) = "user_id");