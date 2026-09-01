import {
  index,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import {
  contentPlatformEnum,
  contentSourceTypeEnum,
  contentStatusEnum,
  createdAt,
  updatedAt,
  userId,
} from "./_shared";
import { agentRuns } from "./agents";

/** A "build in public" post moving through idea → draft → review → approved → published. */
export const contentItems = pgTable(
  "content_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    platform: contentPlatformEnum("platform").notNull().default("linkedin"),
    status: contentStatusEnum("status").notNull().default("idea"),
    title: text("title").notNull(),
    /** One-line hook / opening angle. */
    hook: text("hook"),
    /** Suggested take the draft should develop. */
    angle: text("angle"),
    body: text("body"),
    agentRunId: uuid("agent_run_id").references(() => agentRuns.id, {
      onDelete: "set null",
    }),
    createdAt,
    updatedAt,
  },
  (t) => [index("content_items_user_status_idx").on(t.userId, t.status)],
).enableRLS();

/** The real event(s) a content item is grounded in. */
export const contentSources = pgTable(
  "content_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    contentItemId: uuid("content_item_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    sourceType: contentSourceTypeEnum("source_type").notNull(),
    sourceId: uuid("source_id"),
    note: text("note"),
    createdAt,
  },
  (t) => [
    index("content_sources_item_idx").on(t.contentItemId),
    index("content_sources_lookup_idx").on(t.userId, t.sourceType, t.sourceId),
  ],
).enableRLS();

export type ContentItem = typeof contentItems.$inferSelect;
export type ContentSource = typeof contentSources.$inferSelect;
