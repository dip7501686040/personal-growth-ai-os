export {};
process.env.DATABASE_URL = process.env.DIRECT_URL;

/**
 * Phase 4 backfill: run cross-source duplicate detection over the EXISTING
 * corpus, not just newly created documents. Processes newest-first so that,
 * within any cluster of near-duplicate documents, the oldest one is always
 * the survivor and everything newer gets superseded — mirrors the live
 * behavior, where a brand-new document is always the one checked against
 * (and possibly marked a duplicate of) what already exists.
 *
 * Run: node --env-file=.env.local --import tsx scripts/knowledge-dedupe-backfill.ts
 */
async function main() {
  const { getOwnerUserId } = await import("@/lib/owner");
  const { db } = await import("@/lib/db");
  const { knowledgeDocuments } = await import("@/lib/db/schema");
  const { and, desc, eq, isNull } = await import("drizzle-orm");
  const { checkCrossSourceDuplicate } = await import("@/lib/knowledge");

  const userId = await getOwnerUserId();

  const docs = await db
    .select({
      id: knowledgeDocuments.id,
      title: knowledgeDocuments.title,
      sourceKind: knowledgeDocuments.sourceKind,
    })
    .from(knowledgeDocuments)
    .where(
      and(
        eq(knowledgeDocuments.userId, userId),
        isNull(knowledgeDocuments.supersededAt),
      ),
    )
    .orderBy(desc(knowledgeDocuments.createdAt));

  console.log(`Checking ${docs.length} document(s), newest first...`);
  let superseded = 0;
  for (const d of docs) {
    const duplicateOf = await checkCrossSourceDuplicate(userId, d.id);
    if (duplicateOf) {
      superseded++;
      console.log(
        `  SUPERSEDED  [${d.sourceKind}] "${d.title.slice(0, 45)}"  →  duplicate of ${duplicateOf}`,
      );
    }
  }

  console.log(`\nDone: ${superseded}/${docs.length} document(s) superseded as cross-source duplicates.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
