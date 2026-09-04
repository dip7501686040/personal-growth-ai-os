CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD COLUMN "search_tsv" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(body, '')), 'B')) STORED;--> statement-breakpoint
CREATE INDEX "knowledge_documents_search_tsv_idx" ON "knowledge_documents" USING gin ("search_tsv");--> statement-breakpoint
CREATE INDEX "knowledge_documents_title_trgm_idx" ON "knowledge_documents" USING gin ("title" gin_trgm_ops);