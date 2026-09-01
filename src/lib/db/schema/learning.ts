import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import {
  createdAt,
  dsaDifficultyEnum,
  dsaFailureReasonEnum,
  learningCategoryEnum,
  userId,
} from "./_shared";
import { skills } from "./skills";

/** A study session: a topic, technology, system-design concept, or revision. */
export const learningSessions = pgTable(
  "learning_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    topic: text("topic").notNull(),
    category: learningCategoryEnum("category").notNull(),
    description: text("description"),
    resourceUrl: text("resource_url"),
    durationMinutes: integer("duration_minutes"),
    confidenceBefore: integer("confidence_before"),
    confidenceAfter: integer("confidence_after"),
    notes: text("notes"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt,
  },
  (t) => [index("learning_sessions_user_occurred_idx").on(t.userId, t.occurredAt)],
).enableRLS();

export const learningSessionSkills = pgTable(
  "learning_session_skills",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => learningSessions.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.skillId] })],
).enableRLS();

/** Reference list of DSA patterns (global, seeded in the migration). */
export const dsaPatterns = pgTable("dsa_patterns", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
}).enableRLS();

export const dsaProblems = pgTable(
  "dsa_problems",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    title: text("title").notNull(),
    sourceUrl: text("source_url"),
    difficulty: dsaDifficultyEnum("difficulty").notNull(),
    topic: text("topic"),
    notes: text("notes"),
    createdAt,
  },
  (t) => [index("dsa_problems_user_idx").on(t.userId)],
).enableRLS();

export const dsaProblemPatterns = pgTable(
  "dsa_problem_patterns",
  {
    problemId: uuid("problem_id")
      .notNull()
      .references(() => dsaProblems.id, { onDelete: "cascade" }),
    patternId: uuid("pattern_id")
      .notNull()
      .references(() => dsaPatterns.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.problemId, t.patternId] })],
).enableRLS();

/** One attempt at a problem — the raw material for pattern-recognition analysis. */
export const dsaAttempts = pgTable(
  "dsa_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    problemId: uuid("problem_id")
      .notNull()
      .references(() => dsaProblems.id, { onDelete: "cascade" }),
    attemptedAt: timestamp("attempted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    timeTakenMinutes: integer("time_taken_minutes"),
    solved: boolean("solved").notNull().default(false),
    hintsUsed: integer("hints_used").notNull().default(0),
    confidenceBefore: integer("confidence_before"),
    confidenceAfter: integer("confidence_after"),
    failureReason: dsaFailureReasonEnum("failure_reason").notNull().default("none"),
    notes: text("notes"),
    createdAt,
  },
  (t) => [
    index("dsa_attempts_user_attempted_idx").on(t.userId, t.attemptedAt),
    index("dsa_attempts_problem_idx").on(t.problemId),
  ],
).enableRLS();

export type LearningSession = typeof learningSessions.$inferSelect;
export type DsaPattern = typeof dsaPatterns.$inferSelect;
export type DsaProblem = typeof dsaProblems.$inferSelect;
export type DsaAttempt = typeof dsaAttempts.$inferSelect;
