/**
 * Wipes and reseeds the demo account's data — every table scoped by
 * `user_id`, deleted (children first) and reinserted with realistic but
 * clearly-fictional content. Isolated by construction: this only ever
 * touches rows whose `user_id` is the demo account's, resolved by the
 * caller via getDemoUserId() — never the real owner's.
 *
 * Called from:
 *   - `pnpm seed-demo` (scripts/seed-demo.ts, for first-time seeding)
 *   - the daily demo-reset cron job (src/app/api/cron/[job]/route.ts) — once
 *     a day is Vercel Hobby's cron ceiling; logout below covers the common
 *     case in between
 *   - logout, when the signed-out user was the demo account
 *     (src/app/auth/signout/route.ts)
 */
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  agentRuns,
  applicationTouchpoints,
  approvals,
  businessOpportunities,
  careerMatches,
  careerOpportunities,
  contentItems,
  contentSources,
  dailyBriefings,
  dsaAttempts,
  dsaProblems,
  jobApplications,
  learningSessions,
  projectFeatures,
  projectSkills,
  projects,
  skillEvidence,
  skills,
} from "@/lib/db/schema";

/** Deletes every demo-owned row, children before parents. Two tables
 *  (`learning_session_skills`, `dsa_problem_patterns`) are pure join tables
 *  with no `user_id` column of their own, so they're cleared via a subquery
 *  on their user-scoped parent instead. */
async function wipe(userId: string) {
  await db.execute(
    sql`delete from learning_session_skills where session_id in (select id from learning_sessions where user_id = ${userId})`,
  );
  await db.execute(
    sql`delete from dsa_problem_patterns where problem_id in (select id from dsa_problems where user_id = ${userId})`,
  );
  await db.delete(projectSkills).where(sql`user_id = ${userId}`);
  await db.delete(dsaAttempts).where(sql`user_id = ${userId}`);
  await db.delete(skillEvidence).where(sql`user_id = ${userId}`);
  await db.delete(careerMatches).where(sql`user_id = ${userId}`);
  await db.delete(contentSources).where(sql`user_id = ${userId}`);
  await db.delete(applicationTouchpoints).where(sql`user_id = ${userId}`);
  await db.delete(projectFeatures).where(sql`user_id = ${userId}`);
  await db.delete(dsaProblems).where(sql`user_id = ${userId}`);
  await db.delete(skills).where(sql`user_id = ${userId}`);
  await db.delete(projects).where(sql`user_id = ${userId}`);
  await db.delete(careerOpportunities).where(sql`user_id = ${userId}`);
  await db.delete(contentItems).where(sql`user_id = ${userId}`);
  await db.delete(businessOpportunities).where(sql`user_id = ${userId}`);
  await db.delete(jobApplications).where(sql`user_id = ${userId}`);
  await db.delete(approvals).where(sql`user_id = ${userId}`);
  await db.delete(dailyBriefings).where(sql`user_id = ${userId}`);
  await db.delete(agentRuns).where(sql`user_id = ${userId}`);
}

async function seed(userId: string) {
  // ── skills ──────────────────────────────────────────────────────────────
  const skillSeed = [
    { name: "TypeScript", category: "language" as const, level: "proven" as const },
    { name: "Node.js", category: "framework" as const, level: "proven" as const },
    { name: "React", category: "framework" as const, level: "implemented" as const },
    { name: "PostgreSQL", category: "database" as const, level: "implemented" as const },
    { name: "Docker", category: "infrastructure" as const, level: "practiced" as const },
    { name: "Kubernetes", category: "infrastructure" as const, level: "practiced" as const },
    { name: "REST APIs", category: "concept" as const, level: "proven" as const },
    { name: "System Design", category: "concept" as const, level: "learning" as const },
  ];
  const insertedSkills = await db
    .insert(skills)
    .values(
      skillSeed.map((s) => ({
        userId,
        name: s.name,
        slug: s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        category: s.category,
        level: s.level,
        confidence: 70,
      })),
    )
    .returning({ id: skills.id, name: skills.name });
  const skillId = (name: string) => insertedSkills.find((s) => s.name === name)!.id;

  await db.insert(skillEvidence).values([
    {
      userId,
      skillId: skillId("TypeScript"),
      sourceType: "manual",
      summary: "Five years building production TypeScript services.",
      strength: "strong",
      supportsLevel: "proven",
      status: "accepted",
      decidedAt: new Date(),
    },
    {
      userId,
      skillId: skillId("Docker"),
      sourceType: "manual",
      summary: "Containerized every service in the demo task-tracker project.",
      strength: "moderate",
      supportsLevel: "practiced",
      status: "accepted",
      decidedAt: new Date(),
    },
  ]);

  // ── projects ────────────────────────────────────────────────────────────
  const [taskTracker] = await db
    .insert(projects)
    .values({
      userId,
      name: "Demo Task Tracker",
      slug: "demo-task-tracker",
      description: "A small multi-user task board — sample project data for this demo account.",
      tagline: "Kanban-style task tracker with real-time updates.",
      status: "completed",
      repoUrl: "https://github.com/example/demo-task-tracker",
      isPublic: true,
    })
    .returning({ id: projects.id });
  const [notifyService] = await db
    .insert(projects)
    .values({
      userId,
      name: "Demo Notification Service",
      slug: "demo-notification-service",
      description:
        "An event-driven notification microservice — sample project data for this demo account.",
      tagline: "Routes app events to email/push with retry handling.",
      status: "building",
      repoUrl: "https://github.com/example/demo-notification-service",
      isPublic: true,
    })
    .returning({ id: projects.id });

  const featureSeed = [
    { projectId: taskTracker.id, title: "Drag-and-drop board", status: "done" as const },
    { projectId: taskTracker.id, title: "Real-time sync via WebSockets", status: "done" as const },
    { projectId: taskTracker.id, title: "Team permissions", status: "in_progress" as const },
    { projectId: notifyService.id, title: "Event queue consumer", status: "done" as const },
    { projectId: notifyService.id, title: "Retry with backoff", status: "done" as const },
  ];
  await db.insert(projectFeatures).values(
    featureSeed.map((f) => ({
      userId,
      projectId: f.projectId,
      title: f.title,
      status: f.status,
      completedAt: f.status === "done" ? new Date() : null,
    })),
  );

  await db.insert(projectSkills).values([
    { userId, projectId: taskTracker.id, skillId: skillId("TypeScript"), role: "demonstrated" },
    { userId, projectId: taskTracker.id, skillId: skillId("React"), role: "demonstrated" },
    { userId, projectId: notifyService.id, skillId: skillId("Node.js"), role: "demonstrated" },
    { userId, projectId: notifyService.id, skillId: skillId("Docker"), role: "used" },
  ]);

  // ── learning ────────────────────────────────────────────────────────────
  await db.insert(learningSessions).values([
    {
      userId,
      topic: "Event-driven architecture patterns",
      category: "system_design",
      description: "Studied outbox pattern and idempotent consumers.",
      durationMinutes: 60,
      confidenceBefore: 40,
      confidenceAfter: 70,
    },
    {
      userId,
      topic: "PostgreSQL query planning",
      category: "technology",
      description: "EXPLAIN ANALYZE deep dive, index strategy.",
      durationMinutes: 45,
      confidenceBefore: 50,
      confidenceAfter: 75,
    },
  ]);

  const [dsaProblem] = await db
    .insert(dsaProblems)
    .values({
      userId,
      title: "Two Sum",
      difficulty: "easy",
      topic: "Arrays / Hash Map",
    })
    .returning({ id: dsaProblems.id });
  await db.insert(dsaAttempts).values({
    userId,
    problemId: dsaProblem.id,
    solved: true,
    timeTakenMinutes: 12,
    confidenceBefore: 60,
    confidenceAfter: 90,
    failureReason: "none",
  });

  // ── career ──────────────────────────────────────────────────────────────
  const [careerOpp] = await db
    .insert(careerOpportunities)
    .values({
      userId,
      company: "Example Corp",
      role: "Senior Backend Engineer",
      location: "Remote",
      description: "Sample opportunity — backend role on a payments platform.",
      status: "analyzed",
    })
    .returning({ id: careerOpportunities.id });
  await db.insert(careerOpportunities).values([
    {
      userId,
      company: "Sample Startup Inc",
      role: "Founding Engineer",
      location: "Remote",
      description: "Sample opportunity — early engineer at a seed-stage startup.",
      status: "new",
    },
    {
      userId,
      company: "Demo Platforms Ltd",
      role: "Platform Engineer",
      location: "Remote",
      description: "Sample opportunity — infra-focused platform role.",
      status: "new",
    },
  ]);
  await db.insert(careerMatches).values({
    userId,
    opportunityId: careerOpp.id,
    overallScore: 82,
    recommendation: "yes",
    summary: "Strong match on backend + TypeScript, some gap on payments-domain experience.",
    provenMatches: ["TypeScript", "Node.js", "REST APIs"],
    implementedMatches: ["PostgreSQL"],
    missingSkills: ["Payments/PCI experience"],
    rationale: "Sample AI-generated rationale for this demo match.",
  });

  // ── applications ────────────────────────────────────────────────────────
  const [app1] = await db
    .insert(jobApplications)
    .values({
      userId,
      dedupeKey: "example-corp|senior-backend-engineer",
      company: "Example Corp",
      role: "Senior Backend Engineer",
      status: "applied",
      remoteKind: "remote",
      salaryLpa: 28,
      companyType: "product",
      replyLikelihood: 0.65,
      skillMatch: 0.8,
    })
    .returning({ id: jobApplications.id });
  await db.insert(jobApplications).values([
    {
      userId,
      dedupeKey: "sample-startup-inc|founding-engineer",
      company: "Sample Startup Inc",
      role: "Founding Engineer",
      status: "draft",
      remoteKind: "remote",
      salaryLpa: 22,
      companyType: "product",
      replyLikelihood: 0.5,
      skillMatch: 0.7,
    },
    {
      userId,
      dedupeKey: "demo-platforms-ltd|platform-engineer",
      company: "Demo Platforms Ltd",
      role: "Platform Engineer",
      status: "screening",
      remoteKind: "remote",
      salaryLpa: 25,
      companyType: "product",
      replyLikelihood: 0.6,
      skillMatch: 0.75,
    },
  ]);
  await db.insert(applicationTouchpoints).values({
    userId,
    applicationId: app1.id,
    kind: "submitted",
    channel: "portal",
    nextDueAt: new Date(Date.now() + 5 * 864e5),
  });

  // ── business ────────────────────────────────────────────────────────────
  await db.insert(businessOpportunities).values([
    {
      userId,
      title: "Sample: Freelancer Invoice Automation",
      problem: "Freelancers lose time on manual invoicing and follow-ups.",
      targetCustomer: "Independent contractors and small agencies.",
      proposedSolution: "Automated invoice generation with payment-reminder emails.",
      techStack: ["Next.js", "Stripe", "PostgreSQL"],
      complexity: "medium",
      status: "exploring",
    },
    {
      userId,
      title: "Sample: Habit-Tracking API",
      problem: "Developers building habit apps re-implement the same streak logic.",
      targetCustomer: "Indie app developers.",
      proposedSolution: "A drop-in API for streaks, reminders, and habit analytics.",
      techStack: ["Node.js", "Redis"],
      complexity: "low",
      status: "idea",
    },
  ]);

  // ── content ─────────────────────────────────────────────────────────────
  await db.insert(contentItems).values([
    {
      userId,
      platform: "linkedin",
      status: "published",
      title: "Sample post: What I learned building an event-driven notification service",
      hook: "Retries are easy. Idempotent retries are the actual problem.",
      body: "Sample published post body for this demo account.",
      isPublic: true,
    },
    {
      userId,
      platform: "linkedin",
      status: "draft",
      title: "Sample post: Postgres index strategy notes",
      hook: "EXPLAIN ANALYZE told me everything I was doing wrong.",
      body: "Sample draft post body for this demo account.",
    },
    {
      userId,
      platform: "portfolio",
      status: "published",
      title: "Demo Task Tracker — drag-and-drop board",
      body: "Sample portfolio card caption.",
      assetType: "screenshot",
      isPublic: true,
    },
  ]);

  // ── approvals ───────────────────────────────────────────────────────────
  await db.insert(approvals).values([
    {
      userId,
      agentName: "career",
      actionType: "apply_job",
      title: "Apply to Example Corp — Senior Backend Engineer?",
      reason: "Sample pending approval — 82% match score from the career agent.",
      status: "pending",
    },
    {
      userId,
      agentName: "learning",
      actionType: "change_learning_priority",
      title: "Prioritize System Design over DSA this week?",
      reason: "Sample pending approval — sample agent recommendation.",
      status: "pending",
    },
  ]);

  // ── agent runs + briefing (for Activity / Dashboard) ───────────────────
  const [run] = await db
    .insert(agentRuns)
    .values({
      userId,
      agentName: "chief_of_staff",
      status: "completed",
      triggerSource: "schedule",
      startedAt: new Date(Date.now() - 60_000),
      finishedAt: new Date(),
    })
    .returning({ id: agentRuns.id });

  await db.insert(dailyBriefings).values({
    userId,
    briefingDate: new Date().toISOString().slice(0, 10),
    agentRunId: run.id,
    summary: "Sample daily briefing for this demo account.",
    priorities: [
      { title: "Follow up with Example Corp", why: "Applied 5 days ago", category: "applications" },
    ],
  });
}

export async function resetDemoData(userId: string): Promise<void> {
  await wipe(userId);
  await seed(userId);
}
