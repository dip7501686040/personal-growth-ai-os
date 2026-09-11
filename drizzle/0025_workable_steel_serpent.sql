ALTER TYPE "public"."content_platform" ADD VALUE 'portfolio';--> statement-breakpoint
ALTER TABLE "content_items" ADD COLUMN "cloudinary_public_id" text;--> statement-breakpoint
ALTER TABLE "content_items" ADD COLUMN "cloudinary_resource_type" text;--> statement-breakpoint
ALTER TABLE "content_items" ADD COLUMN "cloudinary_format" text;