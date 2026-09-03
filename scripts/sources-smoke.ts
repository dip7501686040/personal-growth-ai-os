export {}; // module scope

/**
 * P4 smoke test: source connectors → ingestion queue → extraction.
 *
 *   node --import tsx --env-file=.env.local scripts/sources-smoke.ts
 *
 * Verifies: a connected GitHub repo syncs README + commits into jobs and
 * advances its cursor SHA; a second sync with no new commits is a no-op;
 * a pasted doc and a synthetic ChatGPT export enqueue jobs; draining the
 * queue turns them into knowledge_documents.
 */

if (process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

const TEST_REPO = "sindresorhus/p-limit"; // small, public, real history

const CHATGPT_EXPORT = JSON.stringify([
  {
    title: "Rate limiting a queue",
    conversation_id: "smoke-conv-1",
    mapping: {
      a: {
        message: {
          author: { role: "user" },
          content: { content_type: "text", parts: ["How do I cap concurrency on a task queue in Node?"] },
          create_time: 1,
        },
      },
      b: {
        message: {
          author: { role: "assistant" },
          content: {
            content_type: "text",
            parts: [
              "Use a semaphore: keep a counter of in-flight tasks, and a waiting queue of resolvers. p-limit does exactly this — each call waits until a slot frees.",
            ],
          },
          create_time: 2,
        },
      },
    },
  },
  {
    title: "Postgres upsert patterns",
    conversation_id: "smoke-conv-2",
    mapping: {
      a: {
        message: {
          author: { role: "user" },
          content: { content_type: "text", parts: ["Best way to upsert in Postgres from Drizzle?"] },
          create_time: 1,
        },
      },
      b: {
        message: {
          author: { role: "assistant" },
          content: {
            content_type: "text",
            parts: [
              "INSERT ... ON CONFLICT (unique_cols) DO UPDATE SET ... — in Drizzle that's .onConflictDoUpdate({ target, set }). Use a partial unique index when the conflict is conditional.",
            ],
          },
          create_time: 2,
        },
      },
    },
  },
]);

async function main() {
  const { warmupDb, db } = await import("../src/lib/db/index.ts");
  const { sql } = await import("drizzle-orm");
  const { addSource, runSourceSync, ingestUpload } = await import(
    "../src/modules/ingestion/sources/index.ts"
  );
  const { countPendingJobs } = await import(
    "../src/modules/ingestion/queue.ts"
  );
  const { extractionAgent } = await import(
    "../src/modules/agents/extraction-agent.ts"
  );

  const userId = process.env.OWNER_USER_ID;
  if (!userId) throw new Error("set OWNER_USER_ID in .env.local");
  await warmupDb();

  const docCount = async (): Promise<number> => {
    const [r] = (await db.execute(
      sql`select count(*)::int as n from knowledge_documents where user_id = ${userId}`,
    )) as unknown as { n: number }[];
    return Number(r.n);
  };

  // ── GitHub ────────────────────────────────────────────────────────────
  const source = await addSource({
    userId,
    kind: "github_repo",
    externalRef: TEST_REPO,
  });
  console.log(`github source: ${source.externalRef} (${source.id})`);

  const s1 = await runSourceSync(userId, source.id);
  console.log(
    `sync #1: enqueued=${s1.enqueued} deduped=${s1.deduped} error=${s1.error ?? "-"}`,
  );
  if (s1.error) throw new Error(`GitHub sync failed: ${s1.error}`);
  if (s1.enqueued < 1) throw new Error("expected at least the README to enqueue");

  const [after1] = (await db.execute(
    sql`select last_cursor from ingestion_sources where id = ${source.id}`,
  )) as unknown as { last_cursor: string | null }[];
  console.log(`cursor after sync #1: ${after1.last_cursor?.slice(0, 12)}…`);
  if (!after1.last_cursor || after1.last_cursor.length < 20) {
    throw new Error("expected a commit SHA cursor");
  }

  const s2 = await runSourceSync(userId, source.id);
  console.log(
    `sync #2 (no-op expected): enqueued=${s2.enqueued} deduped=${s2.deduped}`,
  );
  if (s2.enqueued !== 0) {
    throw new Error("re-sync with no new commits should enqueue nothing");
  }

  // ── Uploads ───────────────────────────────────────────────────────────
  const u1 = await ingestUpload({
    userId,
    category: "doc",
    title: "P4 smoke — auth design",
    text: "We use short-lived access tokens (15 min) with refresh rotation. Refresh tokens are single-use and stored hashed. On reuse we revoke the whole family — a stolen refresh token is detectable.",
  });
  console.log(`upload doc: enqueued=${u1.enqueued} deduped=${u1.deduped}`);
  if (u1.enqueued !== 1) throw new Error("expected the pasted doc to enqueue once");

  const u1b = await ingestUpload({
    userId,
    category: "doc",
    title: "P4 smoke — auth design",
    text: "We use short-lived access tokens (15 min) with refresh rotation. Refresh tokens are single-use and stored hashed. On reuse we revoke the whole family — a stolen refresh token is detectable.",
  });
  console.log(`upload doc again: enqueued=${u1b.enqueued} deduped=${u1b.deduped}`);
  if (u1b.deduped !== 1) throw new Error("identical upload should dedupe");

  const u2 = await ingestUpload({
    userId,
    category: "chatgpt_export",
    title: "",
    text: CHATGPT_EXPORT,
  });
  console.log(`upload chatgpt: enqueued=${u2.enqueued} deduped=${u2.deduped}`);
  if (u2.enqueued < 2) throw new Error("expected 2 conversations to enqueue");

  // ── Drain a few jobs ──────────────────────────────────────────────────
  const before = await docCount();
  let processed = 0;
  for (let i = 0; i < 4; i++) {
    if ((await countPendingJobs(userId)) === 0) break;
    const run = await extractionAgent.run({ userId, trigger: "manual" });
    const res = run.result as { skipped?: boolean; documents?: number };
    if (res?.skipped) break;
    processed++;
    console.log(`  drained job ${processed}: ${res.documents ?? 0} docs`);
  }
  const after = await docCount();
  console.log(
    `drain: processed=${processed}, knowledge_documents ${before} -> ${after}, pending=${await countPendingJobs(userId)}`,
  );
  if (after <= before) throw new Error("draining produced no knowledge_documents");

  console.log("\nOK");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
