export {}; // module scope

/**
 * Retrieval eval: seed a fixture knowledge set, then check that each query
 * surfaces the right document at rank 1 (rank ≤ 2 is a soft pass).
 *
 *   node --import tsx --env-file=.env.local scripts/retrieval-eval.ts
 */

if (process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

const FIXTURES: { id: string; docType: string; title: string; body: string }[] = [
  {
    id: "eval/event-sourcing",
    docType: "decision",
    title: "Event sourcing for notification delivery state",
    body: "We store each notification's lifecycle (queued, sent, failed, retried) as an append-only event log and project read models into Postgres. This gives a full audit trail and lets projections be rebuilt after a bug. The cost is more moving parts and eventual consistency on dashboards.",
  },
  {
    id: "eval/rate-limiting",
    docType: "concept",
    title: "Token-bucket rate limiting at the API gateway",
    body: "The gateway enforces per-tenant limits with a token bucket in Redis: refill rate = requests/second, burst = bucket size. On empty bucket we return 429 with Retry-After. Chosen over a fixed window to avoid boundary bursts.",
  },
  {
    id: "eval/pg-indexing",
    docType: "learning",
    title: "Composite indexes and index-only scans in Postgres",
    body: "Learned that column order in a composite index matters: put equality predicates first, range last. An index that covers every selected column enables an index-only scan and skips the heap. Watched EXPLAIN (ANALYZE, BUFFERS) to confirm.",
  },
  {
    id: "eval/k8s-probes",
    docType: "repo_summary",
    title: "platform-infra — Kubernetes readiness vs liveness probes",
    body: "Readiness gates traffic; liveness restarts the pod. We set readiness to check DB connectivity and the message-queue connection, but liveness only checks the process is responsive — a DB blip should drain traffic, not kill the pod.",
  },
  {
    id: "eval/react-debounce",
    docType: "learning",
    title: "Debouncing input in React with a ref",
    body: "Keep the timer id in a useRef so re-renders don't reset it; clear and reset it on each keystroke, and clear it on unmount. A useState timer causes an extra render per keystroke.",
  },
  {
    id: "eval/llm-caching",
    docType: "decision",
    title: "Cache LLM responses by a hash of the full prompt",
    body: "Agent calls are cached in llm_cache keyed by sha256(provider + model + system + prompt + schema). Identical context yields an identical prompt string, so re-running an agent on unchanged data is free.",
  },
];

const QUERIES: { q: string; expectId: string }[] = [
  { q: "why did we choose an append-only log for delivery state", expectId: "eval/event-sourcing" },
  { q: "how are per-tenant API request limits enforced", expectId: "eval/rate-limiting" },
  { q: "does column order in a multi-column postgres index matter", expectId: "eval/pg-indexing" },
  { q: "should a database outage restart the kubernetes pod", expectId: "eval/k8s-probes" },
  { q: "debounce a text input without an extra render", expectId: "eval/react-debounce" },
  { q: "how is the agent response cache keyed", expectId: "eval/llm-caching" },
];

async function main() {
  const { warmupDb } = await import("../src/lib/db/index.ts");
  const { upsertDocument, searchKnowledge } = await import(
    "../src/lib/knowledge/index.ts"
  );

  const userId = process.env.OWNER_USER_ID;
  if (!userId) throw new Error("set OWNER_USER_ID in .env.local");
  await warmupDb();

  for (const f of FIXTURES) {
    await upsertDocument({
      userId,
      docType: f.docType,
      sourceKind: "internal",
      sourceRef: f.id,
      title: f.title,
      body: f.body,
    });
  }
  console.log(`seeded ${FIXTURES.length} fixtures\n`);

  let top1 = 0;
  let top2 = 0;
  for (const { q, expectId } of QUERIES) {
    const hits = await searchKnowledge({ userId, query: q, k: 5 });
    const rank =
      hits.findIndex((h) => h.sourceRef === expectId) + 1 || 99;
    const mark = rank === 1 ? "PASS" : rank <= 2 ? "soft" : "MISS";
    if (rank === 1) top1++;
    if (rank <= 2) top2++;
    console.log(
      `[${mark}] rank ${rank === 99 ? "-" : rank}  «${q}»  → ${hits[0]?.title ?? "(nothing)"}`,
    );
  }

  console.log(
    `\ntop-1: ${top1}/${QUERIES.length}   top-2: ${top2}/${QUERIES.length}`,
  );
  if (top2 < QUERIES.length) {
    throw new Error("some queries did not surface the expected doc in the top 2");
  }
  console.log("OK");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
