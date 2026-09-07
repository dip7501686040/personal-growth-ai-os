CREATE TYPE "public"."application_status" AS ENUM('draft', 'applied', 'screening', 'interviewing', 'offer', 'rejected', 'ghosted');--> statement-breakpoint
CREATE TYPE "public"."company_type" AS ENUM('product', 'agency_named_client', 'agency_unnamed', 'body_shop', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."remote_kind" AS ENUM('remote', 'onsite_foreign', 'onsite_india');--> statement-breakpoint
CREATE TYPE "public"."touchpoint_channel" AS ENUM('portal', 'email', 'linkedin', 'whatsapp', 'twitter', 'instagram', 'facebook', 'discord', 'slack', 'telegram', 'other');--> statement-breakpoint
CREATE TYPE "public"."touchpoint_kind" AS ENUM('submitted', 'recruiter_pitch', 'referral_pitch', 'follow_up_1', 'follow_up_2', 'interview', 'note');--> statement-breakpoint
CREATE TABLE "application_touchpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"kind" "touchpoint_kind" NOT NULL,
	"channel" "touchpoint_channel" DEFAULT 'other' NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"response_at" timestamp with time zone,
	"response_summary" text,
	"next_due_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_touchpoints" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "job_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"dedupe_key" text NOT NULL,
	"company" text NOT NULL,
	"role" text NOT NULL,
	"jd_text" text,
	"jd_url" text,
	"source" text,
	"portal" text,
	"contact_name" text,
	"contact_channel" "touchpoint_channel",
	"remote_kind" "remote_kind",
	"salary_raw" text,
	"salary_lpa" real,
	"company_type" "company_type",
	"funding_stage" text,
	"funding_note" text,
	"status" "application_status" DEFAULT 'draft' NOT NULL,
	"reply_likelihood" real,
	"skill_match" real,
	"matched_skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"matched_features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"proof_bundle" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bundle_dir" text,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_applications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "application_touchpoints" ADD CONSTRAINT "application_touchpoints_application_id_job_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."job_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_touchpoints_app_idx" ON "application_touchpoints" USING btree ("application_id","sent_at");--> statement-breakpoint
CREATE INDEX "application_touchpoints_due_idx" ON "application_touchpoints" USING btree ("user_id","next_due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "job_applications_user_dedupe_idx" ON "job_applications" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "job_applications_user_status_idx" ON "job_applications" USING btree ("user_id","status");