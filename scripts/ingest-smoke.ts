export {}; // module scope

/**
 * P3 smoke test: ingestion queue → Extraction Agent (LangGraph) → structured
 * rows + knowledge base, and the context-events outbox → knowledge-refresh.
 *
 *   node --import tsx --env-file=.env.local scripts/ingest-smoke.ts
 *
 * Verifies: a queued doc job yields validated CanonicalKnowledge →
 * knowledge_documents + suggested skill_evidence; a same-content re-run is a
 * cache hit with no new document rows; logging a learning session records a
 * context_event that knowledge-refresh turns into a knowledge document.
 */

if (process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

const SAMPLE_DOC = `# platform-infra

Terraform + Kubernetes base for the AI notification platform.

## Decisions

- **Event sourcing for delivery state.** Every notification's lifecycle
  (queued, sent, failed, retried) is an append-only event. Read models are
  projected into Postgres. Rationale: a complete audit trail and the ability
  to rebuild projections after a bug. Trade-off: more moving parts and
  eventual consistency on the dashboards.
- **RabbitMQ for fan-out**, one queue per channel (email, SMS, push).

## What I learned

Projection lag is real: after a burst, the "sent today" counter can trail
by a few seconds. We added a freshness badge instead of pretending it was
instant.

## Stack

TypeScript, NestJS, PostgreSQL, RabbitMQ, Terraform, Kubernetes, GitHub Actions.
`;

async function main() {
  const { warmupDb, db } = await import("../src/lib/db/index.ts");
  const { sql } = await import("drizzle-orm");
  const { enqueueJob, countPendingJobs } = await import(
    "../src/modules/ingestion/queue.ts"
  );
  const { extractionAgent } = await import(
    "../src/modules/agents/extraction-agent.ts"
  );
  const { createLearningSession } = await import(
    "../src/modules/learning/service.ts"
  );
  const { drainContextEvents } = await import(
    "../src/modules/ingestion/refresh.ts"
  );

  const userId = process.env.OWNER_USER_ID;
  if (!userId) throw new Error("set OWNER_USER_ID in .env.local");
  await warmupDb();

  const docCount = async (): Promise<number> => {
    const [r] = await db.execute(
      sql`select count(*)::int as n from knowledge_documents where user_id = ${userId} and meta ? 'jobId'`,
    );
    return Number((r as { n: number }).n);
  };
  const cacheCount = async (): Promise<number> => {
    const [r] = await db.execute(sql`select count(*)::int as n from llm_cache`);
    return Number((r as { n: number }).n);
  };

  // ── 1. queue a doc + run extraction ────────────────────────────────────
  const payload = {
    text: SAMPLE_DOC,
    title: "platform-infra README",
    sourceKind: "upload",
    sourceRef: "ingest-smoke/platform-infra",
    evidenceSourceType: "local_doc",
  };
  const { deduped: d1 } = await enqueueJob({
    userId,
    kind: "upload_doc",
    dedupeKey: "ingest-smoke/job-1",
    payload,
  });
  console.log(`enqueue #1: deduped=${d1} (expect false on a fresh DB)`);

  const before1 = await docCount();
  const run1 = await extractionAgent.run({ userId, trigger: "manual" });
  const res1 = run1.result as {
    documents: number;
    skillSignals: number;
    projects: number;
    skipped?: boolean;
  };
  console.log(
    `run #1: status=${run1.status} skipped=${!!res1.skipped} docs=${res1.documents} skillSignals=${res1.skillSignals} projects=${res1.projects}`,
  );
  if (run1.status !== "completed") throw new Error("extraction run did not complete");
  if (res1.skipped) throw new Error("expected the queued job to be processed");
  const after1 = await docCount();
  if (after1 <= before1) throw new Error("no knowledge_documents were written");

  const [{ n: sugCount }] = await db.execute(
    sql`select count(*)::int as n from skill_evidence where user_id = ${userId} and status = 'suggested' and created_by = 'agent'`,
  ) as unknown as { n: number }[];
  console.log(`suggested skill_evidence (agent): ${sugCount}`);
  if (sugCount < 1) throw new Error("expected suggested skill_evidence rows");

  // ── 2. same content again → cache hit, no new document rows ─────────────
  const cacheBefore = await cacheCount();
  await enqueueJob({
    userId,
    kind: "upload_doc",
    dedupeKey: "ingest-smoke/job-2",
    payload, // identical text/title/sourceKind → identical extraction prompt
  });
  const docsBefore2 = await docCount();
  const run2 = await extractionAgent.run({ userId, trigger: "manual" });
  const docsAfter2 = await docCount();
  const cacheAfter = await cacheCount();
  console.log(
    `run #2: status=${run2.status} · knowledge_documents ${docsBefore2} -> ${docsAfter2} (expect equal) · llm_cache ${cacheBefore} -> ${cacheAfter}`,
  );
  if (docsAfter2 !== docsBefore2) {
    throw new Error("re-running identical content created new document rows");
  }

  // ── 3. outbox: a learning session → context_event → knowledge doc ──────
  const session = await createLearningSession(userId, {
    topic: "Ingestion smoke: studied projection lag",
    category: "technology",
    description: "How eventual consistency shows up in read-model dashboards.",
    notes: "Freshness badge > fake-instant counters.",
  });
  const r = await drainContextEvents(userId);
  console.log(
    `knowledge-refresh: processed=${r.processed} documents=${r.documents} chunks=${r.chunks}`,
  );
  const [{ n: sessionDoc }] = await db.execute(
    sql`select count(*)::int as n from knowledge_documents where user_id = ${userId} and source_ref = ${"learning_session:" + session.id}`,
  ) as unknown as { n: number }[];
  if (sessionDoc !== 1) {
    throw new Error("knowledge-refresh did not create a doc for the learning session");
  }

  const again = await drainContextEvents(userId);
  console.log(`knowledge-refresh again: processed=${again.processed} (expect 0)`);
  if (again.processed !== 0) throw new Error("outbox rows were not marked processed");

  console.log("\nremaining pending jobs:", await countPendingJobs(userId));
  console.log("OK");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
