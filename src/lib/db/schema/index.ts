/**
 * Drizzle schema barrel. Tables are added per phase (see docs/mvp-scope.md).
 *
 *   Phase 2   – skills, skill_evidence, approvals, agent_runs, agent_events   ✓
 *   Phase 3   – learning_sessions, dsa_*, ai_usage, llm_cache, agent_model_config ✓
 *   Phase 2.5 – activity_events, activity_analyses, ingest_tokens  (deferred to after Phase 8)
 *   Phase 4   – projects, project_features, project_skills
 *   Phase 5   – career_opportunities, career_matches
 *   Phase 6   – content_items, content_sources
 *   Phase 7   – business_opportunities
 *   Phase 8   – daily_briefings
 */

export * from "./_shared";
export * from "./agents";
export * from "./approvals";
export * from "./skills";
export * from "./learning";
export * from "./llm";
