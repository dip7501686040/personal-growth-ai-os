CREATE TABLE "daily_briefings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"briefing_date" date NOT NULL,
	"agent_run_id" uuid,
	"summary" text NOT NULL,
	"priorities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"connections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"agent_status_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pending_approval_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_briefings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "daily_briefings" ADD CONSTRAINT "daily_briefings_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_briefings_user_date_idx" ON "daily_briefings" USING btree ("user_id","briefing_date");--> statement-breakpoint
CREATE POLICY "own rows are readable" ON "daily_briefings" FOR SELECT TO authenticated USING ((select auth.uid()) = "user_id");