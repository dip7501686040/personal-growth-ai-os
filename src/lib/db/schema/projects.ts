import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
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
    /** GitHub URL — the base for proof links (`repoUrl/tree/main/<codePath>`). */
    repoUrl: text("repo_url"),
    liveUrl: text("live_url"),
    /** git SHA at the last `/sync-repo` run — later runs diff `<sha>..HEAD`. */
    lastSyncedSha: text("last_synced_sha"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    /** When true, this project's `done` features are served by the public
     *  proof API (`/api/public/features`) for the portfolio site (J6). */
    isPublic: boolean("is_public").notNull().default(false),
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
    /** Cloudinary demo clip for this feature (proof link, priority #1). */
    demoVideoUrl: text("demo_video_url"),
    /** Named repo sub-paths per JD keyword, e.g. {"k8s":"infra/k8s"} — resolved
     *  to `repoUrl/tree/main/<path>` when a JD asks for that skill. */
    codePaths: jsonb("code_paths"),
    /** Stable identity for idempotent `/sync-repo` reconcile:
     *  `repo:<url>:feature:<slug>`. Null for hand-created features. */
    sourceKey: text("source_key"),
    /** Last `/sync-repo` run that still detected this feature in the repo. */
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt,
  },
  (t) => [
    index("project_features_project_idx").on(t.projectId),
    uniqueIndex("project_features_source_key_idx")
      .on(t.userId, t.sourceKey)
      .where(sql`${t.sourceKey} is not null`),
  ],
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
