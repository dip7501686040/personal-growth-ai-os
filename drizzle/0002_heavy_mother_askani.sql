CREATE TYPE "public"."feature_status" AS ENUM('planned', 'in_progress', 'done');--> statement-breakpoint
CREATE TYPE "public"."project_skill_role" AS ENUM('planned', 'used', 'demonstrated');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('idea', 'planning', 'building', 'paused', 'completed');--> statement-breakpoint
CREATE TABLE "project_features" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "feature_status" DEFAULT 'planned' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_features" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"feature_id" uuid,
	"skill_id" uuid NOT NULL,
	"role" "project_skill_role" DEFAULT 'used' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_skills" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"problem_solved" text,
	"architecture" text,
	"status" "project_status" DEFAULT 'idea' NOT NULL,
	"repo_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_features" ADD CONSTRAINT "project_features_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_skills" ADD CONSTRAINT "project_skills_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_skills" ADD CONSTRAINT "project_skills_feature_id_project_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."project_features"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_skills" ADD CONSTRAINT "project_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_features_project_idx" ON "project_features" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_skills_project_idx" ON "project_skills" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_skills_skill_idx" ON "project_skills" USING btree ("user_id","skill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_user_slug_idx" ON "projects" USING btree ("user_id","slug");--> statement-breakpoint
CREATE POLICY "own rows are readable" ON "projects" FOR SELECT TO authenticated USING ((select auth.uid()) = "user_id");--> statement-breakpoint
CREATE POLICY "own rows are readable" ON "project_features" FOR SELECT TO authenticated USING ((select auth.uid()) = "user_id");--> statement-breakpoint
CREATE POLICY "own rows are readable" ON "project_skills" FOR SELECT TO authenticated USING ((select auth.uid()) = "user_id");