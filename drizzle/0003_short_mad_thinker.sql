CREATE TYPE "public"."career_recommendation" AS ENUM('yes', 'maybe', 'no');--> statement-breakpoint
CREATE TYPE "public"."career_status" AS ENUM('new', 'analyzed', 'applied', 'rejected', 'archived');--> statement-breakpoint
CREATE TABLE "career_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"agent_run_id" uuid,
	"overall_score" integer NOT NULL,
	"recommendation" "career_recommendation" NOT NULL,
	"summary" text NOT NULL,
	"proven_matches" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"implemented_matches" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"partial_matches" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"aspirational_matches" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"missing_skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"gap_closing_work" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rationale" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "career_matches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "career_opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"company" text NOT NULL,
	"role" text NOT NULL,
	"job_url" text,
	"location" text,
	"description" text NOT NULL,
	"status" "career_status" DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "career_opportunities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "career_matches" ADD CONSTRAINT "career_matches_opportunity_id_career_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."career_opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_matches" ADD CONSTRAINT "career_matches_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "career_matches_opp_idx" ON "career_matches" USING btree ("opportunity_id","created_at");--> statement-breakpoint
CREATE INDEX "career_opportunities_user_idx" ON "career_opportunities" USING btree ("user_id","status");--> statement-breakpoint
CREATE POLICY "own rows are readable" ON "career_opportunities" FOR SELECT TO authenticated USING ((select auth.uid()) = "user_id");--> statement-breakpoint
CREATE POLICY "own rows are readable" ON "career_matches" FOR SELECT TO authenticated USING ((select auth.uid()) = "user_id");