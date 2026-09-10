import { and, asc, desc, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applicationTouchpoints,
  jobApplications,
  type ApplicationTouchpoint,
  type JobApplication,
} from "@/lib/db/schema";

type ApplicationStatus =
  | "draft"
  | "applied"
  | "screening"
  | "interviewing"
  | "offer"
  | "rejected"
  | "ghosted";

type TouchpointKind =
  | "submitted"
  | "recruiter_pitch"
  | "referral_pitch"
  | "follow_up_1"
  | "follow_up_2"
  | "interview"
  | "note";

type Channel =
  | "portal"
  | "email"
  | "linkedin"
  | "whatsapp"
  | "twitter"
  | "instagram"
  | "facebook"
  | "discord"
  | "slack"
  | "telegram"
  | "other";

const OPEN_STATUSES: ApplicationStatus[] = [
  "draft",
  "applied",
  "screening",
  "interviewing",
];

const dedupe = (company: string, role: string) =>
  `${company.trim().toLowerCase()}|${role.trim().toLowerCase().replace(/\s+/g, " ")}`;

const daysFromNow = (n: number) => new Date(Date.now() + n * 864e5);

export interface RecordApplicationInput {
  company: string;
  role: string;
  dedupeKey?: string;
  jdText?: string;
  jdUrl?: string;
  source?: string;
  portal?: string;
  contactName?: string;
  contactChannel?: Channel;
  remoteKind?: "remote" | "onsite_foreign" | "onsite_india";
  salaryRaw?: string;
  salaryLpa?: number;
  companyType?:
    | "product"
    | "agency_named_client"
    | "agency_unnamed"
    | "body_shop"
    | "unknown";
  fundingStage?: string;
  fundingNote?: string;
  replyLikelihood?: number;
  skillMatch?: number;
  matchedSkills?: unknown[];
  matchedFeatures?: unknown[];
  proofBundle?: unknown[];
  flags?: string[];
  bundleDir?: string;
}

/** Upsert a prepped job on `(user, dedupeKey)`. Re-recording the same job
 *  refreshes its fields but never regresses `status` past `draft`. */
export async function recordApplication(
  userId: string,
  input: RecordApplicationInput,
): Promise<JobApplication> {
  const dedupeKey =
    input.dedupeKey?.trim() || dedupe(input.company, input.role);

  const values = {
    userId,
    dedupeKey,
    company: input.company.trim(),
    role: input.role.trim(),
    jdText: input.jdText ?? null,
    jdUrl: input.jdUrl ?? null,
    source: input.source ?? null,
    portal: input.portal ?? null,
    contactName: input.contactName ?? null,
    contactChannel: input.contactChannel ?? null,
    remoteKind: input.remoteKind ?? null,
    salaryRaw: input.salaryRaw ?? null,
    salaryLpa: input.salaryLpa ?? null,
    companyType: input.companyType ?? null,
    fundingStage: input.fundingStage ?? null,
    fundingNote: input.fundingNote ?? null,
    replyLikelihood: input.replyLikelihood ?? null,
    skillMatch: input.skillMatch ?? null,
    matchedSkills: (input.matchedSkills ?? []) as object,
    matchedFeatures: (input.matchedFeatures ?? []) as object,
    proofBundle: (input.proofBundle ?? []) as object,
    flags: (input.flags ?? []) as object,
    bundleDir: input.bundleDir ?? null,
  };

  const [row] = await db
    .insert(jobApplications)
    .values(values)
    .onConflictDoUpdate({
      target: [jobApplications.userId, jobApplications.dedupeKey],
      set: { ...values, updatedAt: new Date() },
    })
    .returning();
  return row;
}

export async function setApplicationStatus(
  userId: string,
  id: string,
  status: ApplicationStatus,
  appliedAt?: Date,
): Promise<void> {
  await db
    .update(jobApplications)
    .set({
      status,
      appliedAt:
        status === "applied" ? (appliedAt ?? new Date()) : undefined,
      updatedAt: new Date(),
    })
    .where(and(eq(jobApplications.userId, userId), eq(jobApplications.id, id)));
}

export interface RecordTouchpointInput {
  applicationId: string;
  kind: TouchpointKind;
  channel?: Channel;
  sentAt?: Date;
  responseSummary?: string;
  note?: string;
  /** Overrides the default follow-up cadence (day 5 → day 12). */
  nextDueAt?: Date | null;
}

/** Default next-follow-up cadence, keyed by the touchpoint just sent. */
function defaultNextDue(kind: TouchpointKind): Date | null {
  if (kind === "submitted" || kind === "recruiter_pitch" || kind === "referral_pitch")
    return daysFromNow(5); // → follow_up_1
  if (kind === "follow_up_1") return daysFromNow(7); // → follow_up_2 (day 12)
  return null;
}

export async function recordTouchpoint(
  userId: string,
  input: RecordTouchpointInput,
): Promise<ApplicationTouchpoint> {
  const nextDueAt =
    input.nextDueAt === undefined
      ? defaultNextDue(input.kind)
      : input.nextDueAt;

  const [row] = await db
    .insert(applicationTouchpoints)
    .values({
      userId,
      applicationId: input.applicationId,
      kind: input.kind,
      channel: input.channel ?? "other",
      sentAt: input.sentAt ?? new Date(),
      responseSummary: input.responseSummary ?? null,
      note: input.note ?? null,
      nextDueAt,
    })
    .returning();

  // "submitted" is the moment an application actually goes out
  if (input.kind === "submitted") {
    await db
      .update(jobApplications)
      .set({ status: "applied", appliedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(jobApplications.userId, userId),
          eq(jobApplications.id, input.applicationId),
          eq(jobApplications.status, "draft"),
        ),
      );
  }
  return row;
}

// ── reads ─────────────────────────────────────────────────────────────────

export interface ApplicationListItem extends JobApplication {
  lastTouchpoint: {
    kind: string;
    channel: string;
    sentAt: string;
    nextDueAt: string | null;
  } | null;
  touchpointCount: number;
}

async function withTouchpoints(
  rows: JobApplication[],
): Promise<ApplicationListItem[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const tps = await db
    .select()
    .from(applicationTouchpoints)
    .where(inArray(applicationTouchpoints.applicationId, ids))
    .orderBy(asc(applicationTouchpoints.sentAt));

  const byApp = new Map<string, ApplicationTouchpoint[]>();
  for (const t of tps) {
    const arr = byApp.get(t.applicationId) ?? [];
    arr.push(t);
    byApp.set(t.applicationId, arr);
  }

  return rows.map((r) => {
    const list = byApp.get(r.id) ?? [];
    const last = list.at(-1);
    return {
      ...r,
      touchpointCount: list.length,
      lastTouchpoint: last
        ? {
            kind: last.kind,
            channel: last.channel,
            sentAt: last.sentAt.toISOString(),
            nextDueAt: last.nextDueAt?.toISOString() ?? null,
          }
        : null,
    };
  });
}

export async function listApplications(
  userId: string,
  opts?: { status?: ApplicationStatus },
): Promise<ApplicationListItem[]> {
  const rows = await db
    .select()
    .from(jobApplications)
    .where(
      and(
        eq(jobApplications.userId, userId),
        opts?.status ? eq(jobApplications.status, opts.status) : undefined,
      ),
    )
    .orderBy(desc(jobApplications.updatedAt));
  return withTouchpoints(rows);
}

export async function listOpenApplications(
  userId: string,
  status?: ApplicationStatus,
): Promise<ApplicationListItem[]> {
  const rows = await db
    .select()
    .from(jobApplications)
    .where(
      and(
        eq(jobApplications.userId, userId),
        status
          ? eq(jobApplications.status, status)
          : inArray(jobApplications.status, OPEN_STATUSES),
      ),
    )
    .orderBy(desc(jobApplications.updatedAt));
  return withTouchpoints(rows);
}

/** Applications whose latest touchpoint's `nextDueAt` has passed and that are
 *  still in play — what `/apply-followups` acts on each morning. */
export async function listDueFollowups(
  userId: string,
): Promise<{ application: JobApplication; lastKind: string; dueAt: string }[]> {
  const rows = await db
    .select({
      app: jobApplications,
      kind: applicationTouchpoints.kind,
      dueAt: applicationTouchpoints.nextDueAt,
      sentAt: applicationTouchpoints.sentAt,
    })
    .from(applicationTouchpoints)
    .innerJoin(
      jobApplications,
      eq(jobApplications.id, applicationTouchpoints.applicationId),
    )
    .where(
      and(
        eq(applicationTouchpoints.userId, userId),
        isNotNull(applicationTouchpoints.nextDueAt),
        lte(applicationTouchpoints.nextDueAt, new Date()),
        inArray(jobApplications.status, ["applied", "screening"]),
      ),
    )
    .orderBy(desc(applicationTouchpoints.sentAt));

  // keep only the most recent touchpoint per application
  const seen = new Set<string>();
  const out: { application: JobApplication; lastKind: string; dueAt: string }[] =
    [];
  for (const r of rows) {
    if (seen.has(r.app.id)) continue;
    seen.add(r.app.id);
    out.push({
      application: r.app,
      lastKind: r.kind,
      dueAt: r.dueAt!.toISOString(),
    });
  }
  return out;
}

export async function getApplication(
  userId: string,
  id: string,
): Promise<{
  application: JobApplication;
  touchpoints: ApplicationTouchpoint[];
} | null> {
  const [application] = await db
    .select()
    .from(jobApplications)
    .where(and(eq(jobApplications.userId, userId), eq(jobApplications.id, id)))
    .limit(1);
  if (!application) return null;
  const touchpoints = await db
    .select()
    .from(applicationTouchpoints)
    .where(eq(applicationTouchpoints.applicationId, id))
    .orderBy(asc(applicationTouchpoints.sentAt));
  return { application, touchpoints };
}

export async function countApplicationsByStatus(
  userId: string,
): Promise<Record<string, number>> {
  const rows = await db
    .select({
      status: jobApplications.status,
      n: sql<number>`count(*)::int`,
    })
    .from(jobApplications)
    .where(eq(jobApplications.userId, userId))
    .groupBy(jobApplications.status);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = r.n;
  return out;
}

export interface ApplicationOverviewRow {
  id: string;
  company: string;
  role: string;
  status: ApplicationStatus;
  bundleDir: string | null;
  createdAt: string;
  /** touchpoints rolled up per channel */
  channels: { channel: string; count: number; lastAt: string }[];
  /** distinct touchpoint kinds seen, in first-seen order */
  kinds: string[];
  lastAt: string | null;
  nextDueAt: string | null;
  overdue: boolean;
}

/** One compact row per application: which channels have been used and what's due. */
export async function applicationsOverview(
  userId: string,
): Promise<ApplicationOverviewRow[]> {
  const apps = await db
    .select()
    .from(jobApplications)
    .where(eq(jobApplications.userId, userId))
    .orderBy(desc(jobApplications.createdAt));
  if (apps.length === 0) return [];

  const tps = await db
    .select()
    .from(applicationTouchpoints)
    .where(
      inArray(
        applicationTouchpoints.applicationId,
        apps.map((a) => a.id),
      ),
    )
    .orderBy(asc(applicationTouchpoints.sentAt));

  const byApp = new Map<string, ApplicationTouchpoint[]>();
  for (const t of tps) {
    const arr = byApp.get(t.applicationId) ?? [];
    arr.push(t);
    byApp.set(t.applicationId, arr);
  }

  const now = Date.now();
  return apps.map((a) => {
    const list = byApp.get(a.id) ?? [];
    const chMap = new Map<string, { count: number; lastAt: Date }>();
    const kinds: string[] = [];
    for (const t of list) {
      const e = chMap.get(t.channel);
      if (e) {
        e.count += 1;
        if (t.sentAt > e.lastAt) e.lastAt = t.sentAt;
      } else {
        chMap.set(t.channel, { count: 1, lastAt: t.sentAt });
      }
      if (!kinds.includes(t.kind)) kinds.push(t.kind);
    }
    const last = list.at(-1) ?? null;
    const nextDue = last?.nextDueAt ?? null;
    return {
      id: a.id,
      company: a.company,
      role: a.role,
      status: a.status as ApplicationStatus,
      bundleDir: a.bundleDir,
      createdAt: a.createdAt.toISOString(),
      channels: [...chMap.entries()].map(([channel, v]) => ({
        channel,
        count: v.count,
        lastAt: v.lastAt.toISOString(),
      })),
      kinds,
      lastAt: last?.sentAt.toISOString() ?? null,
      nextDueAt: nextDue?.toISOString() ?? null,
      overdue: nextDue
        ? nextDue.getTime() < now &&
          (a.status === "applied" || a.status === "screening")
        : false,
    };
  });
}
