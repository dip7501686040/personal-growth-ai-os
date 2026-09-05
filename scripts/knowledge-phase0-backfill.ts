export {};
process.env.DATABASE_URL = process.env.DIRECT_URL;

/**
 * Phase 0 backfill: clean up the removed `dsa_pattern`/`project` link targets,
 * embed the new `project_feature` targets, and re-map every current document
 * so project features pick up their first links.
 *
 * Run: node --env-file=.env.local --import tsx scripts/knowledge-phase0-backfill.ts
 */
async function main() {
  const { getOwnerUserId } = await import("@/lib/owner");
  const { db } = await import("@/lib/db");
  const { knowledgeDocuments, knowledgeLinks, entityEmbeddings } = await import(
    "@/lib/db/schema"
  );
  const { and, eq, inArray, isNull } = await import("drizzle-orm");
  const { backfillEntityEmbeddings } = await import(
    "@/modules/knowledge/entities"
  );
  const { mapDocument, getSkillDepth, getProjectFeatureDepth } = await import(
    "@/modules/knowledge/mapping"
  );

  const userId = await getOwnerUserId();
  const legacy = ["dsa_pattern", "project"] as const;

  console.log("Deleting legacy knowledge_links / entity_embeddings rows...");
  const deletedLinks = await db
    .delete(knowledgeLinks)
    .where(
      and(eq(knowledgeLinks.userId, userId), inArray(knowledgeLinks.targetType, legacy)),
    )
    .returning({ id: knowledgeLinks.id });
  const deletedEmbeddings = await db
    .delete(entityEmbeddings)
    .where(
      and(
        eq(entityEmbeddings.userId, userId),
        inArray(entityEmbeddings.targetType, legacy),
      ),
    )
    .returning({ id: entityEmbeddings.id });
  console.log(
    `  removed ${deletedLinks.length} link(s), ${deletedEmbeddings.length} embedding(s)`,
  );

  console.log("\nEmbedding entities (now includes project_feature)...");
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
  for (const d of docs) {
    const r = await mapDocument(userId, d.id);
    totalInserted += r.inserted;
    totalAccepted += r.autoAccepted;
    if (r.inserted > 0) {
      console.log(`  ${d.title.slice(0, 50).padEnd(50)} +${r.inserted} link(s) (${r.autoAccepted} auto)`);
    }
  }
  console.log(
    `\nTotal: ${totalInserted} new link(s) (${totalAccepted} auto-accepted) across ${docs.length} doc(s).`,
  );

  console.log("\nTop skill depth:");
  const skillDepth = await getSkillDepth(userId);
  for (const s of skillDepth.filter((s) => s.depth > 0).slice(0, 10)) {
    console.log(
      `  ${s.depth.toFixed(2).padStart(6)}  ${s.name.padEnd(24)} level=${s.level.padEnd(11)} links=${s.linkCount}`,
    );
  }

  console.log("\nTop project-feature depth:");
  const featureDepth = await getProjectFeatureDepth(userId);
  for (const f of featureDepth.filter((f) => f.depth > 0).slice(0, 10)) {
    console.log(
      `  ${f.depth.toFixed(2).padStart(6)}  ${f.title.slice(0, 30).padEnd(30)} (${f.projectName}, ${f.status}) links=${f.linkCount}`,
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
