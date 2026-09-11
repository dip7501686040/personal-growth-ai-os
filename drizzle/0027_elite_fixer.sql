ALTER TABLE "job_applications" ADD COLUMN "content_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "job_applications" ADD COLUMN "content_prepared_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "job_applications" ADD COLUMN "apply_requested_at" timestamp with time zone;