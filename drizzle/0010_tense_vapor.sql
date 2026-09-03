ALTER TYPE "public"."agent_name" ADD VALUE IF NOT EXISTS 'extractor';--> statement-breakpoint
ALTER TYPE "public"."evidence_source_type" ADD VALUE IF NOT EXISTS 'github_repo';--> statement-breakpoint
ALTER TYPE "public"."evidence_source_type" ADD VALUE IF NOT EXISTS 'conversation';--> statement-breakpoint
ALTER TYPE "public"."evidence_source_type" ADD VALUE IF NOT EXISTS 'linkedin';--> statement-breakpoint
ALTER TYPE "public"."evidence_source_type" ADD VALUE IF NOT EXISTS 'local_doc';--> statement-breakpoint
ALTER TYPE "public"."evidence_source_type" ADD VALUE IF NOT EXISTS 'knowledge_document';