export {};
process.env.DATABASE_URL = process.env.DIRECT_URL;

/**
 * K1 backfill: seed the knowledge_taxonomy rows (+ their centroid embeddings),
 * then embed every knowledge_links target entity (skills, projects, career
 * opportunities, content items, business opportunities, learning sessions,
 * dsa patterns) for the owner user.
 *
 * Run: node --env-file=.env.local --import tsx scripts/knowledge-k1-backfill.ts
 */
async function main() {
  const { getOwnerUserId } = await import("@/lib/owner");
  const { seedTaxonomy, TAXONOMY } = await import("@/modules/knowledge/taxonomy");
  const { backfillEntityEmbeddings } = await import(
    "@/modules/knowledge/entities"
  );

  console.log(`Seeding ${TAXONOMY.length} taxonomy tags + centroids...`);
  await seedTaxonomy();
  console.log("  done.");

  const userId = await getOwnerUserId();
  console.log(`Backfilling entity embeddings for user ${userId}...`);
  const results = await backfillEntityEmbeddings(userId);
  for (const r of results) {
    console.log(`  ${r.type}: ${r.embedded}/${r.total} embedded`);
  }
  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
