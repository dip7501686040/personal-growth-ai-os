export {};
process.env.DATABASE_URL = process.env.DIRECT_URL;

/**
 * K2 backfill: refresh entity embeddings (in case skills/projects/... changed
 * since K1), then map every current knowledge document to its candidate
 * skills/projects/learning sessions/etc, persisting knowledge_links + tags.
 *
 * Run: node --env-file=.env.local --import tsx scripts/knowledge-k2-backfill.ts
 */
async function main() {
  const { getOwnerUserId } = await import("@/lib/owner");
  const { db } = await import("@/lib/db");
  const { knowledgeDocuments } = await import("@/lib/db/schema");
  const { and, eq, isNull } = await import("drizzle-orm");
  const { backfillEntityEmbeddings } = await import(
    "@/modules/knowledge/entities"
  );
  const { mapDocument } = await import("@/modules/knowledge/mapping");

  const userId = await getOwnerUserId();

  console.log("Refreshing entity embeddings...");
  const er = await backfillEntityEmbeddings(userId);
  for (const r of er) console.log(`  ${r.type}: ${r.embedded}/${r.total} embedded`);

  const docs = await db
    .select({ id: knowledgeDocuments.id, title: knowledgeDocuments.title })
    .from(knowledgeDocuments)
    .where(
      and(
        eq(knowledgeDocuments.userId, userId),
        isNull(knowledgeDocuments.supersededAt),
      ),
    );

  console.log(`\nMapping ${docs.length} document(s)...`);
  let totalInserted = 0;
  let totalAccepted = 0;
  let totalTags = 0;
  for (const d of docs) {
    const r = await mapDocument(userId, d.id);
    totalInserted += r.inserted;
    totalAccepted += r.autoAccepted;
    totalTags += r.tags;
    console.log(
      `  ${d.title.slice(0, 48).padEnd(48)} +${r.inserted} link(s) (${r.autoAccepted} auto) · ${r.tags} tag(s)`,
    );
  }

  console.log(
    `\nTotal: ${totalInserted} link(s) (${totalAccepted} auto-accepted), ${totalTags} tag(s) across ${docs.length} doc(s).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
