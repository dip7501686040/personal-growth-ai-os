/**
 * P1 smoke test: embeddings + knowledge store round-trip.
 *
 *   node --import tsx --env-file=.env.local scripts/knowledge-smoke.ts
 *
 * Verifies: embed() returns 768-dim vectors from the configured provider;
 * upsertDocument writes a doc + chunks + embeddings; a re-upsert of identical
 * content is a no-op; searchKnowledge ranks the relevant document first.
 */

export {}; // module scope — keep top-level names out of the global script scope

// Use the session pooler (see scripts/debug-agent.ts) — before "@/lib/db".
if (process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

async function main() {
  const { warmupDb } = await import("../src/lib/db/index.ts");
  const { embed, getEmbeddingProvider } = await import(
    "../src/lib/embeddings/index.ts"
  );
  const { upsertDocument, searchKnowledge } = await import(
    "../src/lib/knowledge/index.ts"
  );

  const userId = process.env.OWNER_USER_ID;
  if (!userId) throw new Error("set OWNER_USER_ID in .env.local");

  await warmupDb();

  const provider = getEmbeddingProvider();
  console.log(`embedding provider: ${provider.id} (${provider.dimensions}d)`);

  const [v] = await embed(["hello world"]);
  console.log(`embed() -> vector length ${v.length}`);
  if (v.length !== 768) throw new Error(`expected 768 dims, got ${v.length}`);

  const decision = {
    userId,
    docType: "decision",
    sourceKind: "internal",
    sourceRef: "smoke/decision-1",
    title: "Chose event sourcing for the notification service",
    body: "We adopted an event-sourced design for the notification service so delivery state (queued, sent, failed, retried) is an append-only log. It gives a full audit trail and lets us rebuild read models. Trade-off: more moving parts and eventual consistency on the projections.",
  };

  const a = await upsertDocument(decision);
  console.log(
    `doc A: created=${a.created} chunks=${a.chunks} id=${a.document.id}`,
  );

  const b = await upsertDocument({
    userId,
    docType: "learning",
    sourceKind: "internal",
    sourceRef: "smoke/learning-1",
    title: "Studied Tailwind CSS grid utilities",
    body: "Spent an hour on CSS grid via Tailwind: grid-cols, col-span, gap, responsive prefixes. Built a small dashboard layout to practice.",
  });
  console.log(`doc B: created=${b.created} chunks=${b.chunks}`);

  const again = await upsertDocument(decision);
  console.log(`doc A re-run: created=${again.created} (expect false)`);
  if (again.created) {
    throw new Error("re-upsert of identical content created a new row");
  }

  const hits = await searchKnowledge({
    userId,
    query: "why did we pick event sourcing for notifications",
    k: 3,
  });
  console.log("search hits:");
  for (const h of hits) {
    console.log(`  ${h.score.toFixed(4)}  [${h.docType}] ${h.title}`);
  }
  if (hits[0]?.documentId !== a.document.id) {
    throw new Error("expected the event-sourcing decision to rank #1");
  }

  console.log("\nOK");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
