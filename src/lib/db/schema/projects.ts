import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  createdAt,
  featureStatusEnum,
  projectSkillRoleEnum,
  projectStatusEnum,
  updatedAt,
  userId,
} from "./_shared";
import { skills } from "./skills";

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    problemSolved: text("problem_solved"),
    architecture: text("architecture"),
    status: projectStatusEnum("status").notNull().default("idea"),
    /** Absolute repo path, for the Phase 2.5 activity collector to match on. */
    repoPath: text("repo_path"),
    createdAt,
    updatedAt,
  },
  (t) => [uniqueIndex("projects_user_slug_idx").on(t.userId, t.slug)],
).enableRLS();

export const projectFeatures = pgTable(
  "project_features",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    status: featureStatusEnum("status").notNull().default("planned"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt,
  },
  (t) => [index("project_features_project_idx").on(t.projectId)],
).enableRLS();

/**
 * Skill touched by a project (feature_id null) or a specific feature.
 * `role` says how strongly: planned → used → demonstrated. A `done` feature's
 * used/demonstrated skills get project_feature evidence toward IMPLEMENTED.
 */
export const projectSkills = pgTable(
  "project_skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    featureId: uuid("feature_id").references(() => projectFeatures.id, {
      onDelete: "cascade",
    }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    role: projectSkillRoleEnum("role").notNull().default("used"),
    notes: text("notes"),
    createdAt,
  },
  (t) => [
    index("project_skills_project_idx").on(t.projectId),
    index("project_skills_skill_idx").on(t.userId, t.skillId),
  ],
).enableRLS();

export type Project = typeof projects.$inferSelect;
export type ProjectFeature = typeof projectFeatures.$inferSelect;
export type ProjectSkill = typeof projectSkills.$inferSelect;
