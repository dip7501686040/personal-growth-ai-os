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
import { chunkText, estimateTokens, upsertDocumentRow } from "@/lib/knowledge";
import { demoFolderName, persist } from "@/modules/applications/generate";
import {
  agentRuns,
  applicationTouchpoints,
  approvals,
  businessOpportunities,
  careerMatches,
  careerOpportunities,
  contentItems,
  contentSources,
  contextEvents,
  cronRuns,
  dailyBriefings,
  dsaAttempts,
  dsaProblems,
  ingestionJobs,
  ingestionSources,
  jobApplications,
  knowledgeChunks,
  knowledgeDocuments,
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
  await db.delete(learningSessions).where(sql`user_id = ${userId}`);
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
  await db.delete(ingestionJobs).where(sql`user_id = ${userId}`);
  await db.delete(ingestionSources).where(sql`user_id = ${userId}`);
  await db.delete(contextEvents).where(sql`user_id = ${userId}`);
  await db.delete(cronRuns).where(sql`user_id = ${userId}`);
  // knowledgeChunks cascade-deletes with their parent document.
  await db.delete(knowledgeDocuments).where(sql`user_id = ${userId}`);
}

/** The 2-3 sample application folders shown on /applications' "Folders"
 *  section for the demo account, matching the 3 jobApplications rows seeded
 *  below 1:1 (same company/role, so the status badge lines up). Folder names
 *  use demoFolderName() (the "demo-" prefix), so they're only ever visible
 *  to the demo account — see DEMO_FOLDER_PREFIX / isDemoFolder in
 *  modules/applications/generate.ts. */
const DEMO_APPLICATION_FOLDERS: {
  date: string;
  company: string;
  role: string;
  salaryText: string;
  descriptionSnippet: string;
  proofProject: string;
  proofFeature: string;
  proofRepoUrl: string;
}[] = [
  {
    date: "2026-08-25",
    company: "Example Corp",
    role: "Senior Backend Engineer",
    salaryText: "₹28L (approx)",
    descriptionSnippet:
      "Sample job description for this demo account — own the payments platform's backend services.",
    proofProject: "Demo Task Tracker",
    proofFeature: "Real-time sync via WebSockets",
    proofRepoUrl: "https://github.com/example/demo-task-tracker",
  },
  {
    date: "2026-09-02",
    company: "Sample Startup Inc",
    role: "Founding Engineer",
    salaryText: "₹22L (approx)",
    descriptionSnippet:
      "Sample job description for this demo account — first backend hire at a seed-stage startup.",
    proofProject: "Demo Notification Service",
    proofFeature: "Event queue consumer",
    proofRepoUrl: "https://github.com/example/demo-notification-service",
  },
  {
    date: "2026-09-08",
    company: "Demo Platforms Ltd",
    role: "Platform Engineer",
    salaryText: "₹25L (approx)",
    descriptionSnippet:
      "Sample job description for this demo account — infra-focused platform role.",
    proofProject: "Demo Notification Service",
    proofFeature: "Retry with backoff",
    proofRepoUrl: "https://github.com/example/demo-notification-service",
  },
];

function demoBundleDir(j: (typeof DEMO_APPLICATION_FOLDERS)[number]): string {
  return `applications/${j.date}/${demoFolderName(j)}`;
}

/** Writes the static job.json / search-provenance.md / proof-bundle.md for
 *  each DEMO_APPLICATION_FOLDERS entry — hand-written, not LLM-generated
 *  (same spirit as the rest of this file's "Sample ..." fixtures), so a
 *  reset never spends real API quota. Best-effort: a failure here (e.g. R2
 *  unreachable) must not fail the rest of the demo reset. */
async function seedDemoApplicationFolders(): Promise<void> {
  try {
    for (const j of DEMO_APPLICATION_FOLDERS) {
      const folder = demoFolderName(j);
      const jdText = `${j.role} at ${j.company}\nLocation: Remote\nSalary: ${j.salaryText}\n${j.descriptionSnippet}`;

      const jobJson = {
        source: "manual",
        company: j.company,
        role: j.role,
        location: "Remote",
        salaryText: j.salaryText,
        descriptionSnippet: j.descriptionSnippet,
        url: null,
        applyUrl: null,
        remoteKind: "remote",
        companyType: "product",
        flags: ["demo_sample"],
        bundleDir: demoBundleDir(j),
        jdText,
        preparedAt: `${j.date}T09:00:00.000Z`,
      };
      await persist(j.date, folder, "job.json", JSON.stringify(jobJson, null, 2));

      const provenance = [
        `# How this job surfaced — ${j.company} / ${j.role}`,
        ``,
        `Sample folder for this demo account — not a real application. Shows`,
        `what \`/apply-morning\` writes into a job's folder: this file,`,
        `\`job.json\`, and \`proof-bundle.md\`.`,
        ``,
        `## Manual layer`,
        `- Location: Remote · remoteKind remote`,
        `- Salary: ${j.salaryText}`,
        ``,
      ].join("\n");
      await persist(j.date, folder, "search-provenance.md", provenance);

      const proofBundle = [
        `# Proof of work — ${j.company} / ${j.role}`,
        ``,
        `Sample proof bundle for this demo account — not a real application.`,
        ``,
        `## Links in this résumé`,
        ``,
        `- **${j.proofProject} — ${j.proofFeature}**: ${j.proofRepoUrl}`,
        ``,
      ].join("\n");
      await persist(j.date, folder, "proof-bundle.md", proofBundle);
    }
  } catch (e) {
    console.error("demo application folder seed failed (non-fatal):", e);
  }
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
    {
      projectId: taskTracker.id,
      title: "Drag-and-drop board",
      status: "done" as const,
      description:
        "Sample feature description for this demo account. Cards can be dragged between columns with optimistic UI updates — the board reorders instantly, then reconciles with the server.",
    },
    {
      projectId: taskTracker.id,
      title: "Real-time sync via WebSockets",
      status: "done" as const,
      description:
        "Sample feature description for this demo account. A WebSocket channel pushes board changes to every connected client within a second, so two people moving the same card see it converge live instead of on next refresh.",
    },
    {
      projectId: taskTracker.id,
      title: "Team permissions",
      status: "in_progress" as const,
      description:
        "Sample feature description for this demo account. Per-team roles gate who can create, move, or delete cards — enforced on every mutation, not just hidden in the UI.",
    },
    {
      projectId: notifyService.id,
      title: "Event queue consumer",
      status: "done" as const,
      description:
        "Sample feature description for this demo account. Consumes app events off a queue and fans them out to the right notification channel (email or push) based on the event type and user preferences.",
    },
    {
      projectId: notifyService.id,
      title: "Retry with backoff",
      status: "done" as const,
      description:
        "Sample feature description for this demo account. A failed delivery retries with exponential backoff instead of hammering a struggling downstream provider, and gives up cleanly after a bounded number of attempts.",
    },
  ];
  const insertedFeatures = await db
    .insert(projectFeatures)
    .values(
      featureSeed.map((f) => ({
        userId,
        projectId: f.projectId,
        title: f.title,
        status: f.status,
        description: f.description,
        completedAt: f.status === "done" ? new Date() : null,
      })),
    )
    .returning({ id: projectFeatures.id, title: projectFeatures.title });
  const featureId = (title: string) =>
    insertedFeatures.find((f) => f.title === title)!.id;

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

  // ── knowledge ───────────────────────────────────────────────────────────
  const taskTrackerRepo = "example/demo-task-tracker";
  const notifyRepo = "example/demo-notification-service";

  await db.insert(ingestionSources).values([
    {
      userId,
      kind: "github_repo",
      externalRef: taskTrackerRepo,
      status: "active",
      lastCursor: "a1b2c3d",
      lastSyncedAt: new Date(),
    },
    {
      userId,
      kind: "github_repo",
      externalRef: notifyRepo,
      status: "active",
      lastCursor: "e4f5a6b",
      lastSyncedAt: new Date(),
    },
  ]);

  const knowledgeDocSeed: {
    docType: string;
    title: string;
    body: string;
    sourceKind: string;
    sourceRef: string | null;
  }[] = [
    {
      docType: "repo_summary",
      title: "Demo Task Tracker — repo summary",
      body: "Sample repo summary for this demo account. A small multi-user Kanban task board: Next.js frontend, a WebSocket channel for real-time board updates, and per-team permission checks on every mutation.",
      sourceKind: "github_repo",
      // upsertDocumentRow treats (sourceKind, sourceRef) as a single-doc slot
      // (supersedes whatever was there before) — a file-level ref, not just
      // the repo, so this repo's summary and decision doc don't collide.
      sourceRef: `${taskTrackerRepo}#README.md`,
    },
    {
      docType: "decision",
      title: "Why WebSockets for board sync",
      body: "Sample decision record for this demo account. Chose a WebSocket channel over polling for the drag-and-drop board: sub-second latency matters when two people move the same card, and polling at that interval would mean far more load for a marginal experience gain.",
      sourceKind: "github_repo",
      sourceRef: `${taskTrackerRepo}#docs/decisions/0001-websocket-sync.md`,
    },
    {
      docType: "repo_summary",
      title: "Demo Notification Service — repo summary",
      body: "Sample repo summary for this demo account. An event-driven notification microservice: an event-queue consumer fans out to email/push, with retry-with-backoff so a downstream provider hiccup never drops a notification.",
      sourceKind: "github_repo",
      sourceRef: `${notifyRepo}#README.md`,
    },
    {
      docType: "concept",
      title: "Idempotent retries with exponential backoff",
      body: "Sample concept note for this demo account. A retry is only safe to repeat automatically when the operation it retries is idempotent — otherwise a transient failure plus a retry can double-send. Exponential backoff spreads retries out so a struggling downstream service gets room to recover instead of a thundering herd.",
      sourceKind: "github_repo",
      sourceRef: `${notifyRepo}#docs/notes/idempotent-retries.md`,
    },
    {
      docType: "learning",
      title: "Event-driven architecture patterns — notes",
      body: 'Sample learning note for this demo account. Studied the outbox pattern and idempotent consumers: writing the "event to publish" in the same transaction as the state change, then a separate relay publishes it — avoids the dual-write problem between a database commit and a message publish.',
      sourceKind: "internal",
      sourceRef: null,
    },
  ];

  let seededDocs = 0;
  for (const d of knowledgeDocSeed) {
    const { document, created } = await upsertDocumentRow({
      userId,
      docType: d.docType,
      title: d.title,
      body: d.body,
      sourceKind: d.sourceKind,
      sourceRef: d.sourceRef,
    });
    if (!created) continue;
    seededDocs++;
    const chunks = await chunkText(d.body);
    if (chunks.length) {
      await db.insert(knowledgeChunks).values(
        chunks.map((content, i) => ({
          userId,
          documentId: document.id,
          chunkIndex: i,
          content,
          tokenCount: estimateTokens(content),
        })),
      );
    }
  }

  await db.insert(ingestionJobs).values([
    {
      userId,
      kind: "github_file",
      dedupeKey: `demo:${taskTrackerRepo}:README.md`,
      payload: { repo: taskTrackerRepo, path: "README.md" },
      status: "pending",
    },
    {
      userId,
      kind: "github_file",
      dedupeKey: `demo:${notifyRepo}:README.md`,
      payload: { repo: notifyRepo, path: "README.md" },
      status: "done",
      startedAt: new Date(Date.now() - 60_000),
      finishedAt: new Date(),
    },
    {
      userId,
      kind: "github_commit",
      dedupeKey: `demo:${taskTrackerRepo}:a1b2c3d`,
      payload: { repo: taskTrackerRepo, sha: "a1b2c3d" },
      status: "done",
      startedAt: new Date(Date.now() - 120_000),
      finishedAt: new Date(Date.now() - 90_000),
    },
  ]);

  await db.insert(contextEvents).values({
    userId,
    kind: "learning_logged",
    payload: { note: "Sample context event for this demo account." },
  });

  const knowledgeNow = new Date();
  await db.insert(cronRuns).values([
    {
      userId,
      job: "knowledge-map",
      status: "ok",
      summary: `Sample run for this demo account — mapped ${seededDocs} documents.`,
      startedAt: new Date(knowledgeNow.getTime() - 30_000),
      finishedAt: knowledgeNow,
    },
    {
      userId,
      job: "knowledge-refresh",
      status: "ok",
      summary: "Sample run for this demo account — drained pending context events.",
      startedAt: new Date(knowledgeNow.getTime() - 15_000),
      finishedAt: knowledgeNow,
    },
  ]);

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
  const [exampleCorp, sampleStartup, demoPlatforms] = DEMO_APPLICATION_FOLDERS;
  const [app1] = await db
    .insert(jobApplications)
    .values({
      userId,
      dedupeKey: "example-corp|senior-backend-engineer",
      company: exampleCorp.company,
      role: exampleCorp.role,
      status: "applied",
      remoteKind: "remote",
      salaryLpa: 28,
      companyType: "product",
      replyLikelihood: 0.65,
      skillMatch: 0.8,
      bundleDir: demoBundleDir(exampleCorp),
    })
    .returning({ id: jobApplications.id });
  await db.insert(jobApplications).values([
    {
      userId,
      dedupeKey: "sample-startup-inc|founding-engineer",
      company: sampleStartup.company,
      role: sampleStartup.role,
      status: "draft",
      remoteKind: "remote",
      salaryLpa: 22,
      companyType: "product",
      replyLikelihood: 0.5,
      skillMatch: 0.7,
      bundleDir: demoBundleDir(sampleStartup),
    },
    {
      userId,
      dedupeKey: "demo-platforms-ltd|platform-engineer",
      company: demoPlatforms.company,
      role: demoPlatforms.role,
      status: "screening",
      remoteKind: "remote",
      salaryLpa: 25,
      companyType: "product",
      replyLikelihood: 0.6,
      skillMatch: 0.75,
      bundleDir: demoBundleDir(demoPlatforms),
    },
  ]);
  await db.insert(applicationTouchpoints).values({
    userId,
    applicationId: app1.id,
    kind: "submitted",
    channel: "portal",
    nextDueAt: new Date(Date.now() + 5 * 864e5),
  });
  await seedDemoApplicationFolders();

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
      status: "idea",
      title: "Sample idea: what breaks first when you skip container memory limits",
      hook: "A demo container without a memory limit taught me more about the OOM killer than any doc.",
      angle: "Walk through what actually happens (cgroup throttling → OOM kill) when a container has no memory ceiling set.",
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
      platform: "linkedin",
      status: "ready_for_review",
      title: "Sample draft: why exponential backoff for notification retries",
      hook: "A retry storm is just a self-inflicted outage with extra steps.",
      body: "Sample draft body for this demo account, ready for review. Covers why a fixed retry interval risks a thundering herd against a struggling downstream provider, and how exponential backoff plus a capped attempt count avoids it.",
    },
    {
      userId,
      platform: "linkedin",
      status: "approved",
      title: "Sample post: what per-team permissions actually have to enforce",
      hook: "A permission check that only lives in the UI isn't a permission check.",
      body: "Sample approved post body for this demo account, ready to publish manually. Covers why every mutation — not just the buttons that trigger it — has to re-check who's allowed to move or delete a card.",
    },
    {
      userId,
      platform: "linkedin",
      status: "published",
      title: "Sample post: What I learned building an event-driven notification service",
      hook: "Retries are easy. Idempotent retries are the actual problem.",
      body: "Sample published post body for this demo account.",
      isPublic: true,
    },
  ]);

  const portfolioCardSeed: {
    title: string;
    body: string;
    assetType: string;
    featureTitle: string;
  }[] = [
    {
      title: "Demo Task Tracker — drag-and-drop board",
      body: "Sample portfolio card caption for this demo account.",
      assetType: "screenshot",
      featureTitle: "Drag-and-drop board",
    },
    {
      title: "Demo Task Tracker — real-time sync",
      body: "Sample portfolio card caption for this demo account.",
      assetType: "diagram",
      featureTitle: "Real-time sync via WebSockets",
    },
    {
      title: "Demo Task Tracker — team permissions",
      body: "Sample portfolio card caption for this demo account.",
      assetType: "screenshot",
      featureTitle: "Team permissions",
    },
    {
      title: "Demo Notification Service — event queue consumer",
      body: "Sample portfolio card caption for this demo account.",
      assetType: "diagram",
      featureTitle: "Event queue consumer",
    },
    {
      title: "Demo Notification Service — retry with backoff",
      body: "Sample portfolio card caption for this demo account.",
      assetType: "screenshot",
      featureTitle: "Retry with backoff",
    },
  ];
  const insertedCards = await db
    .insert(contentItems)
    .values(
      portfolioCardSeed.map((c) => ({
        userId,
        platform: "portfolio" as const,
        status: "published" as const,
        title: c.title,
        body: c.body,
        assetType: c.assetType,
        isPublic: true,
      })),
    )
    .returning({ id: contentItems.id, title: contentItems.title });
  await db.insert(contentSources).values(
    insertedCards.map((c) => {
      const seed = portfolioCardSeed.find((s) => s.title === c.title)!;
      return {
        userId,
        contentItemId: c.id,
        sourceType: "project_feature" as const,
        sourceId: featureId(seed.featureTitle),
      };
    }),
  );

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
