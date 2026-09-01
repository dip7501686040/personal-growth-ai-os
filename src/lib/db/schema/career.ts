import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import {
  careerRecommendationEnum,
  careerStatusEnum,
  createdAt,
  updatedAt,
  userId,
} from "./_shared";
import { agentRuns } from "./agents";

export const careerOpportunities = pgTable(
  "career_opportunities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    company: text("company").notNull(),
    role: text("role").notNull(),
    jobUrl: text("job_url"),
    location: text("location"),
    description: text("description").notNull(),
    status: careerStatusEnum("status").notNull().default("new"),
    createdAt,
    updatedAt,
  },
  (t) => [index("career_opportunities_user_idx").on(t.userId, t.status)],
).enableRLS();

/** Result of one Career-agent analysis of an opportunity. History is kept. */
export const careerMatches = pgTable(
  "career_matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => careerOpportunities.id, { onDelete: "cascade" }),
    agentRunId: uuid("agent_run_id").references(() => agentRuns.id, {
      onDelete: "set null",
    }),
    overallScore: integer("overall_score").notNull(),
    recommendation: careerRecommendationEnum("recommendation").notNull(),
    summary: text("summary").notNull(),
    /** string[] of skill names */
    provenMatches: jsonb("proven_matches").notNull().default(sql`'[]'::jsonb`),
    implementedMatches: jsonb("implemented_matches")
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** {skill, have, note}[] */
    partialMatches: jsonb("partial_matches").notNull().default(sql`'[]'::jsonb`),
    aspirationalMatches: jsonb("aspirational_matches")
      .notNull()
      .default(sql`'[]'::jsonb`),
    missingSkills: jsonb("missing_skills").notNull().default(sql`'[]'::jsonb`),
    /** {gap, suggestion}[] */
    gapClosingWork: jsonb("gap_closing_work")
      .notNull()
      .default(sql`'[]'::jsonb`),
    rationale: text("rationale").notNull(),
    createdAt,
  },
  (t) => [
    index("career_matches_opp_idx").on(t.opportunityId, t.createdAt),
  ],
).enableRLS();

export type CareerOpportunity = typeof careerOpportunities.$inferSelect;
export type CareerMatch = typeof careerMatches.$inferSelect;
