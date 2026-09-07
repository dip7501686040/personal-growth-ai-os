ALTER TABLE "content_items" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "content_items" ADD COLUMN "published_urls" jsonb;--> statement-breakpoint
ALTER TABLE "content_items" ADD COLUMN "asset_type" text;--> statement-breakpoint
ALTER TABLE "project_features" ADD COLUMN "demo_video_url" text;--> statement-breakpoint
ALTER TABLE "project_features" ADD COLUMN "code_paths" jsonb;--> statement-breakpoint
ALTER TABLE "project_features" ADD COLUMN "source_key" text;--> statement-breakpoint
ALTER TABLE "project_features" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "repo_url" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "live_url" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "last_synced_sha" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "last_synced_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "project_features_source_key_idx" ON "project_features" USING btree ("user_id","source_key") WHERE "project_features"."source_key" is not null;