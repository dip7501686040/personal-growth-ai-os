import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  applicationStatusEnum,
  companyTypeEnum,
  createdAt,
  remoteKindEnum,
  touchpointChannelEnum,
  touchpointKindEnum,
  updatedAt,
  userId,
} from "./_shared";

/**
 * One row per job you prep with `/apply-morning` (Track J). Written by the
 * `record_application` MCP tool; read by `/applications` and the follow-up
 * flow. `bundleDir` points at the local `applications/<date>/<company>__<role>/`
 * folder that holds the generated résumé / pitches / proof bundle.
 */
export const jobApplications = pgTable(
  "job_applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    /** stable per job — `<company>|<normalized role>`; re-records upsert on it */
    dedupeKey: text("dedupe_key").notNull(),
    company: text("company").notNull(),
    role: text("role").notNull(),
    jdText: text("jd_text"),
    jdUrl: text("jd_url"),
    /** which board/portal it came from (jsearch, weworkremotely, linkedin, …) */
    source: text("source"),
    portal: text("portal"),
    contactName: text("contact_name"),
    contactChannel: touchpointChannelEnum("contact_channel"),
    remoteKind: remoteKindEnum("remote_kind"),
    salaryRaw: text("salary_raw"),
    salaryLpa: real("salary_lpa"),
    companyType: companyTypeEnum("company_type"),
    fundingStage: text("funding_stage"),
    fundingNote: text("funding_note"),
    status: applicationStatusEnum("status").notNull().default("draft"),
    replyLikelihood: real("reply_likelihood"),
    skillMatch: real("skill_match"),
    matchedSkills: jsonb("matched_skills").notNull().default(sql`'[]'::jsonb`),
    matchedFeatures: jsonb("matched_features").notNull().default(sql`'[]'::jsonb`),
    proofBundle: jsonb("proof_bundle").notNull().default(sql`'[]'::jsonb`),
    /** flags[] from the scorer (agency_unnamed, stale:34d, verify_funding, …) */
    flags: jsonb("flags").notNull().default(sql`'[]'::jsonb`),
    bundleDir: text("bundle_dir"),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    /** Set by the "Process content" button on /applications; cleared once a
     *  session has run ensureVisualProof across the job's proof-bundle
     *  features and regenerated the bundle. */
    contentRequestedAt: timestamp("content_requested_at", { withTimezone: true }),
    contentPreparedAt: timestamp("content_prepared_at", { withTimezone: true }),
    /** Set by the "Apply" button; cleared (via appliedAt) once a session has
     *  run apply-fill/apply-drive and you've clicked Submit. */
    applyRequestedAt: timestamp("apply_requested_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex("job_applications_user_dedupe_idx").on(t.userId, t.dedupeKey),
    index("job_applications_user_status_idx").on(t.userId, t.status),
  ],
).enableRLS();

/**
 * Every message sent about an application (and interviews / notes). The
 * follow-up flow reads the latest touchpoint's `nextDueAt` to decide what's
 * owed each morning.
 */
export const applicationTouchpoints = pgTable(
  "application_touchpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    applicationId: uuid("application_id")
      .notNull()
      .references(() => jobApplications.id, { onDelete: "cascade" }),
    kind: touchpointKindEnum("kind").notNull(),
    channel: touchpointChannelEnum("channel").notNull().default("other"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    responseAt: timestamp("response_at", { withTimezone: true }),
    responseSummary: text("response_summary"),
    nextDueAt: timestamp("next_due_at", { withTimezone: true }),
    note: text("note"),
    createdAt,
  },
  (t) => [
    index("application_touchpoints_app_idx").on(t.applicationId, t.sentAt),
    index("application_touchpoints_due_idx").on(t.userId, t.nextDueAt),
  ],
).enableRLS();

export type JobApplication = typeof jobApplications.$inferSelect;
export type NewJobApplication = typeof jobApplications.$inferInsert;
export type ApplicationTouchpoint = typeof applicationTouchpoints.$inferSelect;
export type NewApplicationTouchpoint =
  typeof applicationTouchpoints.$inferInsert;
