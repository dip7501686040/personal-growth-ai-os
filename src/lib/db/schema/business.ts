import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import {
  businessComplexityEnum,
  businessStatusEnum,
  createdAt,
  updatedAt,
  userId,
} from "./_shared";
import { agentRuns } from "./agents";

export const businessOpportunities = pgTable(
  "business_opportunities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    agentRunId: uuid("agent_run_id").references(() => agentRuns.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    problem: text("problem").notNull(),
    targetCustomer: text("target_customer").notNull(),
    proposedSolution: text("proposed_solution").notNull(),
    /** string[] — drawn from the user's proven/implemented skills. */
    techStack: jsonb("tech_stack").notNull().default(sql`'[]'::jsonb`),
    skillMatchScore: integer("skill_match_score").notNull().default(0),
    complexity: businessComplexityEnum("complexity").notNull().default("medium"),
    buildScope: text("build_scope"),
    monetizationModel: text("monetization_model"),
    /** Generation context. */
    market: text("market"),
    businessType: text("business_type"),
    status: businessStatusEnum("status").notNull().default("idea"),
    notes: text("notes"),
    createdAt,
    updatedAt,
  },
  (t) => [index("business_opportunities_user_idx").on(t.userId, t.status)],
).enableRLS();

export type BusinessOpportunity = typeof businessOpportunities.$inferSelect;
