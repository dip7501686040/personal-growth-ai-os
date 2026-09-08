ALTER TABLE "skills" ADD COLUMN "excluded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_features" ADD COLUMN "excluded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "excluded_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "skills_user_active_idx" ON "skills" USING btree ("user_id") WHERE "skills"."excluded_at" is null;--> statement-breakpoint
CREATE INDEX "project_features_user_active_idx" ON "project_features" USING btree ("user_id") WHERE "project_features"."excluded_at" is null;--> statement-breakpoint
CREATE INDEX "projects_user_active_idx" ON "projects" USING btree ("user_id") WHERE "projects"."excluded_at" is null;