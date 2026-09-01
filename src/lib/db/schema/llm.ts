import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  agentNameEnum,
  createdAt,
  llmProviderEnum,
  updatedAt,
  userId,
} from "./_shared";
import { agentRuns } from "./agents";

/** Per-call AI usage + cost tracking. */
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    agentRunId: uuid("agent_run_id").references(() => agentRuns.id, {
      onDelete: "set null",
    }),
    agentName: agentNameEnum("agent_name"),
    provider: llmProviderEnum("provider").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    estimatedCostUsd: numeric("estimated_cost_usd", { precision: 12, scale: 8 }),
    cached: boolean("cached").notNull().default(false),
    createdAt,
  },
  (t) => [index("ai_usage_user_created_idx").on(t.userId, t.createdAt)],
).enableRLS();

/** Response cache — skips re-analysing identical inputs. */
export const llmCache = pgTable(
  "llm_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    cacheKey: text("cache_key").notNull(),
    provider: llmProviderEnum("provider").notNull(),
    model: text("model").notNull(),
    response: jsonb("response").notNull(),
    createdAt,
  },
  (t) => [uniqueIndex("llm_cache_key_idx").on(t.cacheKey)],
).enableRLS();

/** Which provider/model each agent uses. Seeded with defaults in the migration. */
export const agentModelConfig = pgTable(
  "agent_model_config",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    agentName: agentNameEnum("agent_name").notNull(),
    provider: llmProviderEnum("provider").notNull(),
    model: text("model").notNull(),
    updatedAt,
  },
  (t) => [
    uniqueIndex("agent_model_config_user_agent_idx").on(t.userId, t.agentName),
  ],
).enableRLS();

export type AiUsage = typeof aiUsage.$inferSelect;
export type AgentModelConfig = typeof agentModelConfig.$inferSelect;
