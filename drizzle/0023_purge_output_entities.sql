-- skill-graph-manager Phase 6: career_opportunity / business_opportunity are
-- terminal outputs and no longer participate in the knowledge graph. Drop the
-- cached edges that point at (or from) them. The DB enums keep the values for
-- any legacy rows elsewhere; nothing writes these two types any more.

DELETE FROM entity_embeddings
WHERE target_type IN ('career_opportunity', 'business_opportunity');
--> statement-breakpoint

DELETE FROM entity_skill_links
WHERE source_type IN ('career_opportunity', 'business_opportunity')
   OR target_type IN ('career_opportunity', 'business_opportunity');
--> statement-breakpoint

DELETE FROM knowledge_links
WHERE target_type IN ('career_opportunity', 'business_opportunity');
